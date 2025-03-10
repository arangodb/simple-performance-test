"use strict";
const internal = require("internal");
const arango = internal.arango;
const AsciiTable = require("ascii-table");
const fs = require("fs");
const semver = require("semver");
const _ = require("lodash");
const db = require("org/arangodb").db;
require("internal").load("simple/BIGvertices.js");

GLOBAL.returnValue = 0;


function sum (values) {
  if (values.length > 1) {
    return values.reduce((previous, current) => previous + current);
  } else {
    return values[0];
  }
}

function calc (values, options) {
  values.sort((a, b) => a - b);

  const removeFromResult = parseInt(options.removeFromResult) || 0;
  if (removeFromResult > 0) {
    if (values.length > 2) {
      values.splice(values.length - 1, removeFromResult); // remove last
      values.splice(0, removeFromResult); // remove first
    }
  }

  const stddev = array => {
    const n = array.length;
    const mean = _.mean(array);
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
  };

  const n = values.length;
  return {
    min: values[0],
    max: values[n - 1],
    sum: sum(values),
    avg: sum(values) / n,
    med: n === 1
      ? values[0]
      : (n % 2
        ? (values[(n - 1) / 2] + values[(n + 1) / 2]) / 2
        : values[n / 2]),
    dev: n === 1
      ? values[0]
      : (values[n - 1] - values[0]) / (sum(values) / n),
    stddev: stddev(values)
  };
}

function toAsciiTable (title, out) {
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
      "stddev (s)",
      "med (s)",
      "total (s)"
    ).
    setAlign(2, AsciiTable.RIGHT).
    setAlign(3, AsciiTable.RIGHT).
    setAlign(4, AsciiTable.RIGHT).
    setAlign(5, AsciiTable.RIGHT).
    setAlign(6, AsciiTable.RIGHT).
    setAlign(7, AsciiTable.RIGHT).
    setAlign(8, AsciiTable.RIGHT).
    setAlign(9, AsciiTable.RIGHT);

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
      test.stddev,
      test.med,
      test.total
    );
  }

  return table.toString();
}

