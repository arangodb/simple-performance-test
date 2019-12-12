/*jshint globalstrict:false, strict:false */
/*global print */

const batchSize = 5000;
const db = require("@arangodb").db;
const internal = require("internal");
const time = internal.time;

const tearDown = (show_topic = true) => {
  if (show_topic) {
    print("global teardown oneshard");
  }

  print("dropping search");
  db._dropView("search");

  [ "users", "usersGraph", "products", "orders", "ordersGraph" ].forEach(
    (name) => {
      print("dropping" + name);
     db._drop(name);
    }
  );
};

const setup = (options) => {
  let scale = options.scale;
  let numberOfShards = options.numberOfShards;
  let replicationFactor = options.replicationFactor;
  print("global setup oneshard - scale: " + scale);

  require("@arangodb/aql/queries").properties({ slowQueryThreshold: 999999999999 });
  tearDown(false);


  print("create users");
  let docs = [];
  db._create("users", { numberOfShards, replicationFactor: 1 });
  for (let i = 0; i < 1 * scale; ++i) {
    docs.push({
      _key: "user" + i,
      name: "User testmann " + i,
      active: (i % 83) !== 0
    });

    if (docs.length === batchSize) {
      db.users.insert(docs);
      docs = [];
    }
  }


  print("create usersGraph");
  docs = [];
  db._createEdgeCollection("usersGraph", { numberOfShards, replicationFactor: 1 });
  let f = { from: 0, to: 0, base: db.users.count() };

  for (let i = 0; i < 10 * scale; ++i) {
    f.from += 31;
    f.to += 131;
    docs.push({
      _from: "users/user" + (f.from % f.base),
      _to: "users/user" + (f.to % f.base)
    });

    if (docs.length === batchSize) {
      db.usersGraph.insert(docs);
      docs = [];
    }
  }


  print("create products");
  docs = [];
  db._create("products", { numberOfShards, replicationFactor: 1 });
  for (let i = 0; i < 10 * scale; ++i) {
    docs.push({
      _key: "product" + i,
      name: "Product testmann" + i,
      description: "Product testmann" + i,
      category: "category" + (i % 111)
    });

    if (docs.length === batchSize) {
      db.products.insert(docs);
      docs = [];
    }
  }
  db.products.ensureIndex({ type: "hash", fields: ["category"] });


  print("create orders");
  docs = [];
  db._create("orders", { numberOfShards, replicationFactor: 1 });

  let u = { current: 0, base: db.users.count() };
  let p = { current: 0, base: db.products.count() };
  let dt = 1572965645450;

  for (let i = 0; i < 100 * scale; ++i) {
    u.current += 31;
    p.current += 73;

    let doc = {
      user: "user" + (u.current % u.base),
      product: "product" + (p.current % p.base),
      amount: i % 7,
      dt: new Date(dt - i * 1000).toISOString(),
      canceled: (i % 7) === 0
    };
    docs.push(doc);

    if (docs.length === batchSize) {
      db.orders.insert(docs);
      docs = [];
    }
  }

  print("create ordersGraph");

  db._createEdgeCollection("ordersGraph", { numberOfShards, replicationFactor: 1 });
  u = { current: 0, base: db.users.count() };
  p = { current: 0, base: db.products.count() };
  dt = 1572965645450;

  for (let i = 0; i < 100 * scale; ++i) {
    u.current += 31;
    p.current += 73;

    let doc = {
      _from: "users/user" + (u.current % u.base),
      _to: "products/product" + (p.current % p.base),
      amount: i % 7,
      dt: new Date(dt - i * 1000).toISOString(),
      canceled: (i % 7) === 0
    };
    docs.push(doc);

    if (docs.length === batchSize) {
      db.ordersGraph.insert(docs);
      docs = [];
    }
  }
  db.orders.ensureIndex({ type: "hash", fields: ["user", "dt"] });
  db.orders.ensureIndex({ type: "hash", fields: ["product", "dt"] });


  print("create view");
  docs = [];
  db._createView("search", "arangosearch", {});
  let v = db._view("search");
  v.properties({
    links: {
      products: { includeAllFields: true, analyzers: ["text_en"] },
      orders: { includeAllFields: true, analyzers: ["text_en"] }
    }
  });

  /* make sure view is populated */
  db._query("FOR doc IN search SEARCH doc.category == 'category1' OPTIONS { waitForSync: true } RETURN 1", null, { silent: true });

  print("setup done");
}; // setup - end


let testFunction1 = (params) => { db._query(params.query, null, {silent: true}); };

