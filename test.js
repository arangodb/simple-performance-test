(function(){

"use strict";

var silent = true;

var testRunner = function (tests, options) {
  var internal = require("internal"),
      time = internal.time,
      print = internal.print;

  var calc = function (values , options) {
    var sum = function (values) {
      return values.reduce(function (previous, current) {
        return previous + current;
      });
    };
    values.sort(function(a, b) { return a - b; });
    var removeFromResult = parseInt(options.removeFromResult) || 0;
    if (removeFromResult > 0) {
        values.splice(values.length - 1, removeFromResult); //remove last
        values.splice(0, removeFromResult); //remove first
    }

    var n = values.length;
    var result = {
      min: values[0],
      max: values[n - 1],
      sum: sum(values),
      avg: sum(values) / n,
      med: ( n%2 ? ((values[(n-1)/2] + values[(n+1)/2])/2) : values[n/2]),
      dev: (values[n - 1] - values[0]) / (sum(values) / n)
    };
    return result;
  };

  var buildParams = function (test, collection) {
    var params = test.params;
    params.collection = collection.name;
    return params;
  };

  var measure = function (test, collection, options) {
    var timedExecution = function (test, collection) {
      var params = buildParams(test, collection);

      var start = time();
      if (typeof params.setupEachCall === "function") {
        params.setupEachCall(params);
      }
      test.params.func(params);
      var end =  time();
      if (typeof params.teardownEachCall === "function") {
        params.teardownEachCall(params);
      }
      return end - start;
    };

    var results = [ ];
    internal.wait(1, true);

    for (var i = 0; i < options.runs + 1; ++i) {
      var params = buildParams(test, collection);

      if (typeof params.setup === "function") {
        params.setup(params);
      }
      else if (typeof options.setup === "function") {
        options.setup(params);
      }

      if (i === 0) {
        print("- warmup");
        timedExecution(test, collection);
        timedExecution(test, collection);
      } else {
        print("- run " + i);
        var duration = timedExecution(test, collection);
        print("- took: " + duration + " s");
        results.push(duration);
      }

      if (typeof params.teardown === "function") {
        params.teardown(params);
      }
      else if (typeof options.teardown === "function") {
        options.teardown(test.params);
      }
    }

    return results;
  };

  var run = function (tests, options) {
    var pad = function (s, l, type) {
      if (s.length >= l) {
        return s.substr(0, l);
      }
      if (type === "right") {
        return s + Array(l - s.length).join(" ");
      }
      return Array(l - s.length).join(" ") + s;
    };
    var out = [ ];

    var headLength = 30,
        collectionLength = 12,
        runsLength = 8,
        cellLength = 12,
        sep = " | ",
        lineLength = headLength + runsLength + 6 * cellLength + 6 * sep.length - 1;

    out.push(pad("test name", headLength, "right") + sep +
             pad("collection", collectionLength, "right") + sep +
             pad("runs", runsLength, "left") + sep +
             pad("min (s)", cellLength, "left") + sep +
             pad("max (s)", cellLength, "left") + sep +
             pad("% dev", cellLength, "left") + sep +
             pad("avg (s)", cellLength, "left") + sep +
             pad("med (s)", cellLength, "left"));

    out.push(Array(lineLength).join("-"));

    for (var i = 0; i < tests.length; ++i) {
      var test = tests[i];
      print("running test " + test.name);

      for (var j = 0; j < options.collections.length; ++j) {
        var collection = options.collections[j];
        var stats = calc(measure(test, collection, options), options);

        out.push(pad(test.name, headLength, "right") + sep +
                 pad(collection.label, collectionLength, "right") + sep +
                 pad(String(options.runs), runsLength, "left") + sep +
                 pad(stats.min.toFixed(options.digits), cellLength, "left") + sep +
                 pad(stats.max.toFixed(options.digits), cellLength, "left") + sep +
                 pad((stats.dev * 100).toFixed(2), cellLength, "left") + sep +
                 pad(stats.avg.toFixed(options.digits), cellLength, "left") + sep +
                 pad(stats.med.toFixed(options.digits), cellLength, "left"));
      }
    }

    return out;
  };

  return run(tests, options);
};


var internal = require("internal"),
    db = require("org/arangodb").db;

var initialize = function () {
  function createDocuments(n) {
    var name = "values" + n;
    if (db._collection(name) !== null) {
      return;
    }
    db._drop(name);
    internal.print("creating collection " + name);
    var c = db._create(name);
    var g = n / 100;

    for (var i = 0; i < n; ++i) {
      c.insert({
        _key: "test" + i,
        value1: i,
        value2: "test" + i,
        value3: i,
        value4: "test" + i,
        value5: i,
        value6: "test" + i,
        value7: i % g,
        value8: "test" + (i % g)
      });
    }

    c.ensureIndex({ type: "hash", fields: [ "value1" ] });
    c.ensureIndex({ type: "hash", fields: [ "value2" ] });
    c.ensureIndex({ type: "skiplist", fields: [ "value3" ] });
    c.ensureIndex({ type: "skiplist", fields: [ "value4" ] });
  }

  createDocuments(10000);
  createDocuments(100000);
  createDocuments(1000000);

  function createEdges(n) {
    var name = "edges" + n;
    if (db._collection(name) !== null) {
      return;
    }
    db._drop(name);
    internal.print("creating collection " + name);
    var c = db._createEdgeCollection(name);

    var j = 0;
    var k = 50;
    var l = 0;
    for (var i = 0; i < n; ++i) {
      c.insert({
        _key: "test" + i,
        _from: "values" + n + "/test" + j,
        _to: "values" + n + "/test" + i
      });
      if (++l === k) {
        ++j;
        l = 0;
        k--;
        if (k === 0) {
          k = 50;
        }
      }
    }
  }

  createEdges(10000);
  createEdges(100000);
  createEdges(1000000);

  internal.wal.flush(true, true);
};

///////////////////////////////////////////////////////////////////////////////
// CRUD
///////////////////////////////////////////////////////////////////////////////

////// Helper
var drop = function(params){
  var name = params.collection;
  if (db._collection(name) !== null) {
    db._drop(name);
  }
}

var create = function(params){
  var name = params.collection;
  db._create(name);
}

var fill = function(params){
  var c = db._collection(params.collection);
  var n = parseInt(params.collection.replace(/[a-z]+/g, ''), 10);

  var docSize = parseInt(params.docSize) || 0; 
  var doc = {};
  for(var i = 0; i < docSize; ++i) {
    doc["value" + i] = i;
  }

  for (var i = 0; i < n; ++i) {
    doc._key = "test" + i;
    c.insert(doc);
  }
}

////// Test Functions

var insert = function (params) {
    fill(params);
};

var update = function (params) {
  var c = db._collection(params.collection);
  var n = parseInt(params.collection.replace(/[a-z]+/g, ''), 10)
  for (var i = 0; i < n; ++i) {
    c.update("test" + i, { value: i + 1, value2: "test" + i, value3: i });
  }
};

var replace = function (params) {
  var c = db._collection(params.collection);
  var n = parseInt(params.collection.replace(/[a-z]+/g, ''), 10)
  for (var i = 0; i < n; ++i) {
    c.replace("test" + i, { value: i + 1, value2: "test" + i, value3: i });
  }
};

var remove = function (params) {
  var c = db._collection(params.collection);
  var n = parseInt(params.collection.replace(/[a-z]+/g, ''), 10)
  for (var i = 0; i < n; ++i) {
    c.remove("test" + i);
  }
};

var count = function (params) {
  var c = db._collection(params.collection);
  c.count();
};

var anyCrud = function (params) {
  var c = db._collection(params.collection);
  c.any();
};

var all = function (params) {
  var c = db._collection(params.collection);
  c.toArray();
};

var truncate = function (params) {
  var c = db._collection(params.collection);
  c.truncate();
};


///////////////////////////////////////////////////////////////////////////////
// edgeTests
///////////////////////////////////////////////////////////////////////////////

var outbound = function (params) {
  db._query("FOR v, e, p IN @minDepth..@maxDepth OUTBOUND @start @@c RETURN v", {
    "@c": params.collection,
    "minDepth" : params.minDepth,
    "maxDepth" : params.maxDepth,
    "start" : params.collection.replace(/edges/, 'values') + '/test1'
  }, { }, { silent });
};

var any = function (params) {
  db._query("FOR v, e, p IN @minDepth..@maxDepth ANY @start @@c RETURN v", {
    "@c": params.collection,
    "minDepth" : params.minDepth,
    "maxDepth" : params.maxDepth,
    "start" : params.collection.replace(/edges/, 'values') + '/test1'
  }, { }, { silent });
};

var shortestOutbound = function (params) {
  db._query("FOR v IN OUTBOUND SHORTEST_PATH @start TO @dest @@c RETURN v", {
    "@c": params.collection,
    "start" : params.collection.replace(/edges/, 'values') + '/test1',
    "dest" : params.collection.replace(/edges/, 'values') + '/test9999'
  }, { }, { silent });
};

var shortestAny = function (params) {
  db._query("FOR v IN ANY SHORTEST_PATH @start TO @dest @@c RETURN v", {
    "@c": params.collection,
    "start" : params.collection.replace(/edges/, 'values') + '/test1',
    "dest" : params.collection.replace(/edges/, 'values') + '/test9999'
  }, { }, { silent });
};




///////////////////////////////////////////////////////////////////////////////
// documentTests
///////////////////////////////////////////////////////////////////////////////

var subquery = function (params) {
  db._query("FOR c IN @@c LET sub = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s) RETURN LENGTH(sub)", {
    "@c": params.collection,
    "attr": params.attr,
  }, { }, { silent });
};

var min = function (params) {
  db._query("RETURN MIN(FOR c IN @@c RETURN c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var max = function (params) {
  db._query("RETURN MAX(FOR c IN @@c RETURN c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var concat = function (params) {
  db._query("FOR c IN @@c RETURN CONCAT(c._key, '-', c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var merge = function (params) {
  db._query("FOR c IN @@c RETURN MERGE(c, { 'testValue': c.@attr })", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var keep = function (params) {
  db._query("FOR c IN @@c RETURN KEEP(c, '_key', '_rev', '_id')", {
    "@c": params.collection
  }, { }, { silent });
};

var unset = function (params) {
  db._query("FOR c IN @@c RETURN UNSET(c, '_key', '_rev', '_id')", {
    "@c": params.collection
  }, { }, { silent });
};

var attributes = function (params) {
  db._query("FOR c IN @@c RETURN ATTRIBUTES(c)", {
    "@c": params.collection,
  }, { }, { silent });
};

var values = function (params) {
  db._query("FOR c IN @@c RETURN VALUES(c)", {
    "@c": params.collection,
  }, { }, { silent });
};

var has = function (params) {
  db._query("FOR c IN @@c RETURN HAS(c, c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var md5 = function (params) {
  db._query("FOR c IN @@c RETURN MD5(c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var sha1 = function (params) {
  db._query("FOR c IN @@c RETURN SHA1(c.@attr)", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var sort = function (params) {
  db._query("FOR c IN @@c SORT c.@attr LIMIT 1 RETURN c.@attr", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var filter = function (params) {
  db._query("FOR c IN @@c FILTER c.@attr == @value RETURN c.@attr", {
    "@c": params.collection,
    "attr": params.attr,
    "value" : params.value
  }, { }, { silent });
};

var extract = function (params) {
  if (params.attr === undefined) {
    db._query("FOR c IN @@c RETURN c", {
      "@c": params.collection
    }, { }, { silent });
  }
  else {
    db._query("FOR c IN @@c RETURN c.@attr", {
      "@c": params.collection,
      "attr" : params.attr
    }, { }, { silent });
  }
};

var join = function (params) {
  db._query("FOR c1 IN @@c FOR c2 IN @@c FILTER c1.@attr == c2.@attr RETURN c1", {
    "@c": params.collection,
    "attr": params.attr
  }, { }, { silent });
};

var lookup = function (params) {
  var key, numeric = params.numeric;
  for (var i = 0; i < params.n; ++i) {
    if (numeric) {
      key = i;
    }
    else {
      key = "test" + i;
    }
    db._query("FOR c IN @@c FILTER c.@attr == @key RETURN c", {
      "@c": params.collection,
      "attr": params.attr,
      "key": key
    }, { }, { silent });
  }
};

var lookupIn = function (params) {
  var keys = [], numeric = params.numeric;
  for (var i = 0; i < params.n; ++i) {
    if (numeric) {
      keys.push(i);
    }
    else {
      keys.push("test" + i);
    }
  }
  db._query("FOR c IN @@c FILTER c.@attr IN @keys RETURN c", {
    "@c": params.collection,
    "attr": params.attr,
    "keys": keys
  }, { }, { silent });
};

var collect = function (params) {
  if (params.count) {
    db._query("FOR c IN @@c COLLECT g = c.@attr WITH COUNT INTO l RETURN [ g, l ]", {
      "@c": params.collection,
      "attr": params.attr
    }, { }, { silent });
  }
  else {
    db._query("FOR c IN @@c COLLECT g = c.@attr RETURN g", {
      "@c": params.collection,
      "attr": params.attr
    }, { }, { silent });
  }
};

var passthru = function (params) {
  db._query("FOR c IN @@c RETURN NOOPT(" + params.name + "(@value))", {
    "@c": params.collection,
    "value": params.values
  }, { }, { silent });
};

var numericSequence = function (n) {
  var result = [ ];
  for (var i = 0; i < n; ++i) {
    result.push(i);
  }
  return result;
};


var main = function(){

var documentTests = [
//  { name: "isarray-const",          params: { func: passthru, name: "IS_ARRAY", values: numericSequence(2000) } },
//  { name: "length-const",           params: { func: passthru, name: "LENGTH", values: numericSequence(2000) } },
//  { name: "min-const",              params: { func: passthru, name: "MIN", values: numericSequence(2000) } },
//  { name: "unique-const",           params: { func: passthru, name: "UNIQUE", values: numericSequence(2000) } },

  { name: "collect-number",         params: { func: collect,  attr: "value7", count: false } },
  { name: "collect-string",         params: { func: collect,  attr: "value8", count: false } },
  { name: "collect-count-number",   params: { func: collect,  attr: "value7", count: true } },
  { name: "collect-count-string",   params: { func: collect,  attr: "value8", count: true } },
  { name: "subquery",               params: { func: subquery, attr: "value1" } },
  { name: "concat",                 params: { func: concat,   attr: "value5" } },
  { name: "merge-number",           params: { func: merge,    attr: "value5" } },
  { name: "merge-string",           params: { func: merge,    attr: "value6" } },
  { name: "keep",                   params: { func: keep,     attr: "value5" } },
  { name: "unset",                  params: { func: unset,    attr: "value5" } },
  { name: "attributes",             params: { func: attributes } },
  { name: "values",                 params: { func: values } },
  { name: "has",                    params: { func: has,      attr: "value5" } },
  { name: "md5",                    params: { func: md5,      attr: "value2" } },
  { name: "sha1",                   params: { func: sha1,     attr: "value2" } },
  { name: "min-number",             params: { func: min,      attr: "value5" } },
  { name: "min-string",             params: { func: min,      attr: "value6" } },
  { name: "max-number",             params: { func: max,      attr: "value5" } },
  { name: "max-string",             params: { func: max,      attr: "value6" } },
  { name: "sort-number",            params: { func: sort,     attr: "value5" } },
  { name: "sort-string",            params: { func: sort,     attr: "value6" } },
  { name: "filter-number",          params: { func: filter,   attr: "value5", value: 333 } },
  { name: "filter-string",          params: { func: filter,   attr: "value6", value: "test333" } },
  { name: "extract-doc",            params: { func: extract } },
  { name: "extract-id",             params: { func: extract,  attr: "_id" } },
  { name: "extract-key",            params: { func: extract,  attr: "_key" } },
  { name: "extract-number",         params: { func: extract,  attr: "value1" } },
  { name: "extract-string",         params: { func: extract,  attr: "value2" } },
  { name: "join-key",               params: { func: join,     attr: "_key" } },
  { name: "join-id",                params: { func: join,     attr: "_id" } },
  { name: "join-hash-number",       params: { func: join,     attr: "value1" } },
  { name: "join-hash-string",       params: { func: join,     attr: "value2" } },
  { name: "join-skiplist-number",   params: { func: join,     attr: "value3" } },
  { name: "join-skiplist-string",   params: { func: join,     attr: "value4" } },
  { name: "lookup-key",             params: { func: lookup,   attr: "_key", n: 10000, numeric: false } },
  { name: "lookup-hash-number",     params: { func: lookup,   attr: "value1", n: 10000, numeric: true } },
  { name: "lookup-hash-string",     params: { func: lookup,   attr: "value2", n: 10000, numeric: false } },
  { name: "lookup-skiplist-number", params: { func: lookup,   attr: "value3", n: 10000, numeric: true } },
  { name: "lookup-skiplist-string", params: { func: lookup,   attr: "value4", n: 10000, numeric: false } },
  { name: "in-key",                 params: { func: lookupIn, attr: "_key", n: 10000, numeric: false } },
  { name: "in-hash-number",         params: { func: lookupIn, attr: "value1", n: 10000, numeric: true } },
  { name: "in-hash-string",         params: { func: lookupIn, attr: "value2", n: 10000, numeric: false } },
  { name: "in-skiplist-number",     params: { func: lookupIn, attr: "value3", n: 10000, numeric: true } },
  { name: "in-skiplist-string",     params: { func: lookupIn, attr: "value4", n: 10000, numeric: false } }
];

var edgeTests = [
  { name: "traversal-outbound-1",   params: { func: outbound, minDepth: 1, maxDepth: 1 } },
  { name: "traversal-outbound-5",   params: { func: outbound, minDepth: 1, maxDepth: 5 } },
  { name: "traversal-any-1",        params: { func: any, minDepth: 1, maxDepth: 1 } },
  { name: "traversal-any-5",        params: { func: any, minDepth: 1, maxDepth: 5 } },
  { name: "shortest-outbound",      params: { func: shortestOutbound } },
  { name: "shortest-any",           params: { func: shortestAny } }
];

var crudTests = [
  //{ name: "testhooks",              params: {
  //                                          func: function(){},
  //                                          setup : function(){ internal.print("setup")},
  //                                          teardown : function(){ internal.print("teardown")},
  //                                          setupEachCall : function(){ internal.print("setup each")},
  //                                          teardownEachCall : function(){ internal.print("teardown each")},
  //                                          }
  //},
  { name: "insert",                 params: {
                                            func: insert,
                                            setupEachCall : function(params){ drop(params); create(params)},
                                            teardown : drop,
                                            }
  },
  { name: "insert docSize4",        params: {
                                            func: insert,
                                            setupEachCall : function(params){ drop(params); create(params)},
                                            teardown : drop,
                                            docSize : 4
                                            }
  },
  { name: "update",                 params: {
                                            func: update,
                                            setupEachCall : function(params){ drop(params); create(params); fill(params); },
                                            teardown : drop,
                                            } 
  },
  { name: "replace",                params: {
                                            func: replace,
                                            setupEachCall : function(params){ drop(params); create(params); fill(params); },
                                            teardown : drop,
                                            }
  },
  { name: "remove",                 params: {
                                            func: remove,
                                            setupEachCall : function(params){ drop(params); create(params); fill(params); },
                                            teardown : drop,
                                            }
  },
  { name: "count",                  params: {
                                            func: count,
                                            setup : function(params){ drop(params); create(params), fill(params)},
                                            teardown : drop,
                                            }
  },
  { name: "all",                    params: {
                                            func: all,
                                            setup : function(params){ drop(params); create(params), fill(params)},
                                            teardown : drop,
                                            }
  },
  { name: "truncate",               params: {
                                            func: truncate,
                                            setup : function(params){ drop(params); create(params), fill(params)},
                                            teardown : drop,
                                            }
  },
  { name: "any",                    params: {
                                            func: anyCrud,
                                            setup : function(params){ drop(params); create(params), fill(params)},
                                            teardown : drop,
                                            }
  }
];

initialize(); //initializes values colletion
var output = "";
var options;

// document tests
options = {
  runs: 5,
  digits: 4,
  setup: function (params) {
    db._collection(params.collection).load();
  },
  teardown: function () {
  },
  collections: [
//    { name: "values10000",    label: "10k" },
//    { name: "values100000",   label: "100k" },
    { name: "values1000000",  label: "1000k" }
  ],
  removeFromResult: 1
};
output += "\n" + testRunner(documentTests, options).join("\n");

// edge tests
options = {
  runs: 5,
  digits: 4,
  setup: function (params) {
    db._collection(params.collection).load();
  },
  teardown: function () {
  },
  collections: [
//    { name: "edges10000",    label: "10k" },
//    { name: "edges100000",   label: "100k" },
    { name: "edges1000000",  label: "1000k" }
  ],
  removeFromResult: 1
};
output += "\n" + testRunner(edgeTests, options).join("\n");

// crud tests
options = {
  runs: 5,
  digits: 4,
  setup: function (params) {
  },
  teardown: function () {
  },
  collections: [
//    { name: "crud10000",    label: "10k" },
//    { name: "crud100000",   label: "100k" },
    { name: "crud1000000",  label: "1000k" }
  ],
  removeFromResult: 1
};
output += "\n" + testRunner(crudTests, options).join("\n");

print("\n" + output + "\n");
}

main();

})()