exports.test = function (testParams) {
  testParams.tiny = testParams.tiny || false;
  testParams.small = testParams.small || false;
  testParams.medium = testParams.medium || false;
  testParams.big = testParams.big || false;

  testParams.documents = testParams.documents || false;
  testParams.ioless = testParams.ioless || false;
  testParams.edges = testParams.edges || false;
  testParams.search = testParams.search || false;
  testParams.phrase = testParams.phrase || false;
  testParams.noMaterializationSearch = testParams.noMaterializationSearch || false;
  testParams.indexes = testParams.indexes || false;
  testParams.crud = testParams.crud || false;
  testParams.crudSearch = testParams.crudSearch || false;
  testParams.subqueryTests = testParams.subqueryTests || false;
  testParams.oneshardTests = testParams.oneshardTests || false;

  testParams.legacy = testParams.legacy === undefined ? true : testParams.legacy;

  testParams.runs = testParams.runs || 5;
  testParams.digits = testParams.digits || 4;

  testParams.outputXml = testParams.outputXml || false;
  testParams.xmlDirectory = testParams.xmlDirectory || ".";

  testParams.outputCsv = testParams.outputCsv || false;
  testParams.outputJson = testParams.outputJson || false;

  const numberOfShards = testParams.numberOfShards || 9;
  const replicationFactor = testParams.replicationFactor || 1;
  const writeConcern = testParams.writeConcern || replicationFactor;

  const time = internal.time;
  const print = internal.print;

  // Substring first 5 characters to limit to A.B.C format and not use any `nightly`, `rc`, `preview` etc.
  const serverVersion = (((typeof arango) !== "undefined") ? arango.getVersion() : internal.version).split("-")[0];
  testParams.zkdMdiRenamed = semver.satisfies(serverVersion, ">3.11.99") ;
  const isEnterprise = internal.isEnterprise();
  const isCluster = internal.isCluster();

  print(`Running against version ${serverVersion} ${isEnterprise ? "Enterprise" : ""} ${isCluster ? "Cluster" : ""}`);
  print(db._version(true));
  const supportsSatelliteGraphs = true;
  const supportsOnlySplicedSubqueries = true;

  let silent = true;
  const testRunner = function (tests, options) {
    const buildParams = function (test, collection) {
      const params = test.params;
      if (collection !== null) {
        params.collection = collection.name;
        params.collectionSize = collection.size;
      }
      params.scale = options.scale;
      if (options.hasOwnProperty("iterations")) {
        params.iterations = options.iterations;
      }
      return params;
    };

    const timedExecution = function (test, collection) {
      const params = buildParams(test, collection);
      const start = time();
      if (typeof params.setupEachCall === "function") {
        params.setupEachCall(params);
      }
      test.params.func(params);
      const end = time();

      if (typeof params.teardownEachCall === "function") {
        params.teardownEachCall(params);
      }
      return end - start;
    };

    const measure = function (test, collection, options) {
      let results = [];
      const runs = options.runs > 0 ? options.runs : 1;

      for (let i = 0; i < runs + 1; ++i) {
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
    }; // measure

    let run = function (tests, options) {
      let out = [];
      let errors = [];
      for (let i = 0; i < tests.length; ++i) {
        let test = tests[i];
        print(test)
        try {
          if (!(test['version'] === undefined || semver.satisfies(serverVersion, test['version']))) {
            print(`skipping test ${test['name']}, requires version ${test['version']}`);
          } else if (test['legacy'] && !testParams.legacy) {
          print(`skipping legacy test ${test['name']}`);
          } else {
            print(`running test ${test['name']}`);
            for (let j = 0; j < options.collections.length; ++j) {
              let collection = options.collections[j];

              const startTotal = time();
              const results = measure(test, collection, options);
              const endTotal = time();
              const stats = calc(results, options);

              const result = {
                name: test['name'],
                runs: options.runs,
                min: stats.min.toFixed(options.digits),
                max: stats.max.toFixed(options.digits),
                dev: (stats.dev * 100).toFixed(2),
                avg: stats.avg.toFixed(options.digits),
                stddev: stats.stddev.toFixed(options.digits),
                med: stats.med.toFixed(options.digits),
                total: (endTotal - startTotal).toFixed(options.digits)
              };
              if (collection !== null) {
                result.collectionLabel = collection.label;
                result.collectionSize = collection.size;
              } else {
                result.collectionLabel = "";
                result.collectionSize = 0;
              }

              out.push(result);
            } // for j
          }
        } catch (ex) {
          print(`exception in test ${test['name']}: ${String(ex)}\n${String(ex.stack)}`);
          errors.push({ name: test['name'], error: ex });
          GLOBAL.returnValue = 1;
        }
      } // for i

      return { results: out, errors };
    };

    return run(tests, options);
  }; // testrunner

  const toJUnit = function (out, prefix, postfix) {
    prefix = prefix || "";
    postfix = postfix || "";

    for (let i = 0; i < out.length; ++i) {
      let test = out[i];
      let name = prefix + test.name + postfix;

      fs.writeFileSync(
        fs.join(testParams.xmlDirectory, `pref-${name}.xml`),
        `<?xml version="1.0" encoding="UTF-8"?><testsuite><testcase classname="${name}" name="avg" time="${test.avg *
          1000}" /><testcase classname="${name}" name="med" time="${test.med *
          1000}" /></testsuite>`
      );
    }
  };

  const toCsv = function (out, prefix, postfix) {
    prefix = prefix || "";
    postfix = postfix || "";

    let size = "none";

    if (testParams.tiny) {
      size = "tiny";
    } else if (testParams.small) {
      size = "small";
    } else if (testParams.medium) {
      size = "medium";
    } else if (testParams.big) {
      size = "big";
    }

    let csv = "";

    for (let i = 0; i < out.length; ++i) {
      let test = out[i];
      csv += `${prefix}${test.name}${postfix},${test.avg},${test.med},${test.min},${test.max},${test.dev},${test.collectionLabel},${test.collectionSize},${test.runs},${size}\n`;
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

  function fillCollection (c, n, generator, batchSize) {
    batchSize = batchSize || 10000;

    let batch = [];

    for (let i = 0; i < n; i++) {
      batch.push(generator(i));

      if (batch.length === batchSize) {
        c.insert(batch);
        print("inserted", batchSize, "documents");
        batch = [];
      }
    }

    if (batch.length > 0) {
      print("inserted", batch.length, "documents");
      c.insert(batch);
    }
  }

  function fillEdgeCollection (c, n, vc) {
    let j = 0,
      k = 50,
      l = 0;
    fillCollection(c, n, function (i) {
      let obj = {
        _key: "test" + i,
        _from: `${vc.name()}/test${j}`,
        _to: `${vc.name()}/test${i}`,
        value: i + "-" + j
      };
      if (++l === k) {
        ++j;
        l = 0;
        k--;
        if (k === 0) {
          k = 50;
        }
      }
      return obj;
    });
  }

  function fillDocumentCollection (c, n, g) {
    fillCollection(c, n, function (i) {
      return {
        _key: "test" + i,
        value1: i,
        value2: "test" + i,
        value3: i,
        value4: "test" + i,
        value5: i,
        value6: "test" + i,
        value7: i % g,
        value8: "test" + (i % g)
      };
    });
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

        fillDocumentCollection(c, n, g);

        c.ensureIndex({ type: "persistent", fields: ["value1"] });
        c.ensureIndex({ type: "persistent", fields: ["value2"] });
        c.ensureIndex({ type: "persistent", fields: ["value3"] });
        c.ensureIndex({ type: "persistent", fields: ["value4"] });
      }

      if (testParams.tiny) {
        createDocuments(1000);
      } else if (testParams.small) {
        createDocuments(10000);
      } else if (testParams.medium) {
        createDocuments(100000);
      } else if (testParams.big) {
        createDocuments(1000000);
      }

      internal.wal.flush(true, true);
    },

    initializeSearchCollection = function () {
      function createDocuments (n) {
        let name = "valuesForSearch" + n;
        if (db._collection(name) !== null) {
          return;
        }
        db._drop(name);
        internal.print("creating collection " + name);
        let c = db._create(name, {numberOfShards}),
          g = n / 100;

        fillDocumentCollection(c, n, g);
      }

      // Generate bigger collections for testing ArangoSearch
      if (testParams.tiny) {
        createDocuments(100000);
      } else if (testParams.small) {
        createDocuments(1000000);
      } else if (testParams.medium) {
        createDocuments(10000000);
      } else if (testParams.big) {
        createDocuments(33000000);
      }

      internal.wal.flush(true, true);
    },

    initializeView = function () {
      function createView (n) {
        let params = {
          name: "v_valuesForSearch" + n,
          collections: ["valuesForSearch" + n],
          analyzers: ["identity"],
          storedValues: []
        };

        createArangoSearch(params);
      }

      if (testParams.tiny) {
        createView(100000);
      } else if (testParams.small) {
        createView(1000000);
      } else if (testParams.medium) {
        createView(10000000);
      } else if (testParams.big) {
        createView(33000000);
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
        fillEdgeCollection(c, n, db._collection("values" + n));
      }

      if (testParams.tiny) {
        createEdges(1000);
      } else if (testParams.small) {
        createEdges(10000);
        makeGraph("Tree", "TreeV", "TreeE");
        makeTree(6, "TreeV", "TreeE");
      } else if (testParams.medium) {
        createEdges(100000);
        makeGraph("Tree", "TreeV", "TreeE");
        makeTree(7, "TreeV", "TreeE");
      } else if (testParams.big) {
        createEdges(1000000);
        makeGraph("Tree", "TreeV", "TreeE");
        makeTree(8, "TreeV", "TreeE");
      }

      internal.wal.flush(true, true);
    },

    initializeGraphs = function () {

      if (!supportsSatelliteGraphs) {
        print("Satellite graphs are not supported");
      }

      function createSatelliteGraph (name) {
        let vertexCollectionName = name + "_vertex";
        let edgesCollectionName = name + "_edge";

        var graphModule = require("@arangodb/satellite-graph");
        if (graphModule._exists(name)) {
          let g = graphModule._graph(name);
          return { graph: g,
            vertex: g[vertexCollectionName],
            edges: db[edgesCollectionName] };
        }

        let g = graphModule._create(name, [ graphModule._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], {});
        return { graph: g,
          vertex: g[vertexCollectionName],
          edges: db[edgesCollectionName] };
      }

      function createSmartGraph (name) {
        let vertexCollectionName = name + "_vertex";
        let edgesCollectionName = name + "_edge";

        var graphModule = require("@arangodb/smart-graph");
        if (graphModule._exists(name)) {
          let g = graphModule._graph(name);
          return { graph: g,
            vertex: g[vertexCollectionName],
            edges: db[edgesCollectionName] };
        }

        let opts = {smartGraphAttribute: "value2", numberOfShards };

        let g = graphModule._create(name, [ graphModule._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], opts);
        return { graph: g,
          vertex: g[vertexCollectionName],
          edges: db[edgesCollectionName] };
      }

      function createCommunityGraph (name) {
        let vertexCollectionName = name + "_vertex";
        let edgesCollectionName = name + "_edge";

        var graphModule = require("@arangodb/general-graph");
        if (graphModule._exists(name)) {
          let g = graphModule._graph(name);
          return { graph: g,
            vertex: g[vertexCollectionName],
            edges: db[edgesCollectionName] };
        }

        let g = graphModule._create(name, [ graphModule._relation(edgesCollectionName, vertexCollectionName, vertexCollectionName)], [], {});
        return { graph: g,
          vertex: g[vertexCollectionName],
          edges: db[edgesCollectionName] };
      }

      print("Creating community graph");
      let gc = createCommunityGraph("comm");

      print("Creating smart graph");
      let sg = createSmartGraph("smart");

      let satg;
      if (supportsSatelliteGraphs) {
        print("Creating satellite graph");
        satg = createSatelliteGraph("sat");
      }

      if (!gc || !sg || (supportsSatelliteGraphs && !satg)) {
        throw Error("failed to create graphs");
      }

      function fillGraphEdges (c, n, vc) {
        print("Filling edges for ", c.name());
        let j = 0,
          k = 50,
          l = 0;
        fillCollection(c, n, function (i) {
          let obj = {
            _key: "smart" + j + ":" + j + "_" + i + ":" + "smart" + i,
            _from: vc.name() + "/smart" + j + ":test" + j,
            _to: vc.name() + "/smart" + i + ":test" + i,
            value: j + "-" + i};
          if (++l === k) {
            ++j;
            l = 0;
            k--;
            if (k === 0) {
              k = 50;
            }
          }
          return obj;
        });
      }

      function fillGraphVertexes (c, n, g) {
        print("Filling Vertexes for ", c.name());
        fillCollection(c, n, function (i) {
          return {
            _key: "smart" + i + ":test" + i,
            value1: i,
            value2: "smart" + i,
            value3: i,
            value4: "test" + i,
            value5: i,
            value6: "test" + i,
            value7: i % g,
            value8: "test" + (i % g)
          };
        });
      }

      function createVertexes (n) {
        let g = n / 100;
        fillGraphVertexes(gc.vertex, n, g);
        fillGraphVertexes(sg.vertex, n, g);
        if (supportsSatelliteGraphs) {
          fillGraphVertexes(satg.vertex, n, g);
        }
      }

      function createEdges (n) {
        fillGraphEdges(gc.edges, n, gc.vertex);
        fillGraphEdges(sg.edges, n, sg.vertex);
        if (supportsSatelliteGraphs) {
          fillGraphEdges(satg.edges, n, satg.vertex);
        }
      }

      if (testParams.tiny) {
        createVertexes(1000);
        createEdges(1000);
      } else if (testParams.small) {
        createVertexes(10000);
        createEdges(10000);
      } else if (testParams.medium) {
        createVertexes(100000);
        createEdges(100000);
      } else if (testParams.big) {
        createVertexes(1000000);
        createEdges(1000000);
      }
    },

    initializePhrasesView = function () {
      function createPhrasesView (n) {
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

        let batchSize = 10000;
        let batch = [];

        let lowCount = 1000;

        for (let i = 0; i < n; ++i) {
          if (i % lowCount === 0) {
            // add some really low frequent phrase
            batch.push({
              _key: "testPhrase" + i,
              value2: "Low Phrase"
            });
            continue;
          }

          batch.push({
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
          if (batch.length === batchSize) {
            c.insert(batch);
            print("inserted", batchSize, "documents");
            batch = [];
          }
        }

        if (batch.length > 0) {
          print("inserted", batch.length, "documents");
          c.insert(batch);
        }
      }

      if (testParams.tiny) {
        createDocumentsWithPhrases(100000);
        createPhrasesView(100000);
      } else if (testParams.small) {
        createDocumentsWithPhrases(1000000);
        createPhrasesView(1000000);
      } else if (testParams.medium) {
        createDocumentsWithPhrases(10000000);
        createPhrasesView(10000000);
      } else if (testParams.big) {
        createDocumentsWithPhrases(33000000);
        createPhrasesView(33000000);
      }

      internal.wal.flush(true, true);
    },

    initializeStoredValuesView = function () {
      function createStoredValuesView (n) {
        let params = {
          name: "v_stored_values" + n,
          collections: ["values" + n],
          analyzers: ["identity"],
          storedValues: [
            { fields: ["value2"]},
            { fields: ["value1", "value3"]}
          ]
        };
        createArangoSearch(params);
      }

      if (testParams.tiny) {
        createStoredValuesView(1000);
      } else if (testParams.small) {
        createStoredValuesView(10000);
      } else if (testParams.medium) {
        createStoredValuesView(100000);
      } else if (testParams.big) {
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
      db._create(name, {numberOfShards, replicationFactor, writeConcern});
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

      const batchSize = params.batchSize;
      if (batchSize) {
        // perform babies operations
        for (let i = 0; i < n / batchSize; ++i) {
          let docs = [];
          for (let j = 0; j < batchSize; ++j) {
            docs.push({ _key: "test" + (i * batchSize + j), ...doc });
          }
          c.insert(docs);
        }
      } else {
        // perform single document operations
        for (let i = 0; i < n; ++i) {
          doc._key = "test" + i;
          c.insert(doc);
        }
      }
    },
    
    // /////////////////////////////////////////////////////////////////////////////
    // indexes tests
    // /////////////////////////////////////////////////////////////////////////////

    insertIndexOne = function (params) {
      let c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
        
      // perform small batch document operations
      const batchSize = params.batchSize || 100;
      let docs = [];
      if (params.type === "string") {
        for (let i = 0; i < n; ++i) {
          docs.push({ value1: "testmann1234" + i });
          if (docs.length === batchSize) {
            c.insert(docs);
            docs = [];
          }
        }
      } else {
        for (let i = 0; i < n; ++i) {
          docs.push({ value1: i });
          if (docs.length === batchSize) {
            c.insert(docs);
            docs = [];
          }
        }
      }
    },
    
    insertIndexTwo = function (params) {
      let c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
        
      // perform small batch document operations
      const batchSize = params.batchSize || 100;
      let docs = [];
      if (params.type === "string") {
        for (let i = 0; i < n; ++i) {
          docs.push({ value1: "testmann1234" + i, value2: "testmannabc" + i });
          if (docs.length === batchSize) {
            c.insert(docs);
            docs = [];
          }
        }
      } else {
        for (let i = 0; i < n; ++i) {
          docs.push({ value1: i, value2: i });
          if (docs.length === batchSize) {
            c.insert(docs);
            docs = [];
          }
        }
      }
    },

    // /////////////////////////////////////////////////////////////////////////////
    // CRUD Tests
    // /////////////////////////////////////////////////////////////////////////////

    insert = function (params) {
      fill(params);
    },

    update = function (params) {
      let c = db._collection(params.collection);
      const n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      const batchSize = params.batchSize;
      if (batchSize) {
        // perform babies operations
        for (let i = 0; i < n / batchSize; ++i) {
          let keys = [];
          let docs = [];
          for (let j = 0; j < batchSize; ++j) {
            const idx = i * batchSize + j;
            keys.push("test" + idx);
            docs.push({ value: idx + 1, value2: "test" + idx, value3: idx });
          }
          c.update(keys, docs);
        }
      } else {
        // perform single document operations
        for (let i = 0; i < n; ++i) {
          c.update("test" + i, { value: i + 1, value2: "test" + i, value3: i });
        }
      }
    },

    replace = function (params) {
      let c = db._collection(params.collection);
      const n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      const batchSize = params.batchSize;
      if (batchSize) {
        // perform babies operations
        for (let i = 0; i < n / batchSize; ++i) {
          let keys = [];
          let docs = [];
          for (let j = 0; j < batchSize; ++j) {
            const idx = i * batchSize + j;
            keys.push("test" + idx);
            docs.push({ value: idx + 1, value2: "test" + idx, value3: idx });
          }
          c.replace(keys, docs);
        }
      } else {
        // perform single document operations
        for (let i = 0; i < n; ++i) {
          c.replace("test" + i, { value: i + 1, value2: "test" + i, value3: i });
        }
      }
    },

    remove = function (params) {
      let c = db._collection(params.collection);
      const n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      const batchSize = params.batchSize;
      if (batchSize) {
        // perform babies operations
        for (let i = 0; i < n / batchSize; ++i) {
          let keys = [];
          for (let j = 0; j < batchSize; ++j) {
            keys.push("test" + (i * batchSize + j));
          }
          c.remove(keys);
        }
      } else {
        // perform single document operations
        for (let i = 0; i < n; ++i) {
          c.remove("test" + i);
        }
      }
    },

    count = function (params) {
      let c = db._collection(params.collection);
      // count itself is so fast that we need to repeat it for a considerable number of times
      for (let i = 0; i < 1000; ++i) {
        c.count();
      }
    },

    /* any is non-deterministic by design.
     * it has a random performance and thus is not useful in performance tests
    anyCrud = function (params) {
      let c = db._collection(params.collection);
      c.any();
    },
    */

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

    traversalProjections = function(params) {
      // Note that depth 8 is good for all three sizes small (6), medium (7)
      // and big (8). Depending on the size, we create a different tree.
      db._query(`FOR v IN 0..8 OUTBOUND "TreeV/S1:K1" GRAPH "Tree" RETURN v.data`, {}, {}, {silent});
    },

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
          start: params.collection.replace(/edges/, "values") + "/test0",
          dest: params.collection.replace(/edges/, "values") + "/test99999"
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
          start: params.collection.replace(/edges/, "values") + "/test9991",
          dest: params.collection.replace(/edges/, "values") + "/test501"
        },
        {},
        { silent }
      );
    },

    kShortestOutbound = function (params) {
      db._query(
        "WITH @@v FOR v IN OUTBOUND K_SHORTEST_PATHS @start TO @dest @@c RETURN v",
        {
          "@c": params.collection,
          "@v": params.collection.replace("edges", "values"),
          start: params.collection.replace(/edges/, "values") + "/test0",
          dest: params.collection.replace(/edges/, "values") + "/test99999"
        },
        {},
        { silent }
      );
    },

    kShortestAny = function (params) {
      db._query(
        "WITH @@v FOR v IN ANY K_SHORTEST_PATHS @start TO @dest @@c RETURN v",
        {
          "@c": params.collection,
          "@v": params.collection.replace("edges", "values"),
          start: params.collection.replace(/edges/, "values") + "/test9991",
          dest: params.collection.replace(/edges/, "values") + "/test501"
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

    rangesSubquery = function (params) {
      let number;
      if (testParams.big) {
        number = 100000;
      } else if (testParams.medium) {
        number = 10000;
      } else if (testParams.small) {
        number = 1000;
      } else if (testParams.tiny) {
        number = 100;
      }
      let rules = [];
      if (params.optimize) {
        rules.push("+inline-subqueries");
      } else {
        rules.push("-inline-subqueries");
      }
      let distinct = "";
      if (params.distinct) {
        distinct = "DISTINCT ";
      }
      db._query(
        "FOR i IN 1..@number LET sub = (FOR j IN 1..100 RETURN " + distinct + " j) FOR x IN sub RETURN [i, x]",
        {
          number
        },
        { optimizer: { rules } },
        { silent }
      );
    },

    returnConst = function (params) {
      db._query(
        "FOR c IN @@c RETURN 1",
        {
          "@c": params.collection
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

    sortDoubles = function (params) {
      db._query(
        "FOR c IN @@c SORT c.value5 * 1.1 RETURN c.value5",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    },

    sortIntegers = function (params) {
      db._query(
        "FOR c IN @@c LET value = c.value5 >= @max ? @max : c.value5 SORT value RETURN value",
        {
          "@c": params.collection,
          max: params.max
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

    filterLimit = function (params) {
      let op = "==";
      let offset = 0;
      if (params.op) {
        op = params.op;
      }
      if (params.offset) {
        offset = params.offset;
      }
      db._query(
        "FOR c IN @@c FILTER c.@attr " + op + " @value LIMIT @offset,@limit RETURN c.@attr",
        {
          "@c": params.collection,
          attr: params.attr,
          value: params.value,
          offset: offset,
          limit: params.limit
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

    collectCountOnly = function (params) {
      if (params.explicitAggregator) {
        db._query(
          "FOR c IN @@c COLLECT AGGREGATE cnt = COUNT(1) RETURN cnt",
          { "@c": params.collection },
          {},
          { silent }
        );
      } else {
        db._query(
          "FOR c IN @@c COLLECT WITH COUNT INTO cnt RETURN cnt",
          { "@c": params.collection },
          {},
          { silent }
        );
      }
    },

    indexCollectAggregate = function (params) {
      db._query(
        "FOR doc IN @@c COLLECT group = doc.@attr AGGREGATE agg = SUM(doc.@attr) RETURN [group, agg]",
        {
          "@c": params.collection,
          attr: params.attr
        },
        {},
        { silent }
      );
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

    numericSequence = function (n, offset = 0) {
      let result = [];
      for (let i = 0; i < n; ++i) {
        result.push(i + offset);
      }
      return result;
    },

    // /////////////////////////////////////////////////////////////////////////////
    // iolessTests
    // /////////////////////////////////////////////////////////////////////////////

    justCollect = function (params) {
      const gcd = function (a, b) {
        while (b !== 0) {
          const t = b;
          b = a % b;
          a = t;
        }

        return a;
      };
      // calculate `q` as a relatively large coprime to `n` to "shuffle" the
      // input of collect a little, so sort has to do some work.
      // i'd like to avoid any sort of rand() to improve the comparability of
      // runs slightly.
      const n = params.iterations;
      let q = Math.floor(n / 2) + 1;
      while (gcd(n, q) !== 1) {
        ++q;
      }

      const query = `
        FOR i IN 1..@iterations
          LET k = (i * @q) % @n
          COLLECT x = k % @mod
          ${params.count ? "WITH COUNT INTO cnt" : ""}
            OPTIONS { method: @method }
          ${params.sortNull ? "SORT null" : ""}
          RETURN ${params.count ? "[x, cnt]" : "x"}
      `;
      // Note that n == iterations
      const bind = {
        iterations: params.iterations,
        method: params.method,
        q,
        n
      };
      if (params.div) {
        bind.mod = Math.floor(params.iterations / params.div);
      } else {
        bind.mod = params.iterations;
      }

      db._query(query, bind, {}, { silent });
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
        "FOR d IN @@v SEARCH d.@attr0 == @value0 && d.@attr1 > @value1 RETURN d",
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
        "FOR d IN @@v SEARCH d.@attr0 < @value0 || d.@attr1 == @value1 RETURN d",
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
        "FOR d IN @@v  SEARCH d.@attr == @value  COLLECT WITH COUNT INTO c RETURN c",
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

    /*
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
    */
    genericSubquerySplicing = function (params) {
      let myOptimizer = { rules: [] };
      let bindParam = { "@c": params.collection };
      if ("bindParamModifier" in params) {
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
      db._query(
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
        "@c": params.collection,
        "g": params.graph,
        "v": params.graph + "_vertex"
      // "e": params.graph + "_edge"
      };

      if ("bindParamModifier" in params) {
        params.bindParamModifier(params, bindParam);
      }

      db._query(
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
          name: "aql-min-const-large",
          params: {
            func: passthru,
            name: "MIN",
            values: numericSequence(2000, 1000000000)
          }
        },
        {
          name: "aql-min-const-double",
          params: {
            func: passthru,
            name: "MIN",
            values: numericSequence(2000, 1234.567)
          }
        },
        {
          name: "aql-unique-const-restricted",
          params: {
            func: passthru,
            name: "UNIQUE",
            values: numericSequence(500)
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
          name: "aql-collect-count-only",
          params: { func: collectCountOnly }
        },
        {
          name: "aql-collect-count-only-aggregator",
          params: { func: collectCountOnly, explicitAggregator: true }
        },
        {
          name: "aql-index-collect-aggregate",
          params: { func: indexCollectAggregate, attr: "value1" }
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
          name: "aql-sort-double",
          params: { func: sortDoubles }
        },
        {
          name: "aql-sort-int1",
          params: { func: sortIntegers, max: 100 }
        },
        {
          name: "aql-sort-int2",
          params: { func: sortIntegers, max: 10000 }
        },
        {
          name: "aql-sort-int4",
          params: { func: sortIntegers, max: 1000000000 }
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
          name: "aql-filter-limit",
          params: { func: filterLimit, attr: "value6", value: "test111", limit: 100 }
        },
        {
          name: "aql-filter-limit-index",
          params: { func: filterLimit, attr: "value2", value: "test111", limit: 100 }
        },
        {
          name: "aql-filter-limit-false",
          params: { func: filterLimit, attr: "value5", op: "==", value: 99999999999999, limit: 1 }
        },
        {
          name: "aql-filter-limit-true",
          params: { func: filterLimit, attr: "value5", op: "!=", value: 99999999999999, offset: 78945, limit: 10312 }
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
          name: "aql-extract-number-nonindexed",
          params: { func: extract, attr: "value5" }
        },
        {
          name: "aql-extract-string-nonindexed",
          params: { func: extract, attr: "value6" }
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
          name: "aql-return-const",
          params: { func: returnConst }
        },
        {
          name: "aql-skip-index",
          params: { func: skipIndex, attr: "value1", limit: 10 }
        },
        {
          name: "aql-skip-docs",
          params: { func: skipDocs, attr: "value1", limit: 10 }
        },
        {
          name: "aql-ranges-inlined",
          params: { func: rangesSubquery, optimize: true, distinct: false }
        },
        {
          name: "aql-ranges-subquery",
          params: { func: rangesSubquery, optimize: false, distinct: false }
        },
        {
          name: "aql-ranges-subquery-distinct",
          params: { func: rangesSubquery, optimize: false, distinct: true }
        }
      ];

      // tests for index selectivity estimates
      let indexesTests = [
        {
          name: "indexes-insert1-numeric",
          params: {
            func: insertIndexOne,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"] }); 
            },
            type: "number",
            teardown: drop
          }
        },
        {
          name: "indexes-insert1-numeric-noestimates",
          params: {
            func: insertIndexOne,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"], estimates: false }); 
            },
            type: "number",
            teardown: drop
          }
        },
        {
          name: "indexes-insert1-string",
          params: {
            func: insertIndexOne,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"] }); 
            },
            type: "string",
            teardown: drop
          }
        },
        {
          name: "indexes-insert1-string-noestimates",
          params: {
            func: insertIndexOne,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"], estimates: false }); 
            },
            type: "string",
            teardown: drop
          }
        },
        {
          name: "indexes-insert2-numeric",
          params: {
            func: insertIndexTwo,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"] }); 
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value2"] }); 
            },
            type: "number",
            teardown: drop
          }
        },
        {
          name: "indexes-insert2-numeric-noestimates",
          params: {
            func: insertIndexTwo,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"], estimates: false }); 
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value2"], estimates: false }); 
            },
            type: "number",
            teardown: drop
          }
        },
        {
          name: "indexes-insert2-string",
          params: {
            func: insertIndexTwo,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"] }); 
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value2"] }); 
            },
            type: "string",
            teardown: drop
          }
        },
        {
          name: "indexes-insert2-string-noestimates",
          params: {
            func: insertIndexTwo,
            setup: function (params) {
              drop(params);
              create(params);
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value1"], estimates: false }); 
              db[params.collection].ensureIndex({ type: "persistent", fields: ["value2"], estimates: false }); 
            },
            type: "string",
            teardown: drop
          }
        },
      ];

      // Tests without collections/IO, to focus on aql block performance.
      let iolessTests = [
        {
          name: "collect-unique-sorted",
          params: { func: justCollect, method: "sorted" }
        },
        {
          name: "collect-unique-hash",
          params: { func: justCollect, method: "hash" }
        },
        {
          name: "collect-unique-hash-nosort",
          params: { func: justCollect, method: "hash", sortNull: true }
        },
        {
          name: "collect-non-unique-sorted",
          params: { func: justCollect, method: "sorted", div: 100 }
        },
        {
          name: "collect-non-unique-hash",
          params: { func: justCollect, method: "hash", div: 100 }
        },
        {
          name: "collect-non-unique-hash-nosort",
          params: { func: justCollect, method: "hash", div: 100, sortNull: true }
        },

        {
          name: "collect-count-unique-sorted",
          params: { func: justCollect, method: "sorted", count: true }
        },
        {
          name: "collect-count-unique-hash",
          params: { func: justCollect, method: "hash", count: true }
        },
        {
          name: "collect-count-unique-hash-nosort",
          params: { func: justCollect, method: "hash", sortNull: true, count: true }
        },
        {
          name: "collect-count-non-unique-sorted",
          params: { func: justCollect, method: "sorted", div: 100, count: true }
        },
        {
          name: "collect-count-non-unique-hash",
          params: { func: justCollect, method: "hash", div: 100, count: true }
        },
        {
          name: "collect-count-non-unique-hash-nosort",
          params: { func: justCollect, method: "hash", div: 100, sortNull: true, count: true }
        }
      ];
      let edgeTests = [
        {
          name: "traversal-projections",
          params: { func: traversalProjections }
        },        
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
          name: "k-shortest-outbound",
          params: { func: kShortestOutbound }
        },
        {
          name: "k-shortest-any",
          params: { func: kShortestAny }
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
      ];
      let arangosearchTests = [
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
          params: {
            func: arangosearchRangeLookupFunc,
            attr: "_key",
            minValue: "test36",
            includeMin: true,
            maxValue: "test4242",
            includeMax: true
          }
        },
        {
          name: "ars-aql-basic-conjunction",
          params: {
            func: arangosearchBasicConjunction,
            attr0: "value8",
            value0: "test42",
            attr1: "value1",
            value1: 999990
          }
        },
        {
          name: "ars-aql-basic-disjunction",
          params: {
            func: arangosearchBasicDisjunction,
            attr0: "value1",
            value0: 5680,
            attr1: "value8",
            value1: "test9991"
          }
        },
        {
          name: "ars-aql-disjunction",
          params: {
            func: arangosearchDisjunction,
            attr: "value8",
            value: [
              "a",
              "122",
              "test100000",
              "test9",
              "test402",
              "test37300",
              "test76",
              "test98",
              "test200000000",
              "invalid",
              "test1",
              "test12345",
              "test8",
              12,
              "test666",
              "test4242",
              "test42424",
              "test7",
              "test042",
              "test@"
            ]
          }
        },
        {
          name: "ars-aql-prefix-low",
          params: {
            func: arangosearchPrefix,
            attr: "value2",
            value: "test420"
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
            func: arangosearchCountOnViewLimited,
            offset: 100,
            limit: 100
          }
        },
        {
          name: "ars-aql-collect-count-searched",
          params: {
            func: arangosearchCountOnViewSearched,
            attr: "value8",
            value: "test42"
          }
        }
      ];
      let arangosearchPhrasesTests = [
        {
          name: "ars-aql-phrase-minmatch-low",
          analyzers: true,
          params: {
            func: arangosearchMinMatch2of3,
            attr1: "value2",
            value1: "nomatch",
            value2: "low",
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
            value: "Quick Red"
          }
        }
      ];
      let arangosearchNoMaterializationTests = [
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
      ];
      let crudTests = [
        {
          name: "crud-insert",
          params: {
            func: insert,
            setup: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop
          }
        },
        {
          name: "crud-insert-babies",
          params: {
            func: insert,
            setup: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop,
            batchSize: 100
          }
        },
        {
          name: "crud-insert-size4",
          params: {
            func: insert,
            setup: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop,
            docSize: 4
          }
        },
        {
          name: "crud-insert-size4-babies",
          params: {
            func: insert,
            setup: function (params) {
              drop(params);
              create(params);
            },
            teardown: drop,
            docSize: 4,
            batchSize: 100
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
          },
          legacy: true
        },
        {
          // crud-update/replace/remove use setupEachCall for the setup
          // which currently is INSIDE the measured code and therefore
          // distorts the time measurements.
          // Since we do not want to modify existing tests we introduce
          // new tests that fix this (and also use a more efficient setup)
          // so we maintain comparability, but we should phase out the old
          // tests eventually.
          name: "crud-update-single",
          params: {
            func: update,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop
          }
        },
        {
          name: "crud-update-babies",
          params: {
            func: update,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop,
            batchSize: 100
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
          },
          legacy: true
        },
        {
          name: "crud-replace-single",
          params: {
            func: replace,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop
          }
        },
        {
          name: "crud-replace-babies",
          params: {
            func: replace,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop,
            batchSize: 100
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
          },
          legacy: true
        },
        {
          name: "crud-remove-single",
          params: {
            func: remove,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop
          }
        },
        {
          name: "crud-remove-babies",
          params: {
            func: remove,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
            },
            teardown: drop,
            batchSize: 100
          }
        },
        {
          name: "crud-count-repeated",
          params: {
            func: count,
            setup: function (params) {
              drop(params);
              create(params);
              fill({...params, batchSize: 1000});
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
              fill({...params, batchSize: 1000});
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
              fill({...params, batchSize: 1000});
            },
            teardown: drop
          }
        }
        /*
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
        */
      ];
      let subqueryTests = [
        /*        {
                  name: "aql-subquery-splicing-compare",
                  params: { func: subquerySplicingValidation, attr: "value1" }
                  }, */
        {
          name: "aql-subquery-1",
          params: {
            func: genericSubquerySplicing,
            queryString: "FOR c IN @@c LET sub = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s) RETURN LENGTH(sub)",
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value1";
            }
          }
        },
        {
          name: "aql-sub-subquery",
          params: {
            func: genericSubquerySplicing,
            queryString: "FOR c IN @@c LET sub = (FOR s IN 1..2 LET subsub = (FOR t IN @@c FILTER t.@attr == c.@attr + s RETURN t) FILTER LENGTH(subsub) > 0 RETURN s) RETURN LENGTH(sub)",
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value1";
            }
          }
        },
        {
          name: "aql-subquery-min",
          params: {
            func: genericSubquerySplicing,
            queryString: "RETURN MIN(FOR c IN @@c RETURN c.@attr)",
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value1";
            }
          }
        },
        {
          name: "aql-subquery-min-no-index",
          params: {
            func: genericSubquerySplicing,
            queryString: "RETURN MIN(FOR c IN @@c RETURN c.@attr)",
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value6";
            }
          }
        },
        {
          name: "aql-subquery-max",
          params: {
            func: genericSubquerySplicing,
            queryString: "RETURN MAX(FOR c IN @@c RETURN c.@attr)",
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value1";
            }
          }
        },
        {
          name: "aql-subquery-shortest-path",
          params: {
            func: genericSubquerySplicing,
            queryString: `
                       FOR v IN @@c
                         LET hasPath = (FOR s IN INBOUND SHORTEST_PATH v TO @source @@e RETURN 1)
                         FILTER LENGTH(hasPath) > 0
                       RETURN v
                    `,
            edgesRequired: true,
            bindParamModifier: function (param, bindParam) {
              bindParam.source = `${param.collection}/test2`;
            }
          }
        },
        {
          name: "aql-subquery-traversal",
          params: {
            func: genericSubquerySplicing,
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
            bindParamModifier: function (param, bindParam) {
              delete bindParam.attr;
            }
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
         },
        */
        {
          name: "aql-concatenated-subqueries",
          params: {
            func: genericSubquerySplicing,
            queryString: `FOR c IN @@c
                                       LET sub1 = (FOR s IN @@c FILTER s.@attr == c.@attr RETURN s)
                                       LET sub2 = (FOR s IN @@c FILTER s.@attr2 == c.@attr RETURN s)
                                    RETURN LENGTH(sub1) + LENGTH(sub2)
                      `,
            bindParamModifier: function (param, bindParam) {
              bindParam.attr = "value1";
              bindParam.attr2 = "value2";
            }
          }
        }
      ];
      let satelliteGraphTests = [
        {
          name: "aql-traversal-index-join",
          params: {
            func: genericSatelliteGraph,
            queryString: `
                        FOR v, e, p IN 1..3 OUTBOUND CONCAT(@v, "/smart0:test0") GRAPH @g
                          FOR doc in @@c
                            FILTER doc.value1 == v.value1
                            RETURN doc
                      ` }
        },
        {
          name: "aql-traversal-graph",
          params: {
            func: genericSatelliteGraph,
            queryString: `
                        FOR v, e, p IN 1..3 OUTBOUND CONCAT(@v, "/smart0:test0") GRAPH @g
                          return v`,
            bindParamModifier: function (param, bindParam) {
              delete bindParam["@c"];
            }
          }
        },
        {
          name: "aql-index-traversal-graph",
          params: {
            func: genericSatelliteGraph,
            queryString: `
                        for doc in @@c
                          filter doc.value1 >= 0 and doc.value1 <= 10
                          let vkey = CONCAT(@v,"/smart", doc.value3, ":test", doc.value3)
                          for v, e, p in 1..4 outbound vkey graph @g
                            return {doc, p}
                        `
          }
        },
        {
          name: "aql-enum-collection-traversal-graph",
          params: {
            func: genericSatelliteGraph,
            queryString: `
                        for doc in @@c
                          let vkey = CONCAT(@v,"/smart", doc.value3, ":test", doc.value3)
                          for v, e, p in 1..4 outbound vkey graph @g
                            filter v.value1 <= doc.value1
                            return {doc, p}
                        `
          }
        }
      ];

      function mdiTest (params) {
        let bindParam = { "@col": params.collection };
        if ("bindParamModifier" in params) {
          params.bindParamModifier(params, bindParam);
        }
        db._query(
          params.queryString,
          bindParam,
        );
      }

      let MdiTests = [
        {
          name: "aql-mdi-equal",
          params: {
            func: mdiTest,
            queryString: `
        FOR d IN @@col
          FILTER d.x >= 0 && d.y == 0
          RETURN d`
          }
        },
        {
          name: "aql-mdi-incl-range",
          params: {
            func: mdiTest,
            queryString: `
        FOR d IN @@col
          FILTER d.x <= 100 and d.y >= 50
          RETURN d`
          }
        },
        {
          name: "aql-mdi-incl-range-equal",
          params: {
            func: mdiTest,
            queryString: `
        FOR d IN @@col
          FILTER d.x <= 69 and d.y == 8
          RETURN d`
          }
        },
        {
          name: "aql-mdi-range",
          params: {
            func: mdiTest,
            queryString: `
        FOR d IN @@col
          FILTER d.x > 50 and d.y < 47
          RETURN d`
          }
        },
        {
          name: "aql-mdi-equal-incl-range",
          params: {
            func: mdiTest,
            queryString: `
        FOR d IN @@col
          FILTER d.x == 9 and d.y >= 52
          RETURN d`
          }
        },
      ];

      const runSatelliteGraphTests = (testParams.satelliteGraphTests && isEnterprise && isCluster);

      if (testParams.documents || testParams.edges || testParams.noMaterializationSearch || testParams.subqueryTests || runSatelliteGraphTests) {
        initializeValuesCollection();
      }
      if (testParams.search) {
        initializeSearchCollection();
      }
      if (testParams.edges || testParams.subqueryTests) {
        initializeEdgeCollection();
      }
      if (runSatelliteGraphTests) {
        initializeGraphs();
      }
      if (testParams.search) {
        initializeView();
      }
      if (testParams.phrase) {
        initializePhrasesView();
      }
      if (testParams.noMaterializationSearch) {
        initializeStoredValuesView();
      }

      let output = "",
        csv = "",
        result = { config: { ...testParams }, results: {}},
        options;

      const runTestSuite = function (name, tests, options, prefix = "", postfix = "") {
        const { results: testsResults, errors } = testRunner(tests, options);
        result.results[name] = testsResults;
        output += toAsciiTable(name, testsResults) + "\n\n";
        for (const err of errors) {
          output += `Test ${err.name} failed with exception: ${err.error}\n`;
          GLOBAL.returnValue = 1;
        }

        if (testParams.outputXml) {
          toJUnit(testsResults, prefix, postfix);
        }

        if (testParams.outputCsv) {
          csv += toCsv(testsResults, prefix, postfix);
        }
      };

      // document tests
      if (testParams.documents) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            db._collection(params.collection).load();
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "values1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "values10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "values100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
        }

        runTestSuite("Documents", documentTests, options);
      }

      // mdi tests
      if (testParams.mditests) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            db._drop(params.collection);
            let col = db._create(params.collection);
            let type = (testParams.zkdMdiRenamed) ? "mdi":"zkd";
            col.ensureIndex({type: type, name: "mdiIndex", fields: ["x", "y"], fieldValueTypes: "double"});
            db._query(`
              FOR i IN 0..${params.collectionSize}
                LET x = (i - 500) / 10
                LET y = x + 0.5
                INSERT {x, y, i} INTO ${params.collection}
            `);
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "MDIvalues1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "MDIvalues10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "MDIvalues100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "MDIvalues1000000", label: "1000k", size: 1000000 });
        }

        runTestSuite("MDI", MdiTests, options);
      }

      if (testParams.ioless) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function () {},
          teardown: function () {},
          iterations: null,
          collections: [null],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.iterations = 10000;
        } else if (testParams.small) {
          options.iterations = 100000;
        } else if (testParams.medium) {
          options.iterations = 1000000;
        } else if (testParams.big) {
          options.iterations = 10000000;
        }

        runTestSuite("IOless", iolessTests, options);
      }

      // edge tests
      if (testParams.edges) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            db._collection(params.collection).load();
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "edges1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "edges10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "edges100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "edges1000000", label: "1000k", size: 1000000 });
        }

        runTestSuite("Edges", edgeTests, options);
      }

      // arangosearch tests
      if (testParams.search) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            params["view"] = "v_" + params.collection;
            params["offset"] = params.collectionSize / 10;
            params["limit"] = params.collectionSize / 2;
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "valuesForSearch100000", label: "100k", size: 100000});
        } else if (testParams.small) {
          options.collections.push({ name: "valuesForSearch1000000", label: "1M", size: 1000000});
        } else if (testParams.medium) {
          options.collections.push({ name: "valuesForSearch10000000", label: "10M", size: 10000000});
        } else if (testParams.big) {
          options.collections.push({ name: "valuesForSearch33000000", label: "33M", size: 33000000});
        }

        runTestSuite("Arango Search", arangosearchTests, options);
      }

      // arangosearch phrase tests
      if (testParams.phrase) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            params["view"] = "v_" + params.collection;
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({
            name: "valuesPhrases100000",
            label: "100k",
            size: 100000
          });
        } else if (testParams.small) {
          options.collections.push({
            name: "valuesPhrases1000000",
            label: "1M",
            size: 1000000
          });
        } else if (testParams.medium) {
          options.collections.push({
            name: "valuesPhrases10000000",
            label: "10M",
            size: 10000000
          });
        } else if (testParams.big) {
          options.collections.push({
            name: "valuesPhrases33000000",
            label: "33M",
            size: 33000000
          });
        }

        runTestSuite("Arango Search Phrases", arangosearchPhrasesTests, options);
      }

      // arangosearch no materialization tests
      if (testParams.noMaterializationSearch) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            params["view"] = "v_stored_" + params.collection;
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "values1000", label: "1k", size: 1000});
        } else if (testParams.small) {
          options.collections.push({ name: "values10000", label: "10k", size: 10000});
        } else if (testParams.medium) {
          options.collections.push({ name: "values100000", label: "100k", size: 100000});
        } else if (testParams.big) {
          options.collections.push({ name: "values1000000", label: "1000k", size: 1000000});
        }

        runTestSuite("Arango Search No Materialization", arangosearchNoMaterializationTests, options);
      }
      
      // indexes tests
      if (testParams.indexes) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (/* params */) {},
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "indexes1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "indexes10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "indexes100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "indexes1000000", label: "1000k", size: 1000000 });
        }

        runTestSuite("indexes", indexesTests, options);
      }

      // crud tests
      if (testParams.crud) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (/* params */) {},
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "crud1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "crud10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "crud100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "crud1000000", label: "1000k", size: 1000000 });
        }

        runTestSuite("CRUD", crudTests, options);
      }

      // arangosearch crud tests
      if (testParams.crudSearch) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function (params) {
            params["view"] = "v_" + params.collection;
          },
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "crud1000", label: "1k + ARS", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "crud10000", label: "10k + ARS", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "crud100000", label: "100k + ARS", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "crud1000000", label: "1000k + ARS", size: 1000000 });
        }

        runTestSuite("Arango Search CRUD", crudTests, options, "ars-", "");
      }

      if (testParams.subqueryTests) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
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

        if (testParams.tiny) {
          options.collections.push({ name: "values1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "values10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "values100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
        }

        /* We run each test case with splicing enabled and with splicing disabled */
        var subqueryTestsCases = [];
        subqueryTests.forEach(function (item) {
          if (!supportsOnlySplicedSubqueries) {
            subqueryTestsCases.push({...item, name: item.name + "-no-splicing", params: {...item.params, splice: false}});
          }
          subqueryTestsCases.push({...item, name: item.name + "-yes-splicing", params: {...item.params, splice: true}});
        });

        runTestSuite("Subquery Performance", subqueryTestsCases, options);
      }

      if (testParams.satelliteGraphTests) {
        options = {
          runs: testParams.runs,
          digits: testParams.digits,
          setup: function () {},
          teardown: function () {},
          collections: [],
          removeFromResult: 1
        };

        if (testParams.tiny) {
          options.collections.push({ name: "values1000", label: "1k", size: 1000 });
        } else if (testParams.small) {
          options.collections.push({ name: "values10000", label: "10k", size: 10000 });
        } else if (testParams.medium) {
          options.collections.push({ name: "values100000", label: "100k", size: 100000 });
        } else if (testParams.big) {
          options.collections.push({ name: "values1000000", label: "1000k", size: 1000000 });
        }

        var satelliteTestsCases = [];
        satelliteGraphTests.forEach(function (item) {
          let communityCase = _.cloneDeep(item);
          communityCase.name = communityCase.name + "-community";
          communityCase.params.graph = "comm";
          satelliteTestsCases.push(communityCase);
          let smartCase = _.cloneDeep(item);
          smartCase.name = smartCase.name + "-smart";
          smartCase.params.graph = "smart";
          satelliteTestsCases.push(smartCase);
          if (supportsSatelliteGraphs) {
            let satelliteCase = _.cloneDeep(item);
            satelliteCase.name = satelliteCase.name + "-satellite";
            satelliteCase.params.graph = "sat";
            satelliteTestsCases.push(satelliteCase);
          }
        });

        runTestSuite("Satellite Graph Performance", satelliteTestsCases, options);
      }

      // OneShard Feature /////////////////////////////////////////////////////
      if (testParams.oneshardTests) {
        let numberOfShards = 1;
        let checkForOneShardRule = true;
        if (testParams.numberOfShards) {
          numberOfShards = testParams.numberOfShards;
          checkForOneShardRule = false;
        }

        const oneshard = require("./simple/test-oneshard");

        const runTestCases1 = true;
        const runTestCases2 = true;

        let options = {
          runs: Math.max(Math.floor((testParams.runs + 1) / 2), 1),
          digits: testParams.digits,
          setup: function () {},
          teardown: function () {},
          collections: [ "fakeCollectionOneShard" ],
          removeFromResult: 1,
          scale: 100 * 1000,
          "numberOfShards": numberOfShards,
          replicationFactor: 1,
          checkForOneShardRule: checkForOneShardRule
        };

        let testPrefix = "OneShard - ";
        if (options.numberOfShards === 1) {
          testPrefix += "Single Shard - ";
        } else {
          testPrefix += "Multi Shard (for comparison) - ";
        }

        if (testParams.tiny) {
          options.scale = 10;
          options.runs = 6;
        } else if (testParams.small) {
          options.scale = 10;
          options.runs = 6;
        } else if (testParams.medium) {
          options.scale = 100 * 1000;
          options.runs = 4;
        } else if (testParams.big) {
          options.scale = 100 * 1000;
          options.runs = 8;
        }

        if (runTestCases1 || runTestCases2) {
          oneshard.setup(options);
        }

        if (runTestCases1) {
          runTestSuite(testPrefix + "Mixed Queries", oneshard.testCases1, options);
        }

        if (runTestCases2) {
          options.setup = () => {
            db._drop("testmann");
            db._create("testmann", { numberOfShards: options.numberOfShards,
              replicationFactor: options.replicationFactor });
          };

          options.teardown = () => {
            db._drop("testmann");
          };

          runTestSuite(testPrefix + "CRUD operations", oneshard.testCases2, options);
        }

        oneshard.tearDown();

      }
      // OneShard Feature - End ///////////////////////////////////////////////

      print("\n" + output + "\n");

      if (testParams.outputCsv) {
        fs.writeFileSync("results.csv", csv);
      }

      if (testParams.outputJson) {
        fs.writeFileSync("results.json", JSON.stringify(result));
      }
      return GLOBAL.returnValue;
    };

  return main();
};
