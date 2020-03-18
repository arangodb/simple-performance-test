exports.test = function (global) {
  "use strict";

  global.small = global.small || false;
  global.medium = global.medium || false;
  global.big = global.big || false;

  global.documents = global.documents || false;
  global.edges = global.edges || false;
  global.search = global.search || false;
  global.phrase = global.phrase || false;
  global.noMaterializationSearch = global.noMaterializationSearch || false;
  global.crud = global.crud || false;
  global.crudSearch = global.crudSearch || false;
  global.subqueryTests = global.subqueryTests || false;
  global.oneshardTests = global.oneshardTests || false;

  global.outputXml = global.outputXml || false;
  global.xmlDirectory = global.xmlDirectory || ".";

  global.outputCsv = global.outputCsv || false;

  const numberOfShards = global.numberOfShards || 9;

  const internal = require("internal");
  const AsciiTable = require("ascii-table");
  const fs = require("fs");
  const semver = require("semver");
  const _ = require("lodash");

  const db = require("org/arangodb").db;
  const time = internal.time;
  const print = internal.print;
  const serverVersion = internal.version;
  const isEnterprise = internal.isEnterprise();
  const isCluster = internal.isCluster();

  const supportsAnalyzers = !semver.satisfies(serverVersion,
    "3.5.0-rc.1 || 3.5.0-rc.2 || 3.5.0-rc.3");

  let silent = true;
  let testRunner = function (tests, options) {
    let calc = function (values, options) {

      let sum = function (values) {
        return values.reduce(function (previous, current) {
          return previous + current;
        });
      };

      values.sort(function (a, b) {
        return a - b;
      });

      let removeFromResult = parseInt(options.removeFromResult) || 0;
      if (removeFromResult > 0) {
        values.splice(values.length - 1, removeFromResult); // remove last
        values.splice(0, removeFromResult); // remove first
      }

      let n = values.length;
      let result = {
        min: values[0],
        max: values[n - 1],
        sum: sum(values),
        avg: sum(values) / n,
        med:
          n % 2
            ? (values[(n - 1) / 2] + values[(n + 1) / 2]) / 2
            : values[n / 2],
        dev: (values[n - 1] - values[0]) / (sum(values) / n)
      };

      return result;
    }; //calc

    let buildParams = function (test, collection) {
      let params = test.params;
      params.collection = collection.name;
      params.collectionSize = collection.size;
      params.scale = options.scale;
      return params;
    };

    let measure = function (test, collection, options) {
      let timedExecution = function (test, collection) {
          let params = buildParams(test, collection);
          const start = time();
          if (typeof params.setupEachCall === "function") {
            params.setupEachCall(params);
          }
          test.params.func(params);
          let end = time();
          if (typeof params.teardownEachCall === "function") {
            params.teardownEachCall(params);
          }
          return end - start;
        },
        results = [];
      internal.wait(1, true);

      for (let i = 0; i < options.runs + 1; ++i) {
        let params = buildParams(test, collection);

        if (typeof options.setup === "function") {
          options.setup(params);
        }
        if (typeof params.setup === "function") {
          params.setup(params);
        }

        if (i === 0) {
          print("- warmup");
          test.params.inWarmup = true;
          timedExecution(test, collection);
        } else {
          test.params.inWarmup = false;
          print("- run " + i);
          let duration = timedExecution(test, collection);
          print("- took: " + duration + " s");
          results.push(duration);
        }
        if (typeof params.teardown === "function") {
          params.teardown(params);
        }
        if (typeof options.teardown === "function") {
          options.teardown(test.params);
        }
      }

      return results;
    }; //measure

    let run = function (tests, options) {
      let out = [];

      for (let i = 0; i < tests.length; ++i) {
        let test = tests[i];
        if (!(test.version === undefined || semver.satisfies(serverVersion, test.version))) {
          print("skipping test " + test.name + ", requires version " + test.version);
        } else if (!(test.analyzers === undefined || test.analyzers === false || supportsAnalyzers)) {
          print("skipping test " + test.name + ", requires analyzers");
        } else {
          print("running test " + test.name);

          for (let j = 0; j < options.collections.length; ++j) {
            let collection = options.collections[j];
            let stats = calc(measure(test, collection, options), options);

            out.push({
              name: test.name,
              collectionLabel: collection.label,
              runs: String(options.runs),
              min: stats.min.toFixed(options.digits),
              max: stats.max.toFixed(options.digits),
              dev: (stats.dev * 100).toFixed(2),
              avg: stats.avg.toFixed(options.digits),
              med: stats.med.toFixed(options.digits)
            });
          } // for j
        }
      } // for i

      return out;
    };

    return run(tests, options);
  }; // testrunner

  let toString = function (title, out) {
    var table = new AsciiTable(title);
    table.
      setHeading(
        "testname",
        "collection",
        "runs",
        "min (s)",
        "max (s)",
        "% dev",
        "avg (s)",
        "med (s)"
      ).
      setAlign(2, AsciiTable.RIGHT).
      setAlign(3, AsciiTable.RIGHT).
      setAlign(4, AsciiTable.RIGHT).
      setAlign(5, AsciiTable.RIGHT).
      setAlign(6, AsciiTable.RIGHT).
      setAlign(7, AsciiTable.RIGHT);

    for (let i = 0; i < out.length; ++i) {
      let test = out[i];
      table.addRow(
        test.name,
        test.collectionLabel,
        test.runs,
        test.min,
        test.max,
        test.dev,
        test.avg,
        test.med
      );
    }

    return table.toString();
  };

  const toJUnit = function (out, prefix, postfix) {
    prefix = prefix || "";
    postfix = postfix || "";

    for (let i = 0; i < out.length; ++i) {
      let test = out[i];
      let name = prefix + test.name + postfix;

      fs.writeFileSync(
        fs.join(global.xmlDirectory, `pref-${name}.xml`),
        `<?xml version="1.0" encoding="UTF-8"?><testsuite><testcase classname="${name}" name="avg" time="${test.avg *
          1000}" /><testcase classname="${name}" name="med" time="${test.med *
          1000}" /></testsuite>`
      );
    }
  };

  const toCsv = function (out, prefix, postfix) {
    prefix = prefix || "";
    postfix = postfix || "";

    let csv = "";

    for (let i = 0; i < out.length; ++i) {
      let test = out[i];
      csv += `${prefix}${test.name}${postfix},${test.avg},${test.med},${test.min},${test.max},${test.dev},${test.collectionLabel}\n`;
    }

    return csv;
  };

  function createArangoSearch (params) {
    if (db._view(params.name) !== null) {
      return;
    }

    let meta = { links: {}, storedValues: params.storedValues };
    params.collections.forEach(function (c) {
      meta.links[c] = { includeAllFields: true, analyzers: params.analyzers };
    });

    db._dropView(params.name);
    internal.print("creating view " + params.name);
    db._createView(params.name, "arangosearch", meta);
  }

  function fillEdgeCollection (c, n, vc) {
    let j = 0,
      k = 50,
      l = 0;
    for (let i = 0; i < n; ++i) {
      c.insert({
        _key: "test" + i,
        _from: vc.name + "/test" + j,
        _to: vc.name + "/test" + i,
        value: i + "-" + j,
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

  function fillDocumentCollection (c, n, g) {
    for (let i = 0; i < n; ++i) {
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
  }

  let initializeValuesCollection = function () {
    function createDocuments (n) {
      let name = "values" + n;
      if (db._collection(name) !== null) {
        return;
      }
      db._drop(name);
      internal.print("creating collection " + name);
      let c = db._create(name, {numberOfShards}),
        g = n / 100;

      fillDocumentCollection (c, n, g);

      c.ensureIndex({ type: "hash", fields: ["value1"] });
      c.ensureIndex({ type: "hash", fields: ["value2"] });
      c.ensureIndex({ type: "skiplist", fields: ["value3"] });
      c.ensureIndex({ type: "skiplist", fields: ["value4"] });
    }

    if (global.small) {
      createDocuments(10000);
    }

    if (global.medium) {
      createDocuments(100000);
    }

    if (global.big) {
      createDocuments(1000000);
    }

    internal.wal.flush(true, true);
  },

  initializeView = function () {
    function createView (n) {
      let params = {
        name: "v_values" + n,
        collections: ["values" + n],
        analyzers: ["identity"],
        storedValues: []
      };

      createArangoSearch(params);
    }

    if (global.small) {
      createView(10000);
    }

    if (global.medium) {
      createView(100000);
    }

    if (global.big) {
      createView(1000000);
    }

    internal.wal.flush(true, true);
  },

  initializeEdgeCollection = function () {
    function createEdges (n) {
      let name = "edges" + n;
      if (db._collection(name) !== null) {
        return;
      }
      db._drop(name);
      internal.print("creating collection " + name);
      let c = db._createEdgeCollection(name, {numberOfShards});
      fillEdgeCollection (c, n, db._collection("values" + n));
    }

    if (global.small) {
      createEdges(10000);
    }

    if (global.medium) {
      createEdges(100000);
    }

    if (global.big) {
      createEdges(1000000);
    }

    internal.wal.flush(true, true);
  },

  initializeGraphs = function() {

    function createSatelliteGraph(name) {
      var graph_module = require("@arangodb/satellite-graph");
      if (graph_module._exists(name)) {
        return ;
      }
      let vertexCollectionName = name + "_vertex";
      let edgesCollectionName = name + "_edge";

      let g = graph_module._create(name, [ graph_module._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], {});
      return { graph: g,
        vertex: g[vertexCollectionName],
        edges: g[edgesCollectionName] };
    }

    function createSmartGraph(name) {
      var graph_module = require("@arangodb/smart-graph");
      if (graph_module._exists(name)) {
        return ;
      }
      let vertexCollectionName = name + "_vertex";
      let edgesCollectionName = name + "_edge";

      let opts = {smartGraphAttribute: "value2", numberOfShards: 9};

      let g = graph_module._create(name, [ graph_module._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], opts);
      return { graph: g,
        vertex: g[vertexCollectionName],
        edges: g[edgesCollectionName] };
    }

    function createCommunityGraph(name) {
      var graph_module = require("@arangodb/general-graph");
      if (graph_module._exists(name)) {
        return ;
      }
      let vertexCollectionName = name + "_vertex";
      let edgesCollectionName = name + "_edge";

      let g = graph_module._create(name, [ graph_module._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], {});
      return { graph: g,
        vertex: g[vertexCollectionName],
        edges: g[edgesCollectionName] };
    }


    print("Creating community graph");
    let gc = createCommunityGraph("comm");

    print("Creating smart graph");
    let sg = createSmartGraph("smart");

    print("Creating satellite graph");
    let satg = createSatelliteGraph("sat");

    function fillGraphEdges (c, n, vc) {
      print("Filling edges for ", c.name())
      let j = 0,
        k = 50,
        l = 0;
      for (let i = 0; i < n; ++i) {
        c.save(
          vc.name() + "/test" + j,
          vc.name() + "/test" + i,
          {value: i + "-" + j});
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

    function fillGraphVertexes (c, n, g) {
      print("Filling vertices for ", c.name())
      for (let i = 0; i < n; ++i) {
        c.save({
          _key: "smart" + i + ":test" + i,
          value1: i,
          value2: "smart" + i,
          value3: i,
          value4: "test" + i,
          value5: i,
          value6: "test" + i,
          value7: i % g,
          value8: "test" + (i % g)
        });
      }
    }


    function createVertexes(n) {
      let g = n / 100;
      fillGraphVertexes(gc.vertex, n, g);
      fillGraphVertexes(sg.vertex, n, g);
      fillGraphVertexes(satg.vertex, n, g);
    }

    function createEdges(n) {
      fillGraphEdges(gc.edges, n, gc.vertex);
      fillGraphEdges(sg.edges, n, gc.vertex);
      fillGraphEdges(satg.edges, n, gc.vertex);
    }

    if (global.small) {
      createVertexes(10000);
      createEdges(10000);
    }

    if (global.medium) {
      createVertexes(100000);
      createEdges(100000);
    }

    if (global.big) {
      createVertexes(1000000);
      createEdges(1000000);
    }
  },

  initializePhrasesView = function () {
    function createPhrasesView (n) {
      if (!supportsAnalyzers) {
        return;
      }

      let params = {
        name: "v_valuesPhrases" + n,
        collections: ["valuesPhrases" + n],
        analyzers: ["text_en"],
        storedValues: []
      };

      createArangoSearch(params);
    }

    function createDocumentsWithPhrases (n) {
      let name = "valuesPhrases" + n;
      if (db._collection(name) !== null) {
        return;
      }
      db._drop(name);

      internal.print("creating collection " + name);
      let c = db._create(name, {numberOfShards}),
        // Short list. Phrases appear frequently
        phrasesHigh = ["Quick ", "Brown ", "Slow ", "Fast "],
        highPhraseCounter = 0,
        // Long list. Phrases appear less frequent
        phrasesLow = [
          "Red ",
          "Hot ",
          "Chilie ",
          "Peppers ",
          "Abbey ",
          "Road ",
          "Earth ",
          "World ",
          "Planet ",
          "Tree ",
          "Bee ",
          "Yesterday ",
          "Book ",
          "Pencil ",
          "Robot ",
          "Wheel "
        ],
        lowPhraseCounter = 0;

      for (let i = 0; i < n; ++i) {
        c.insert({
          _key: "testPhrase" + i,
          value2:
            phrasesHigh[highPhraseCounter] + phrasesLow[lowPhraseCounter]
        });
        ++highPhraseCounter;
        ++lowPhraseCounter;
        // loop over our phrases
        if (highPhraseCounter >= phrasesHigh.length) {
          highPhraseCounter = 0;
        }
        if (lowPhraseCounter >= phrasesLow.length) {
          lowPhraseCounter = 0;
        }
      }

      // And some really low frequent phrase
      c.insert({
        _key: "testPhrase" + (n + 1),
        value2: "Low Phrase"
      });
    }

    if (global.small) {
      createDocumentsWithPhrases(10000);
      createPhrasesView(10000);
    }

    if (global.medium) {
      createDocumentsWithPhrases(100000);
      createPhrasesView(100000);
    }

    if (global.big) {
      createDocumentsWithPhrases(10000000);
      createPhrasesView(10000000);
    }

    internal.wal.flush(true, true);
  },

  initializeStoredValuesView = function () {
    function createStoredValuesView (n) {
      let params = {
        name: "v_stored_values" + n,
        collections: ["values" + n],
        analyzers: ["identity"],
        storedValues: ["value2", ["value1", "value3"]]
      };

      createArangoSearch(params);
    }

    if (global.small) {
      createStoredValuesView(10000);
    }

    if (global.medium) {
      createStoredValuesView(100000);
    }

    if (global.big) {
      createStoredValuesView(1000000);
    }

    internal.wal.flush(true, true);
  },

  // /////////////////////////////////////////////////////////////////////////////
  // CRUD Helper
  // /////////////////////////////////////////////////////////////////////////////

  drop = function (params) {
    let view = params.view;
    if (view !== undefined) {
      if (db._view(view) !== null) {
        db._dropView(view);
      }
    }
    let name = params.collection;
    if (db._collection(name) !== null) {
      db._drop(name);
    }
  },

  create = function (params) {
    let name = params.collection;
    db._create(name, {numberOfShards});
    let view = params.view;
    if (view !== undefined) {
      let viewParams = {
        name: view,
        collections: [name],
        analyzers: [params.analyzers]
      };
      createArangoSearch(viewParams);
    }
  },

  fill = function (params) {
    let c = db._collection(params.collection),
      n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10),
      docSize = parseInt(params.docSize) || 0,
      doc = {};
    for (let i = 0; i < docSize; ++i) {
      doc["value" + i] = i;
    }

    for (let i = 0; i < n; ++i) {
      doc._key = "test" + i;
      c.insert(doc);
    }
  },

  // /////////////////////////////////////////////////////////////////////////////
  // CRUD Tests
  // /////////////////////////////////////////////////////////////////////////////

  insert = function (params) {
    fill(params);
  },

  update = function (params) {
    let c = db._collection(params.collection),
      n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
    for (let i = 0; i < n; ++i) {
      c.update("test" + i, { value: i + 1, value2: "test" + i, value3: i });
    }
  },

  replace = function (params) {
    let c = db._collection(params.collection),
      n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
    for (let i = 0; i < n; ++i) {
      c.replace("test" + i, { value: i + 1, value2: "test" + i, value3: i });
    }
  },

  remove = function (params) {
    let c = db._collection(params.collection),
      n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
    for (let i = 0; i < n; ++i) {
      c.remove("test" + i);
    }
  },

  count = function (params) {
    let c = db._collection(params.collection);
    c.count();
  },

  anyCrud = function (params) {
    let c = db._collection(params.collection);
    c.any();
  },

  all = function (params) {
    let c = db._collection(params.collection);
    c.toArray();
  },

  truncate = function (params) {
    let c = db._collection(params.collection);
    c.truncate();
  },

  // /////////////////////////////////////////////////////////////////////////////
  // edgeTests
  // /////////////////////////////////////////////////////////////////////////////

  outbound = function (params) {
    db._query(
      "WITH @@v FOR i IN 1 .. @loops FOR v, e, p IN @minDepth..@maxDepth OUTBOUND @start @@c RETURN v",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        minDepth: params.minDepth,
        maxDepth: params.maxDepth,
        loops: params.loops || 1,
        start: params.collection.replace(/edges/, "values") + "/test1"
      },
      {},
      { silent }
    );
  },

  any = function (params) {
    db._query(
      "WITH @@v FOR v, e, p IN @minDepth..@maxDepth ANY @start @@c RETURN v",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        minDepth: params.minDepth,
        maxDepth: params.maxDepth,
        start: params.collection.replace(/edges/, "values") + "/test1"
      },
      {},
      { silent }
    );
  },

  outboundPath = function (params) {
    db._query(
      "WITH @@v FOR v, e, p IN @minDepth..@maxDepth OUTBOUND @start @@c RETURN p",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        minDepth: params.minDepth,
        maxDepth: params.maxDepth,
        start: params.collection.replace(/edges/, "values") + "/test1"
      },
      {},
      { silent }
    );
  },

  anyPath = function (params) {
    db._query(
      "WITH @@v FOR v, e, p IN @minDepth..@maxDepth ANY @start @@c RETURN p",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        minDepth: params.minDepth,
        maxDepth: params.maxDepth,
        start: params.collection.replace(/edges/, "values") + "/test1"
      },
      {},
      { silent }
    );
  },

  shortestOutbound = function (params) {
    db._query(
      "WITH @@v FOR v IN OUTBOUND SHORTEST_PATH @start TO @dest @@c RETURN v",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        start: params.collection.replace(/edges/, "values") + "/test1",
        dest: params.collection.replace(/edges/, "values") + "/test9999"
      },
      {},
      { silent }
    );
  },

  shortestAny = function (params) {
    db._query(
      "WITH @@v FOR v IN ANY SHORTEST_PATH @start TO @dest @@c RETURN v",
      {
        "@c": params.collection,
        "@v": params.collection.replace("edges", "values"),
        start: params.collection.replace(/edges/, "values") + "/test1",
        dest: params.collection.replace(/edges/, "values") + "/test9999"
      },
      {},
      { silent }
    );
  },

  // /////////////////////////////////////////////////////////////////////////////
  // documentTests
  // /////////////////////////////////////////////////////////////////////////////

  subquery = function (params) {
    db._query(
      "FOR c IN @@c LET sub = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s) RETURN LENGTH(sub)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  subqueryExistsPath = function (params) {
    const vertices = params.collection.replace("edges", "values");
    // Test if we have a path leading back to values/test2
    // On small this will be 1321 vertices, on medium and big it will be 33976 vertices
    db._query(`
      FOR v IN @@c
        LET hasPath = (FOR s IN INBOUND SHORTEST_PATH v TO @source @@e RETURN 1)
        FILTER LENGTH(hasPath) > 0
        RETURN v
    `,
    {
      "@c": vertices,
      "@e": params.collection,
      source: `${vertices}/test2`
    },
    {},
    { silent }
    );
  },

  twoStepTraversalGroupByCollect = function (params) {
    const vertices = params.collection.replace("edges", "values");
    // Test if we have a path leading back to values/test2
    // On small this will be 1321 vertices, on medium and big it will be 33976 vertices
    db._query(`
      FOR v IN @@c
        FOR main IN 1 OUTBOUND v @@e
          FOR sub IN 1 OUTBOUND main @@e
          COLLECT m = main INTO group
          RETURN {main: m, subs: group.sub }
    `,
    {
      "@c": vertices,
      "@e": params.collection
    },
    {},
    { silent }
    );
  },

  twoStepTraversalGroupBySubquery = function (params) {
    const vertices = params.collection.replace("edges", "values");
    // Test if we have a path leading back to values/test2
    // On small this will be 1321 vertices, on medium and big it will be 33976 vertices
    db._query(`
      FOR v IN @@c
        FOR main IN 1 OUTBOUND v @@e
        LET subs = (
          FOR sub IN 1 OUTBOUND main @@e
            RETURN sub
        )
        RETURN {main, subs}
    `,
    {
      "@c": vertices,
      "@e": params.collection
    },
    {},
    { silent }
    );
  },

  min = function (params) {
    db._query(
      "RETURN MIN(FOR c IN @@c RETURN c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  max = function (params) {
    db._query(
      "RETURN MAX(FOR c IN @@c RETURN c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  concat = function (params) {
    db._query(
      "FOR c IN @@c RETURN CONCAT(c._key, '-', c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  merge = function (params) {
    db._query(
      "FOR c IN @@c RETURN MERGE(c, { 'testValue': c.@attr })",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  keep = function (params) {
    db._query(
      "FOR c IN @@c RETURN KEEP(c, '_key', '_rev', '_id')",
      {
        "@c": params.collection
      },
      {},
      { silent }
    );
  },

  unset = function (params) {
    db._query(
      "FOR c IN @@c RETURN UNSET(c, '_key', '_rev', '_id')",
      {
        "@c": params.collection
      },
      {},
      { silent }
    );
  },

  attributes = function (params) {
    db._query(
      "FOR c IN @@c RETURN ATTRIBUTES(c)",
      {
        "@c": params.collection
      },
      {},
      { silent }
    );
  },

  values = function (params) {
    db._query(
      "FOR c IN @@c RETURN VALUES(c)",
      {
        "@c": params.collection
      },
      {},
      { silent }
    );
  },

  has = function (params) {
    db._query(
      "FOR c IN @@c RETURN HAS(c, c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  md5 = function (params) {
    db._query(
      "FOR c IN @@c RETURN MD5(c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  sha1 = function (params) {
    db._query(
      "FOR c IN @@c RETURN SHA1(c.@attr)",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  skipIndex = function (params) {
    let size = parseInt(params.collection.replace(/[^0-9]/g, "")),
      offset = size - params.limit;
    db._query(
      "FOR c IN @@c SORT c.@attr LIMIT @offset, @limit RETURN c.@attr",
      {
        "@c": params.collection,
        attr: params.attr,
        offset: offset,
        limit: params.limit
      },
      {},
      { silent }
    );
  },

  skipDocs = function (params) {
    let size = parseInt(params.collection.replace(/[^0-9]/g, "")),
      offset = size - params.limit;
    db._query(
      "FOR c IN @@c SORT c.@attr LIMIT @offset, @limit RETURN c.@attr",
      {
        "@c": params.collection,
        attr: params.attr,
        offset: offset,
        limit: params.limit
      },
      {},
      { silent }
    );
  },

  sortAll = function (params) {
    // Use a "sort everything" implementation.
    db._query(
      "FOR c IN @@c SORT c.@attr LIMIT 1 RETURN c.@attr",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent, optimizer: { rules: ["-sort-limit"] } }
    );
  },

  sortHeap = function (params) {
    // Use a heap of size 20 for the sort.
    db._query(
      "FOR c IN @@c SORT c.@attr LIMIT 20 RETURN c.@attr",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  filter = function (params) {
    db._query(
      "FOR c IN @@c FILTER c.@attr == @value RETURN c.@attr",
      {
        "@c": params.collection,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },

  extract = function (params) {
    if (params.attr === undefined) {
      db._query(
        "FOR c IN @@c RETURN c",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    } else {
      db._query(
        "FOR c IN @@c RETURN c.@attr",
        {
          "@c": params.collection,
          attr: params.attr
        },
        {},
        { silent }
      );
    }
  },

  join = function (params) {
    db._query(
      "FOR c1 IN @@c FOR c2 IN @@c FILTER c1.@attr == c2.@attr RETURN c1",
      {
        "@c": params.collection,
        attr: params.attr
      },
      {},
      { silent }
    );
  },

  lookup = function (params) {
    let key,
      numeric = params.numeric;
    for (let i = 0; i < params.n; ++i) {
      if (numeric) {
        key = i;
      } else {
        key = "test" + i;
      }
      db._query(
        "FOR c IN @@c FILTER c.@attr == @key RETURN c",
        {
          "@c": params.collection,
          attr: params.attr,
          key: key
        },
        {},
        { silent }
      );
    }
  },

  lookupIn = function (params) {
    let keys = [],
      numeric = params.numeric;
    for (let i = 0; i < params.n; ++i) {
      if (numeric) {
        keys.push(i);
      } else {
        keys.push("test" + i);
      }
    }
    db._query(
      "FOR c IN @@c FILTER c.@attr IN @keys RETURN c",
      {
        "@c": params.collection,
        attr: params.attr,
        keys: keys
      },
      {},
      { silent }
    );
  },

  collect = function (params) {
    if (params.count) {
      db._query(
        "FOR c IN @@c COLLECT g = c.@attr WITH COUNT INTO l RETURN [ g, l ]",
        {
          "@c": params.collection,
          attr: params.attr
        },
        {},
        { silent }
      );
    } else {
      db._query(
        "FOR c IN @@c COLLECT g = c.@attr RETURN g",
        {
          "@c": params.collection,
          attr: params.attr
        },
        {},
        { silent }
      );
    }
  },

  passthru = function (params) {
    db._query(
      "FOR c IN @@c RETURN NOOPT(" + params.name + "(@value))",
      {
        "@c": params.collection,
        value: params.values
      },
      {},
      { silent }
    );
  },

  numericSequence = function (n) {
    let result = [];
    for (let i = 0; i < n; ++i) {
      result.push(i);
    }
    return result;
  },

  // /////////////////////////////////////////////////////////////////////////////
  // arangosearchTests
  // /////////////////////////////////////////////////////////////////////////////

  arangosearchLookupByAttribute = function (params) {
    db._query(
      "FOR d IN @@v SEARCH d.@attr == @value RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },

  arangosearchRangeLookupOperator = function (params) {
    if (params.includeMin && params.includeMax) {
      db._query(
        "FOR d IN @@v SEARCH d.@attr >= @minValue && d.@attr <= @maxValue RETURN d",
        {
          "@v": params.view,
          attr: params.attr,
          minValue: params.minValue,
          maxValue: params.maxValue
        },
        {},
        { silent }
      );
    } else if (params.includeMax) {
      db._query(
        "FOR d IN @@v SEARCH d.@attr > @minValue && d.@attr <= @maxValue RETURN d",
        {
          "@v": params.view,
          attr: params.attr,
          minValue: params.minValue,
          maxValue: params.maxValue
        },
        {},
        { silent }
      );
    } else if (params.includeMin) {
      db._query(
        "FOR d IN @@v SEARCH d.@attr >= @minValue && d.@attr < @maxValue RETURN d",
        {
          "@v": params.view,
          attr: params.attr,
          minValue: params.minValue,
          maxValue: params.maxValue
        },
        {},
        { silent }
      );
    } else {
      db._query(
        "FOR d IN @@v SEARCH d.@attr > @minValue && d.@attr < @maxValue RETURN d",
        {
          "@v": params.view,
          attr: params.attr,
          minValue: params.minValue,
          maxValue: params.maxValue
        },
        {},
        { silent }
      );
    }
  },

  arangosearchRangeLookupFunc = function (params) {
    db._query(
      "FOR d IN @@v SEARCH IN_RANGE(d.@attr, @minValue, @maxValue, @includeMin, @includeMax) RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        minValue: params.minValue,
        maxValue: params.maxValue,
        includeMin: params.includeMin,
        includeMax: params.includeMax
      },
      {},
      { silent }
    );
  },

  arangosearchBasicConjunction = function (params) {
    db._query(
      "FOR d IN @@v SEARCH d.@attr0 == @value0 && d.@attr1 == @value1 RETURN d",
      {
        "@v": params.view,
        attr0: params.attr0,
        value0: params.value0,
        attr1: params.attr1,
        value1: params.value1
      },
      {},
      { silent }
    );
  },
  arangosearchBasicDisjunction = function (params) {
    db._query(
      "FOR d IN @@v SEARCH d.@attr0 == @value0 || d.@attr1 == @value1 RETURN d",
      {
        "@v": params.view,
        attr0: params.attr0,
        value0: params.value0,
        attr1: params.attr1,
        value1: params.value1
      },
      {},
      { silent }
    );
  },
  arangosearchDisjunction = function (params) {
    db._query(
      "FOR d IN @@v SEARCH d.@attr IN @value RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },
  arangosearchPrefix = function (params) {
    db._query(
      "FOR d IN @@v SEARCH STARTS_WITH(d.@attr, @value) RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },
  arangosearchMinMatch2of3 = function (params) {
    db._query(
      "FOR d IN @@v SEARCH ANALYZER(MIN_MATCH(d.@attr1 == @value1, d.@attr1 ==  @value2, d.@attr1 == @value3, 2 ), 'text_en') RETURN d",
      {
        "@v": params.view,
        attr1: params.attr1,
        value1: params.value1,
        value2: params.value2,
        value3: params.value3
      },
      {},
      { silent }
    );
  },
  arangosearchScoring = function (params) {
    db._query(
      "FOR d IN @@v SEARCH ANALYZER(d.@attr == @value, 'text_en') SORT " +
        params.scorer +
        "(d) ASC  RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },
  arangosearchPhrase = function (params) {
    db._query(
      "FOR d IN @@v SEARCH PHRASE(d.@attr , @value, 'text_en')  RETURN d",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },
  arangosearchCountOnView = function (params) {
    db._query(
      "FOR d IN @@v COLLECT WITH COUNT INTO c RETURN c",
      {
        "@v": params.view
      },
      {},
      { silent }
    );
  },
  arangosearchCountOnViewLimited = function (params) {
    db._query(
      "FOR d IN @@v LIMIT @offset, @limit COLLECT WITH COUNT INTO c RETURN c",
      {
        "@v": params.view,
        offset: params.offset,
        limit: params.limit
      },
      {},
      { silent }
    );
  },
  arangosearchCountOnViewSearched = function (params) {
    db._query(
      "FOR d IN @@v  SEARCH d.@attr IN @value  COLLECT WITH COUNT INTO c RETURN c",
      {
        "@v": params.view,
        attr: params.attr,
        value: params.value
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithoutAccessOff = function (params) {
    db._query(
      "FOR d IN @@v OPTIONS {noMaterialization: false} RETURN 1",
      {
        "@v": params.view
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithoutAccessOn = function (params) {
    db._query(
      "FOR d IN @@v OPTIONS {noMaterialization: true} RETURN 1",
      {
        "@v": params.view
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithReturnOff = function (params) {
    db._query(
      "FOR d IN @@v OPTIONS {noMaterialization: false} RETURN d.@attr",
      {
        "@v": params.view,
        attr: params.attr
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithReturnOn = function (params) {
    db._query(
      "FOR d IN @@v OPTIONS {noMaterialization: true} RETURN d.@attr",
      {
        "@v": params.view,
        attr: params.attr
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithSortOff = function (params) {
    db._query(
      `FOR d IN @@v OPTIONS {noMaterialization: false}
        LET a = d.@attr0 LET b = d.@attr1 SORT CONCAT(a, b)
        RETURN [a, b, d.@attr2]`,
      {
        "@v": params.view,
        attr0: params.attr0,
        attr1: params.attr1,
        attr2: params.attr2
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithSortOn = function (params) {
    db._query(
      `FOR d IN @@v OPTIONS {noMaterialization: true}
        LET a = d.@attr0 LET b = d.@attr1 SORT CONCAT(a, b)
        RETURN [a, b, d.@attr2]`,
      {
        "@v": params.view,
        attr0: params.attr0,
        attr1: params.attr1,
        attr2: params.attr2
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithSortAndLimitOff = function (params) {
    db._query(
      `FOR d IN @@v OPTIONS {noMaterialization: false}
        LET a = d.@attr0 LET b = d.@attr1 SORT CONCAT(a, b) LIMIT 10
        RETURN [a, b, d.@attr2]`,
      {
        "@v": params.view,
        attr0: params.attr0,
        attr1: params.attr1,
        attr2: params.attr2
      },
      {},
      { silent }
    );
  },
  arangosearchNoMaterializationWithSortAndLimitOn = function (params) {
    db._query(
      `FOR d IN @@v OPTIONS {noMaterialization: true}
        LET a = d.@attr0 LET b = d.@attr1 SORT CONCAT(a, b) LIMIT 10
        RETURN [a, b, d.@attr2]`,
      {
        "@v": params.view,
        attr0: params.attr0,
        attr1: params.attr1,
        attr2: params.attr2
      },
      {},
      { silent }
    );
  },

  // /////////////////////////////////////////////////////////////////////////////
  // subqueryTests
  // /////////////////////////////////////////////////////////////////////////////

  // currently unused, useful for validation
  subquerySplicingValidation = function (params) {
    let spliceoptimizer = { rules: ["+splice-subqueries"] };
    let spliced = db._query(
      params.queryString,
      {
        "@c": params.collection,
        attr: params.attr
      },
      { optimizer: spliceoptimizer }
    );
    let nonspliceoptimizer = { rules: ["-splice-subqueries"] };
    let nonspliced = db._query(
      params.queryString,
      {
        "@c": params.collection,
        attr: params.attr
      },
      { optimizer: nonspliceoptimizer }
    );
    let splicedarray = spliced.toArray();
    let nonsplicedarray = nonspliced.toArray();
    if (splicedarray.length !== nonsplicedarray.length) {
      print(spliced);
      print(nonspliced);
      throw "Results don't match";
    }
    if (JSON.stringify(splicedarray.sort()) !== JSON.stringify(nonsplicedarray.sort())) {
      print(spliced);
      print(nonspliced);
      throw "Results do not match";
    }
  },
  genericSubquerySplicing = function (params) {
    let myOptimizer = { rules: [] };
    let bindParam = { "@c": params.collection };
    if ('bindParamModifier' in params) {
      params.bindParamModifier(params, bindParam);
    }
    if (params.edgesRequired === true) {
      bindParam["@e"] = bindParam["@c"].replace("values", "edges");
    }
    if (params.splice) {
      myOptimizer.rules.push("+splice-subqueries");
    } else {
      myOptimizer.rules.push("-splice-subqueries");
    }
    let result = db._query(
      params.queryString,
        bindParam,
      { optimizer: myOptimizer }
    );
  },

  // /////////////////////////////////////////////////////////////////////////////
  // subqueryTests
  // /////////////////////////////////////////////////////////////////////////////

  genericSatelliteGraph = function (params) {

    let bindParam = {
      //"c": params.collection,
      "g": params.graph,
      "@v": params.graph + "_vertex",
      //"e": params.graph + "_edge"
    };

    print("running query ", params.queryString, " on graph ", params.graph);

    let result = db._query(
      params.queryString,
        bindParam, {}
    );
  },


  // /////////////////////////////////////////////////////////////////////////////
  // main
  // /////////////////////////////////////////////////////////////////////////////

  main = function () {
    let documentTests = [
        {
          name: "aql-isarray-const",
          params: {
            func: passthru,
            name: "IS_ARRAY",
            values: numericSequence(2000)
          }
        },
        {
          name: "aql-length-const",
          params: {
            func: passthru,
            name: "LENGTH",
            values: numericSequence(2000)
          }
        },
        {
          name: "aql-min-const",
          params: {
            func: passthru,
            name: "MIN",
            values: numericSequence(2000)
          }
        },
        {
          name: "aql-unique-const",
          params: {
            func: passthru,
            name: "UNIQUE",
            values: numericSequence(2000)
          }
        },
        {
          name: "aql-collect-number",
          params: { func: collect, attr: "value7", count: false }
        },
        {
          name: "aql-collect-string",
          params: { func: collect, attr: "value8", count: false }
        },
        {
          name: "aql-collect-count-number",
          params: { func: collect, attr: "value7", count: true }
        },
        {
          name: "aql-collect-count-string",
          params: { func: collect, attr: "value8", count: true }
        },
        {
          name: "aql-subquery",
          params: { func: subquery, attr: "value1" }
        },
        {
          name: "aql-concat",
          params: { func: concat, attr: "value5" }
        },
        {
          name: "aql-merge-number",
          params: { func: merge, attr: "value5" }
        },
        {
          name: "aql-merge-string",
          params: { func: merge, attr: "value6" }
        },
        {
          name: "aql-keep",
          params: { func: keep, attr: "value5" }
        },
        {
          name: "aql-unset",
          params: { func: unset, attr: "value5" }
        },
        {
          name: "aql-attributes",
          params: { func: attributes }
        },
        {
          name: "aql-values",
          params: { func: values }
        },
        {
          name: "aql-has",
          params: { func: has, attr: "value5" }
        },
        {
          name: "aql-md5",
          params: { func: md5, attr: "value2" }
        },
        {
          name: "aql-sha1",
          params: { func: sha1, attr: "value2" }
        },
        {
          name: "aql-min-number",
          params: { func: min, attr: "value5" }
        },
        {
          name: "aql-min-string",
          params: { func: min, attr: "value6" }
        },
        {
          name: "aql-max-number",
          params: { func: max, attr: "value5" }
        },
        {
          name: "aql-max-string",
          params: { func: max, attr: "value6" }
        },
        {
          name: "aql-sort-heap-number",
          params: { func: sortHeap, attr: "value5" }
        },
        {
          name: "aql-sort-heap-string",
          params: { func: sortHeap, attr: "value6" }
        },
        {
          name: "aql-sort-all-number",
          params: { func: sortAll, attr: "value5" }
        },
        {
          name: "aql-sort-all-string",
          params: { func: sortAll, attr: "value6" }
        },
        {
          name: "aql-filter-number",
          params: { func: filter, attr: "value5", value: 333 }
        },
        {
          name: "aql-filter-string",
          params: { func: filter, attr: "value6", value: "test333" }
        },
        {
          name: "aql-extract-doc",
          params: { func: extract }
        },
        {
          name: "aql-extract-id",
          params: { func: extract, attr: "_id" }
        },
        {
          name: "aql-extract-key",
          params: { func: extract, attr: "_key" }
        },
        {
          name: "aql-extract-number",
          params: { func: extract, attr: "value1" }
        },
        {
          name: "aql-extract-string",
          params: { func: extract, attr: "value2" }
        },
        {
          name: "aql-join-key",
          params: { func: join, attr: "_key" }
        },
        {
          name: "aql-join-id",
          params: { func: join, attr: "_id" }
        },
        {
          name: "aql-join-hash-number",
          params: { func: join, attr: "value1" }
        },
        {
          name: "aql-join-hash-string",
          params: { func: join, attr: "value2" }
        },
        {
          name: "aql-join-skiplist-number",
          params: { func: join, attr: "value3" }
        },
        {
          name: "aql-join-skiplist-string",
          params: { func: join, attr: "value4" }
        },
        {
          name: "aql-lookup-key",
          params: { func: lookup, attr: "_key", n: 10000, numeric: false }
        },
        {
          name: "aql-lookup-hash-number",
          params: { func: lookup, attr: "value1", n: 10000, numeric: true }
        },
        {
          name: "aql-lookup-hash-string",
          params: { func: lookup, attr: "value2", n: 10000, numeric: false }
        },
        {
          name: "aql-lookup-skiplist-number",
          params: { func: lookup, attr: "value3", n: 10000, numeric: true }
        },
        {
          name: "aql-lookup-skiplist-string",
          params: { func: lookup, attr: "value4", n: 10000, numeric: false }
        },
        {
          name: "aql-in-key",
          params: { func: lookupIn, attr: "_key", n: 10000, numeric: false }
        },
        {
          name: "aql-in-hash-number",
          params: { func: lookupIn, attr: "value1", n: 10000, numeric: true }
        },
        {
          name: "aql-in-hash-string",
          params: { func: lookupIn, attr: "value2", n: 10000, numeric: false }
        },
        {
          name: "aql-in-skiplist-number",
          params: { func: lookupIn, attr: "value3", n: 10000, numeric: true }
        },
        {
          name: "aql-in-skiplist-string",
          params: { func: lookupIn, attr: "value4", n: 10000, numeric: false }
        },
        {
          name: "aql-skip-index",
          params: { func: skipIndex, attr: "value1", limit: 10 }
        },
        {
          name: "aql-skip-docs",
          params: { func: skipDocs, attr: "value1", limit: 10 }
        }
      ],
      edgeTests = [
        {
          name: "traversal-outbound-1",
          params: { func: outbound, minDepth: 1, maxDepth: 1, loops: 1000 }
        },
        {
          name: "traversal-outbound-5",
          params: { func: outbound, minDepth: 1, maxDepth: 5 }
        },
        {
          name: "traversal-any-1",
          params: { func: any, minDepth: 1, maxDepth: 1 }
        },
        {
          name: "traversal-any-5",
          params: { func: any, minDepth: 1, maxDepth: 5 }
        },
        {
          name: "traversal-out-path-5",
          params: { func: outboundPath, minDepth: 1, maxDepth: 5 }
        },
        {
          name: "traversal-any-path-5",
          params: { func: anyPath, minDepth: 1, maxDepth: 5 }
        },
        {
          name: "shortest-outbound",
          params: { func: shortestOutbound }
        },
        {
          name: "shortest-any",
          params: { func: shortestAny }
        },
        {
          name: "subquery-exists-path",
          params: { func: subqueryExistsPath }
        },
        {
          name: "two-step-traversal-group-collect",
          params: { func: twoStepTraversalGroupByCollect }
        },
        {
          name: "two-step-traversal-group-by-subquery",
          params: { func: twoStepTraversalGroupBySubquery }
        }
      ],
      arangosearchTests = [
        {
          name: "ars-aql-key-lookup",
          params: {
            func: arangosearchLookupByAttribute,
            attr: "_key",
            value: "test4242"
          }
        },
        {
          name: "ars-aql-range-lookup-operator",
          params: {
            func: arangosearchRangeLookupOperator,
            attr: "_key",
            minValue: "test42",
            includeMin: true,
            maxValue: "test4242",
            includeMax: true
          }
        },
        {
          name: "ars-aql-range-lookup-function",
          version: ">= 3.4.5",
          params: {
            func: arangosearchRangeLookupFunc,
            attr: "_key",
            minValue: "test42",
            includeMin: true,
            maxValue: "test4242",
            includeMax: true
          }
        },
        {
          name: "ars-aql-basic-conjunction",
          params: {
            func: arangosearchBasicConjunction,
            attr0: "value2",
            value0: "test42",
            attr1: "value1",
            value1: 42
          }
        },
        {
          name: "ars-aql-basic-disjunction",
          params: {
            func: arangosearchBasicDisjunction,
            attr0: "value2",
            value0: "test42",
            attr1: "value1",
            value1: 4242
          }
        },
        {
          name: "ars-aql-disjunction",
          params: {
            func: arangosearchDisjunction,
            attr: "value8",
            value: [
              "test10",
              "test42",
              "test37",
              "test76",
              "test98",
              "test2",
              "invalid"
            ]
          }
        },
        {
          name: "ars-aql-prefix-low",
          params: {
            func: arangosearchPrefix,
            attr: "value2",
            value: "test4242"
          }
        },
        {
          name: "ars-aql-prefix-high",
          params: { func: arangosearchPrefix, attr: "value2", value: "test4" }
        },
        {
          name: "ars-aql-collect-count",
          params: {
            func: arangosearchCountOnView
          }
        },
        {
          name: "ars-aql-collect-count-limited",
          params: {
            func: arangosearchCountOnViewLimited
          }
        },
        {
          name: "ars-aql-collect-count-searched",
          params: {
            func: arangosearchCountOnViewSearched,
            attr: "value6",
            value: "test333"
          }
        }
      ],
      arangosearchPhrasesTests = [
        {
          name: "ars-aql-phrase-minmatch-low",
          analyzers: true,
          params: {
            func: arangosearchMinMatch2of3,
            attr1: "value2",
            value1: "low",
            value2: "nomatch",
            value3: "phrase"
          }
        },
        {
          name: "ars-aql-phrase-minmatch-high",
          analyzers: true,
          params: {
            func: arangosearchMinMatch2of3,
            attr1: "value2",
            value1: "brown",
            value2: "tree",
            value3: "nomatch"
          }
        },
        {
          name: "ars-aql-phrase-score-tfidf-low",
          analyzers: true,
          params: {
            func: arangosearchScoring,
            attr: "value2",
            value: "wheel",
            scorer: "TFIDF"
          }
        },
        {
          name: "ars-aql-phrase-score-bm25-low",
          analyzers: true,
          params: {
            func: arangosearchScoring,
            attr: "value2",
            value: "wheel",
            scorer: "BM25"
          }
        },
        {
          name: "ars-aql-phrase-score-tfidf-high",
          analyzers: true,
          params: {
            func: arangosearchScoring,
            attr: "value2",
            value: "brown",
            scorer: "TFIDF"
          }
        },
        {
          name: "ars-aql-phrase-score-bm25-high",
          analyzers: true,
          params: {
            func: arangosearchScoring,
            attr: "value2",
            value: "brown",
            scorer: "BM25"
          }
        },
        {
          name: "ars-aql-phrase-low",
          analyzers: true,
          params: {
            func: arangosearchPhrase,
            attr: "value2",
            value: "Low Phrase"
          }
        },
        {
          name: "ars-aql-phrase-high",
          analyzers: true,
          params: {
            func: arangosearchPhrase,
            attr: "value2",
            value: "Brown Planet"
          }
        }
      ],
      arangosearchNoMaterializationTests = [
        {
          name: "ars-no-materialization-without-access-off",
          params: {
            func: arangosearchNoMaterializationWithoutAccessOff
          }
        },
        {
          name: "ars-no-materialization-without-access-on",
          params: {
            func: arangosearchNoMaterializationWithoutAccessOn
          }
        },
        {
          name: "ars-no-materialization-with-return-off",
          params: {
            func: arangosearchNoMaterializationWithReturnOff,
            attr: "value1"
          }
        },
        {
          name: "ars-no-materialization-with-return-on",
          params: {
            func: arangosearchNoMaterializationWithReturnOn,
            attr: "value1"
          }
        },
        {
          name: "ars-no-materialization-with-sort-off",
          params: {
            func: arangosearchNoMaterializationWithSortOff,
            attr0: "value1",
            attr1: "value2",
            attr2: "value3"
          }
        },
        {
          name: "ars-no-materialization-with-sort-on",
          params: {
            func: arangosearchNoMaterializationWithSortOn,
            attr0: "value1",
            attr1: "value2",
            attr2: "value3"
          }
        },
        {
          name: "ars-no-materialization-with-sort-and-limit-off",
          params: {
            func: arangosearchNoMaterializationWithSortAndLimitOff,
            attr0: "value1",
            attr1: "value2",
            attr2: "value3"
          }
        },
        {
          name: "ars-no-materialization-with-sort-and-limit-on",
          params: {
            func: arangosearchNoMaterializationWithSortAndLimitOn,
            attr0: "value1",
            attr1: "value2",
            attr2: "value3"
          }
        }
      ],
      crudTests = [
        {
          name: "crud-insert",
          params: {
            func: insert,
            setupEachCall: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-insert-size4",
          params: {
            func: insert,
            setupEachCall: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop,
            docSize: 4
          }
        },
        {
          name: "crud-update",
          params: {
            func: update,
            setupEachCall: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-replace",
          params: {
            func: replace,
            setupEachCall: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-remove",
          params: {
            func: remove,
            setupEachCall: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-count",
          params: {
            func: count,
            setup: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-all",
          params: {
            func: all,
            setup: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-truncate",
          params: {
            func: truncate,
            setup: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-any",
          params: {
            func: anyCrud,
            setup: function (params) {
              drop(params);
              create(params);
              fill(params);
            },
            teardown: drop
          }
        }
      ],
      subqueryTests = [
/*        {
          name: "aql-subquery-splicing-compare",
          params: { func: subquerySplicingValidation, attr: "value1" }
        }, */
        {
          name: "aql-subquery-1",
          params: { func: genericSubquerySplicing,
                    queryString: "FOR c IN @@c LET sub = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s) RETURN LENGTH(sub)",
                        bindParamModifier: function(param, bindParam) {
                        bindParam.attr = "value1";
                    }
                  }
        },
        {
          name: "aql-subquery-2",
          params: { func: genericSubquerySplicing,
            queryString: "FOR c IN @@c LET sub = (FOR s IN 1..5 LET subsub = (FOR t IN @@c FILTER t.@attr == c.@attr + s RETURN t) FILTER LENGTH(subsub) > 0 RETURN s) RETURN LENGTH(sub)",
            bindParamModifier: function(param, bindParam) {
              bindParam.attr = "value1";
            }
          }
        },
        {
          name: "aql-subquery-min",
          params: { func: genericSubquerySplicing,
                    queryString: "RETURN MIN(FOR c IN @@c RETURN c.@attr)",
                    bindParamModifier: function(param, bindParam) {
                        bindParam.attr = "value1";
                    }
                  }
        },
        {
         name: "aql-subquery-min-no-index",
         params: { func: genericSubquerySplicing,
                   queryString: "RETURN MIN(FOR c IN @@c RETURN c.@attr)",
                   bindParamModifier: function(param, bindParam) {
                   bindParam.attr = "value6";
                 }
               }
        },
        {
          name: "aql-subquery-max",
          params: { func: genericSubquerySplicing,
                    queryString: "RETURN MAX(FOR c IN @@c RETURN c.@attr)",
                    bindParamModifier: function(param, bindParam) {
                      bindParam.attr = "value1";
                    }
                  }
        },
        {
          name: "aql-subquery-shortest-path",
          params: { func: genericSubquerySplicing,
                    queryString: `
                       FOR v IN @@c
                         LET hasPath = (FOR s IN INBOUND SHORTEST_PATH v TO @source @@e RETURN 1)
                         FILTER LENGTH(hasPath) > 0
                       RETURN v
                    `,
                    edgesRequired: true,
                    bindParamModifier: function(param, bindParam) {
                      bindParam.source = `${param.collection}/test2`;
                    }
                  }
        },
        {
            name: "aql-subquery-traversal",
            params: { func: genericSubquerySplicing,
                      queryString: `
                       FOR v IN @@c
                         FOR main IN 1 OUTBOUND v @@e
                         LET subs = (
                           FOR sub IN 1 OUTBOUND main @@e
                             RETURN sub
                         )
                       RETURN {main, subs}
                    `,
                      attr: "value1",
                      edgesRequired: true,
                      bindParamModifier: function(param, bindParam) { delete bindParam.attr; }
                    }
        },
        /*
         * This test is disabled, because it takes far too long for a simple
         * performance test. This is because some of the involved attributes
         * are not indexed.
        {
           name: "aql-multi-subqueries-some-no-index",
           params: { func: genericSubquerySplicing,
                      queryString: `FOR c IN @@c
                                       LET sub1 = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s)
                                       LET sub2 = (FOR s IN @@c FILTER s.@attr2 == c.@attr RETURN s)
                                       LET sub3 = (FOR s IN @@c FILTER s.@attr3 == c.@attr RETURN s)
                                       LET sub4 = (FOR s IN @@c FILTER s.@attr4 == c.@attr RETURN s)
                                       LET sub5 = (FOR s IN @@c FILTER s.@attr5 == c.@attr RETURN s)
                                    RETURN LENGTH(sub1) + LENGTH(sub2) + LENGTH(sub3) + LENGTH(sub4) + LENGTH(sub5)
                      `,
                      bindParamModifier: function(param, bindParam) {
                          bindParam.attr = "value1";
                          bindParam.attr2 = "value2";
                          bindParam.attr3 = "value3";
                          bindParam.attr4 = "value4";
                          bindParam.attr5 = "value5";
                      }
           }
        }, */
        {
           name: "aql-multi-subqueries",
           params: { func: genericSubquerySplicing,
                      queryString: `FOR c IN @@c
                                       LET sub1 = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s)
                                       LET sub2 = (FOR s IN @@c FILTER s.@attr2 == c.@attr RETURN s)
                                    RETURN LENGTH(sub1) + LENGTH(sub2)
                      `,
                      bindParamModifier: function(param, bindParam) {
                          bindParam.attr = "value1";
                          bindParam.attr2 = "value2";
                      }
           }
        }
      ],
      satelliteGraphTests = [
        {
           name: "aql-multi-subqueries",
           params: { func: genericSatelliteGraph,
                      queryString: `FOR v, e, p IN 1..3 OUTBOUND DOCUMENT(@@v, "test0") GRAPH @g RETURN v
                      ` }
        }
      ];

    const runSatelliteGraphTests = (global.satelliteGraphTests && isEnterprise && isCluster);

    if (global.documents || global.edges || global.search ||
      global.noMaterializationSearch || global.subqueryTests || runSatelliteGraphTests) {
      initializeValuesCollection();
    }
    if (global.edges || global.subqueryTests) {
      initializeEdgeCollection();
    }
    if (runSatelliteGraphTests) {
      initializeGraphs();
    }
    if (global.search) {
      initializeView();
    }
    if (global.phrase) {
      initializePhrasesView();
    }
    if (global.noMaterializationSearch) {
      initializeStoredValuesView();
    }

    let output = "",
      csv = "",
      options;

    // document tests
    if (global.documents) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          db._collection(params.collection).load();
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "values10000", label: "10k", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "values100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
      }

      let documentTestsResult = testRunner(documentTests, options);
      output += toString("Documents", documentTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(documentTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(documentTestsResult);
      }
    }

    // edge tests
    if (global.edges) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          db._collection(params.collection).load();
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "edges10000", label: "10k", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "edges100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "edges1000000", label: "1000k", size: 1000000 });
      }

      let edgeTestsResult = testRunner(edgeTests, options);
      output += toString("Edges", edgeTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(edgeTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(edgeTestsResult);
      }
    }

    // arangosearch tests
    if (global.search) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          params["view"] = "v_" + params.collection;
          params["offset"] = params.collectionSize / 10;
          params["limit"] = params.collectionSize / 2;
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "values10000", label: "10k", size: 10000});
      }

      if (global.medium) {
        options.collections.push({ name: "values100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
      }

      let arangosearchTestsResult = testRunner(arangosearchTests, options);
      output += toString("Arango Search", arangosearchTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(arangosearchTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(arangosearchTestsResult);
      }
    }

    // arangosearch phrase tests
    if (global.phrase) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          params["view"] = "v_" + params.collection;
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({
          name: "valuesPhrases10000",
          label: "10k",
          size: 10000
        });
      }

      if (global.medium) {
        options.collections.push({
          name: "valuesPhrases100000",
          label: "100k",
          size: 100000
        });
      }

      if (global.big) {
        options.collections.push({
          name: "valuesPhrases10000000",
          label: "10000k",
          size: 10000000
        });
      }

      let arangosearchPhrasesTestsResult = testRunner(
        arangosearchPhrasesTests,
        options
      );
      output +=
        toString("Arango Search Phrases", arangosearchPhrasesTestsResult) +
        "\n\n";

      if (global.outputXml) {
        toJUnit(arangosearchPhrasesTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(arangosearchPhrasesTestsResult);
      }
    }

    // arangosearch no materialization tests
    if (global.noMaterializationSearch) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          params["view"] = "v_stored_" + params.collection;
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "values10000", label: "10k", size: 10000});
      }

      if (global.medium) {
        options.collections.push({ name: "values100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
      }

      let arangosearchNoMaterializationTestsResult = testRunner(arangosearchNoMaterializationTests, options);
      output += toString("Arango Search No Materialization", arangosearchNoMaterializationTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(arangosearchNoMaterializationTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(arangosearchNoMaterializationTestsResult);
      }
    }

    // crud tests
    if (global.crud) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (/* params */) {},
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "crud10000", label: "10k", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "crud100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "crud1000000", label: "1000k", size: 1000000 });
      }

      let crudTestsResult = testRunner(crudTests, options);
      output += toString("CRUD", crudTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(crudTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(crudTestsResult);
      }
    }

    // arangosearch crud tests
    if (global.crudSearch) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          params["view"] = "v_" + params.collection;
        },
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "crud10000", label: "10k + ARS", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "crud100000", label: "100k + ARS", size: 100000 });
      }

      if (global.big) {
        options.collections.push({
          name: "crud1000000",
          label: "1000k + ARS",
          size: 1000000
        });
      }

      let arangosearchCrudTestsResult = testRunner(crudTests, options);
      output +=
        toString("Arango Search CRUD", arangosearchCrudTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(arangosearchCrudTestsResult, "ars-", "");
      }

      if (global.outputCsv) {
        csv += toCsv(arangosearchCrudTestsResult, "ars-", "");
      }
    }

    if (global.subqueryTests) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {
          db._collection(params.collection).load();
          if (params.edgesRequired === true) {
            db._collection(params.collection.replace("vertices", "edges")).load();
          }
      },
      teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "values10000", label: "10k", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "values100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
      }

      /* We run each test case with splicing enabled and with splicing disabled */
      var subqueryTestsCases = [];
      subqueryTests.forEach( function(item, index) {
          var noSplicingCase = _.cloneDeep(item);
          noSplicingCase.name = noSplicingCase.name + "-no-splicing";
          noSplicingCase.params.splice = false;
          subqueryTestsCases.push(noSplicingCase);
          var yesSplicingCase = _.cloneDeep(item);
          yesSplicingCase.name = yesSplicingCase.name + "-yes-splicing";
          yesSplicingCase.params.splice = true;
          subqueryTestsCases.push(yesSplicingCase);
      });

      let subqueryTestsResult = testRunner(subqueryTestsCases, options);
      output +=
        toString("Subquery Performance", subqueryTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(subqueryTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(subqueryTestsResult);
      }
    }

    if (global.satelliteGraphTests) {
      options = {
        runs: 5,
        digits: 4,
        setup: function (params) {},
        teardown: function () {},
        collections: [],
        removeFromResult: 1
      };

      if (global.small) {
        options.collections.push({ name: "values10000", label: "10k", size: 10000 });
      }

      if (global.medium) {
        options.collections.push({ name: "values100000", label: "100k", size: 100000 });
      }

      if (global.big) {
        options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
      }

      /* We run each test case with splicing enabled and with splicing disabled */
      var satelliteTestsCases = [];
      satelliteGraphTests.forEach( function(item, index) {
          let communityCase = _.cloneDeep(item);
          communityCase.name = communityCase.name + "-community";
          communityCase.params.graph = "comm";
          satelliteTestsCases.push(communityCase);
          let smartCase = _.cloneDeep(item);
          smartCase.name = smartCase.name + "-smart";
          smartCase.params.graph = "smart";
          satelliteTestsCases.push(smartCase);
          let satelliteCase = _.cloneDeep(item);
          satelliteCase.name = satelliteCase.name + "-satellite";
          satelliteCase.params.graph = "sat";
          satelliteTestsCases.push(satelliteCase);
      });


      let satelliteTestsResult = testRunner(satelliteTestsCases, options);
      output +=
        toString("Satellite Graph Performance", satelliteTestsResult) + "\n\n";

      if (global.outputXml) {
        toJUnit(satelliteTestsResult);
      }

      if (global.outputCsv) {
        csv += toCsv(satelliteTestsResult);
      }
    }

    // OneShard Feature /////////////////////////////////////////////////////
    if (global.oneshardTests) {
      let numberOfShards = 1;
      let checkForOneShardRule = true;
      if (global.numberOfShards) {
        numberOfShards = global.numberOfShards;
        checkForOneShardRule = false;
      }

      const oneshard = require("test-oneshard.js");

      const runTestCases1 = true;
      const runTestCases2 = true;

      let options = {
        runs: 3,
        digits: 4,
        setup: function (params) {},
        teardown: function () {},
        collections: [ "fakeCollectionOneShard" ],
        removeFromResult: 1,
        scale : 100 * 1000,
        "numberOfShards" : numberOfShards,
        replicationFactor : 1,
        checkForOneShardRule: checkForOneShardRule
      };

      let testPrefix = "OneShard - ";
      if (options.numberOfShards === 1) {
        testPrefix += "Single Shard - ";
      } else {
        testPrefix += "Multi Shard (for comparison) - ";
      }

      if (global.small) {
        options.scale = 10;
        options.runs = 6;
      }

      if (global.medium) {
        options.scale = 100 * 1000;
        options.runs = 4;
      }

      if (global.big) {
        options.scale = 100 * 1000;
        options.runs = 8;
      }

      if (runTestCases1 || runTestCases2) {
        oneshard.setup(options);
      }

      if (runTestCases1) {
        let oneshardTestsResult1 = testRunner(oneshard.testCases1, options);
        output += toString(testPrefix + "Mixed Queries", oneshardTestsResult1) + "\n\n";

        if (global.outputXml) {
          toJUnit(oneshardTestsResult1);
        }

        if (global.outputCsv) {
          csv += toCsv(oneshardTestsResult1);
        }
      }

      if (runTestCases2) {
        options.setup = (params) => {
          db._drop("testmann");
          db._create("testmann", { numberOfShards : options.numberOfShards,
                                   replicationFactor : options.replicationFactor });
        };

        options.teardown = (params) => {
          db._drop("testmann");
        };

        let oneshardTestsResult2 = testRunner(oneshard.testCases2, options);
        output += toString(testPrefix + "CRUD operations", oneshardTestsResult2) + "\n\n";

        if (global.outputXml) {
          toJUnit(oneshardTestsResult2);
        }

        if (global.outputCsv) {
          csv += toCsv(oneshardTestsResult2);
        }
      }

      oneshard.tearDown();

    }
    // OneShard Feature - End ///////////////////////////////////////////////

    print("\n" + output + "\n");

    if (global.outputCsv) {
      fs.writeFileSync("results.csv", csv);
    }
  };

  main();
};