let testCases1 = [
  {
    "name" : "filter-active",
    "params" : {
      "query" : `FOR u IN users FILTER u.active == true
                   RETURN u.name
                `,
    }
  },
  {
    "name" : "filter-category",
    "params" : {
      "query" : `FOR p IN products FILTER p.category IN ['category1', 'category10', 'category12', 'category42'] SORT p.name
                   RETURN p
                `,
    }
  },
  {
    "name" : "product-orders",
    "params" : {
      "query" : `FOR p IN products FILTER p._key == 'product9854'
                   FOR o IN orders FILTER o.product == p._key
                     RETURN { p, o }
                `,
    }
  },
  {
    "name" : "category-orders-date",
    "params" : {
      "query" : `FOR p IN products FILTER p.category == 'category23'
                   FOR o IN orders FILTER o.product == p._key
                                   FILTER o.dt >= '2019-11-01T00:00:00'
                     RETURN { p, o }
                `,
    }
  },
  {
    "name" : "category-orders-user-date",
    "params" : {
      "query" : `FOR p IN products FILTER p.category == 'category23'
                   FOR o IN orders FILTER o.product == p._key FILTER o.dt >= '2019-11-01T00:00:00'
                     FOR u IN users FILTER o.user == u._key
                       RETURN { p, o, u }
                `,
    }
  },
  {
    "name" : "orders-by-category",
    "params" : {
      "query" : `FOR o IN orders FILTER o.canceled == false
                                 FILTER o.dt >= '2019-11-01T00:00:00'
                   FOR p IN products FILTER o.product == p._key
                     COLLECT category = p.category WITH COUNT INTO count
                     RETURN { category, count }
                `,
    }
  },
  {
    "name" : "orders-by-user",
    "params" : {
      "query" : `FOR o IN orders FOR u IN users FILTER o.user == u._key
                                                FILTER o.dt >= '2019-11-01T00:00:00'
                                                FILTER u.active == false
                   COLLECT user = u._key AGGREGATE total = SUM(o.amount) SORT null
                   RETURN { user, total }
                `,
    }
  },
  {
    "name" : "traverse-4",
    "params" : {
      "query" : `WITH users FOR v, e IN 0..4 OUTBOUND 'users/user1' usersGraph
                   RETURN { v, e }
                `,
    }
  },
  {
    "name" : "traverse-inactive",
    "params" : {
      "query" : `WITH users FOR u IN users FILTER u.active == false
                 FOR v, e IN 1..2 OUTBOUND u._id usersGraph
                   RETURN v
                `,
    }
  },
  {
    "name" : "traverse-single-user",
    "params" : {
      "query" : `WITH users, products FOR u IN users FILTER u._key == 'user5994'
                 FOR v, e IN 1..1 OUTBOUND u._id ordersGraph
                   RETURN v.description
                `,
    }
  },
/* // needs 500 seconds to run - disabling for now
  {
    "name" : "shortest-path",
    "params" : {
      "query" : `WITH users FOR u IN users FILTER u.active == false
                   LET p = (
                     FOR v IN OUTBOUND SHORTEST_PATH u._id TO 'users/user83' usersGraph
                       RETURN v
                   )
                   FILTER LENGTH(p) > 0 LIMIT 50
                     RETURN { u, p }
                `,
    }
  },
*/
  {
    "name" : "subqueries",
    "params" : {
      "query" : `FOR u IN users FILTER u.active == false
                   LET count = (
                     FOR o IN orders FILTER o.user == u._key
                       COLLECT WITH COUNT INTO count
                       RETURN count
                   )[0]
                   COLLECT AGGREGATE sum = SUM(count)
                   RETURN sum
                `,
    }
  },
  {
    "name" : "orders-by-year",
    "params" : {
      "query" : `FOR o IN orders FILTER o.canceled == false COLLECT year = SUBSTRING(o.dt, 0, 4)
                   AGGREGATE amount = SUM(o.amount)
                   RETURN { year, amount }
                `,
    }
  },
  {
    "name" : "orders-user",
    "params" : {
      "query" : `FOR o IN ordersGraph FILTER o._from == 'users/user1'
                   RETURN o._to
                `,
    }
  },
  {
    "name" : "search",
    "params" : {
      "query" : `FOR doc IN search SEARCH ANALYZER(STARTS_WITH(doc.description, 'testmann1234'), 'text_en') ||
                                          ANALYZER(STARTS_WITH(doc.description, 'testmann2345'), 'text_en') ||
                                          ANALYZER(STARTS_WITH(doc.description, 'testmann3333'), 'text_en') ||
                                          ANALYZER(STARTS_WITH(doc.description, 'testmann412'), 'text_en') ||
                                          ANALYZER(STARTS_WITH(doc.description, 'testmann509'), 'text_en')
                                          SORT BM25(doc)
                 RETURN doc
                `,
    }
  }
];

testCases1.forEach((desc) => {
  desc.params.func = testFunction1;
});

let testCases2 = [
  {
    "name" : "insert",
    "params" : {
      func :
      function(params) {
        let c = db._collection("testmann");
        for (let i = 0; i < params.scale / 100; ++i) {
          c.insert({ _key: "testmann" + i, value1: i, value2: "testmann" + i });
        }
      }
    } //params
  },
  {
    "name" : "insert-batch",
    "params" : {
      func : (params) => {
        let docs = [];
        let c = db._collection("testmann");
        for (let i = 0; i < params.scale; ++i) {
          docs.push({ _key: "testmann" + i, value1: i, value2: "testmann" + i });
          if (docs.length === batchSize) {
            c.insert(docs);
            docs = [];
          }
        }
      },
    } // params
  },
  {
    "name" : "insert-aql",
    "params" : {
      func : function(params) {
        db._query(`FOR i IN 0..${params.scale - 1}
                     INSERT { _key: CONCAT('testmann', i), value1: i, value2: CONCAT('testmann', i) } INTO testmann
                  `);
      }
    } // params
  },
  {
    "name" : "update-aql-indexed",
    "params" : {
      func : function(c) {
        db._query(`FOR o IN orders FILTER o.product == 'product235'
                                   FILTER o.canceled == true
                     UPDATE o WITH { fulfilled: false } IN orders
                  `);
      }
    } // params
  },
  {
    "name" : "update-aql-noindex",
    "params" : {
      func : function(c) {
        db._query(`FOR o IN orders FILTER o.dt >= '2019-11-01T00:00:00'
                                   FILTER o.dt < '2019-11-02'
                                   FILTER o.canceled == true
                     UPDATE o WITH { fulfilled: false } IN orders
                  `);
      }
    } // params
  },
];


module.exports.setup = setup;
module.exports.tearDown = tearDown;
module.exports.testCases1 = testCases1;
module.exports.testCases2 = testCases2;
