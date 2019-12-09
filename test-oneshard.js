/* 1 for one shard, 1 or 9 for regular cluster */
let numberOfShards = 1;

/* 1000 * 1000: creates 1M users, 10M products, 100M orders */
/*  100 * 1000: creates 100k users, 1M products, 10M orders */
let scale = 100 * 1000;

/* replication factor used for write operations */
let replicationFactor = 3;

/* number of executions for each test */
let numExecutions = 3;

const batchSize = 5000;

const db = require("@arangodb").db;
const internal = require("internal");
const time = internal.time;
const print = internal.print;

require("@arangodb/aql/queries").properties({ slowQueryThreshold: 999999999999 });

db._dropView("search");
db._drop("users");
db._drop("usersGraph");
db._drop("products");
db._drop("orders");
db._drop("ordersGraph");

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

docs = [];
db._create("orders", { numberOfShards, replicationFactor: 1 });
db._createEdgeCollection("ordersGraph", { numberOfShards, replicationFactor: 1 });

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


















let queries = {
  "filter-active": `FOR u IN users FILTER u.active == true RETURN u.name`,
  "filter-category": `FOR p IN products FILTER p.category IN ['category1', 'category10', 'category12', 'category42'] SORT p.name RETURN p`,
  "product-orders": `FOR p IN products FILTER p._key == 'product9854' FOR o IN orders FILTER o.product == p._key RETURN { p, o }`,
  "category-orders-date": `FOR p IN products FILTER p.category == 'category23' FOR o IN orders FILTER o.product == p._key FILTER o.dt >= '2019-11-01T00:00:00' RETURN { p, o }`,
  "category-orders-user-date": `FOR p IN products FILTER p.category == 'category23' FOR o IN orders FILTER o.product == p._key FILTER o.dt >= '2019-11-01T00:00:00' FOR u IN users FILTER o.user == u._key RETURN { p, o, u }`,
  "orders-by-category": `FOR o IN orders FILTER o.canceled == false FILTER o.dt >= '2019-11-01T00:00:00' FOR p IN products FILTER o.product == p._key COLLECT category = p.category WITH COUNT INTO count RETURN { category, count }`,
  "orders-by-user": `FOR o IN orders FOR u IN users FILTER o.user == u._key FILTER o.dt >= '2019-11-01T00:00:00' FILTER u.active == false COLLECT user = u._key AGGREGATE total = SUM(o.amount) SORT null RETURN { user, total }`,
  "traverse-4": `WITH users FOR v, e IN 0..4 OUTBOUND 'users/user1' usersGraph RETURN { v, e }`,
  "traverse-inactive": `WITH users FOR u IN users FILTER u.active == false FOR v, e IN 1..2 OUTBOUND u._id usersGraph RETURN v`,
  "traverse-single-user": `WITH users, products FOR u IN users FILTER u._key == 'user5994' FOR v, e IN 1..1 OUTBOUND u._id ordersGraph RETURN v.description`,
  "shortest-path": `WITH users FOR u IN users FILTER u.active == false LET p = (FOR v IN OUTBOUND SHORTEST_PATH u._id TO 'users/user83' usersGraph RETURN v) FILTER LENGTH(p) > 0 LIMIT 50 RETURN { u, p }`,
  "subqueries": `FOR u IN users FILTER u.active == false LET count = (FOR o IN orders FILTER o.user == u._key COLLECT WITH COUNT INTO count RETURN count)[0] COLLECT AGGREGATE sum = SUM(count) RETURN sum`,
  "orders-by-year": `FOR o IN orders FILTER o.canceled == false COLLECT year = SUBSTRING(o.dt, 0, 4) AGGREGATE amount = SUM(o.amount) RETURN { year, amount }`,
  "orders-user": `FOR o IN ordersGraph FILTER o._from == 'users/user1' RETURN o._to`,
  "search": `FOR doc IN search SEARCH ANALYZER(STARTS_WITH(doc.description, 'testmann1234'), 'text_en') || ANALYZER(STARTS_WITH(doc.description, 'testmann2345'), 'text_en') || ANALYZER(STARTS_WITH(doc.description, 'testmann3333'), 'text_en') || ANALYZER(STARTS_WITH(doc.description, 'testmann412'), 'text_en') || ANALYZER(STARTS_WITH(doc.description, 'testmann509'), 'text_en') SORT BM25(doc) RETURN doc`,
};




Object.keys(queries).forEach(function(name) {
  let q = queries[name];
  db._query(q); /* warmup */

  require("internal").wait(1, true); /* gc */

  let s = time();
  for (let i = 0; i < numExecutions; ++i) {
    db._query(q, null, {silent: true});
  }
  s = (time() - s) / numExecutions;

  let value = s.toFixed(4);
  print(Array(12 - value.length).join(" ") + value + " s   " + name);
});




let testsCases = [
  {
    "name" : "insert",
    "params" : { func : function(c) {
    for (let i = 0; i < scale / 100; ++i) {
      c.insert({ _key: "testmann" + i, value1: i, value2: "testmann" + i });
    }}
  },
  {
    "name" : "insert-batch",
    "params" : { func : function(c) {
      let docs = [];
      for (let i = 0; i < scale; ++i) {
        docs.push({ _key: "testmann" + i, value1: i, value2: "testmann" + i });
        if (docs.length === batchSize) {
          c.insert(docs);
          docs = [];
        }
      }
    },
  },
  {
    "name" : "insert-aql",
    "params" : { func : function(c) {
      db._query(`FOR i IN 0..${scale - 1} INSERT { _key: CONCAT('testmann', i), value1: i, value2: CONCAT('testmann', i) } INTO ` + c.name());
    },
  },
  {
    "name" : "update-aql-indexed",
    "params" : { func : function(c) {
    "update-aql-indexed": function(c) {
      db._query(`FOR o IN orders FILTER o.product == 'product235' FILTER o.canceled == true UPDATE o WITH { fulfilled: false } IN orders`);
    },
  },
  {
    "name" : "update-aql-noindex",
    "params" : { func : function(c) {
      db._query(`FOR o IN orders FILTER o.dt >= '2019-11-01T00:00:00' FILTER o.dt < '2019-11-02' FILTER o.canceled == true UPDATE o WITH { fulfilled: false } IN orders`);
    },
  },
];


let runOneshardTest = function(name, cb) {
  let value = 0;
  for (let i = 0; i < numExecutions; ++i) {
    db._drop("testmann");
    let c = db._create("testmann", { numberOfShards, replicationFactor });

    internal.wait(1, true);

    let s = time();
    cb(c);
    value += time() - s;
  }
  value /= numExecutions;
  value = value.toFixed(4);
  print(Array(12 - value.length).join(" ") + value + " s   " + name);
};


Object.keys(tests).forEach(function(t) {
  test(t.name, tests.parms.func);
});
