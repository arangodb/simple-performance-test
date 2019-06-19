(function() {
  "use strict";

  const internal = require("internal");
  const time = internal.time;
  const print = internal.print;
  const db = require("org/arangodb").db;

  var silent = true,
    testRunner = function(tests, options) {
        var calc = function(values, options) {
          var sum = function(values) {
            return values.reduce(function(previous, current) {
              return previous + current;
            });
          };
          values.sort(function(a, b) {
            return a - b;
          });
          var removeFromResult = parseInt(options.removeFromResult) || 0;
          if (removeFromResult > 0) {
            values.splice(values.length - 1, removeFromResult); // remove last
            values.splice(0, removeFromResult); // remove first
          }

          var n = values.length,
            result = {
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
        },
        buildParams = function(test, collection) {
          var params = test.params;
          params.collection = collection.name;
          return params;
        },
        measure = function(test, collection, options) {
          var timedExecution = function(test, collection) {
              var params = buildParams(test, collection),
                start = time();
              if (typeof params.setupEachCall === "function") {
                params.setupEachCall(params);
              }
              test.params.func(params);
              var end = time();
              if (typeof params.teardownEachCall === "function") {
                params.teardownEachCall(params);
              }
              return end - start;
            },
            results = [];
          internal.wait(1, true);

          for (var i = 0; i < options.runs + 1; ++i) {
            var params = buildParams(test, collection);

            if (typeof options.setup === "function") {
              options.setup(params);
            }
            if (typeof params.setup === "function") {
              params.setup(params);
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
            if (typeof options.teardown === "function") {
              options.teardown(test.params);
            }
          }

          return results;
        },
        run = function(tests, options) {
          var out = [];

          for (var i = 0; i < tests.length; ++i) {
            var test = tests[i];
            print("running test " + test.name);

            for (var j = 0; j < options.collections.length; ++j) {
              var collection = options.collections[j],
                stats = calc(measure(test, collection, options), options);

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
            }
          }

          return out;
        };

      return run(tests, options);
    },
    toString = function(out) {
      var pad = function(s, l, type) {
          if (s.length >= l) {
            return s.substr(0, l);
          }
          if (type === "right") {
            return s + Array(l - s.length).join(" ");
          }
          return Array(l - s.length).join(" ") + s;
        },
        headLength = 30,
        collectionLength = 12,
        runsLength = 8,
        cellLength = 12,
        sep = " | ",
        lineLength =
          headLength + runsLength + 6 * cellLength + 6 * sep.length - 1,
        s = [];

      s.push("\n");
      s.push(
        pad("test name", headLength, "right") +
          sep +
          pad("collection", collectionLength, "right") +
          sep +
          pad("runs", runsLength, "left") +
          sep +
          pad("min (s)", cellLength, "left") +
          sep +
          pad("max (s)", cellLength, "left") +
          sep +
          pad("% dev", cellLength, "left") +
          sep +
          pad("avg (s)", cellLength, "left") +
          sep +
          pad("med (s)", cellLength, "left")
      );

      s.push(Array(lineLength).join("-"));

      for (var i = 0; i < out.length; ++i) {
        var test = out[i];
        s.push(
          pad(test.name, headLength, "right") +
            sep +
            pad(test.collectionLabel, collectionLength, "right") +
            sep +
            pad(test.runs, runsLength, "left") +
            sep +
            pad(test.min, cellLength, "left") +
            sep +
            pad(test.max, cellLength, "left") +
            sep +
            pad(test.dev, cellLength, "left") +
            sep +
            pad(test.avg, cellLength, "left") +
            sep +
            pad(test.med, cellLength, "left")
        );
      }

      return s.join("\n");
    },
    toJUnit = function(out) {
      var fs = require("fs");
      for (var i = 0; i < out.length; ++i) {
        var test = out[i];
        fs.writeFileSync(
          `${test.name}.xml`,
          `<?xml version="1.0" encoding="UTF-8"?><testsuite><testcase classname="${
            test.name
          }" name="avg" time="${test.avg * 1000}" /><testcase classname="${
            test.name
          }" name="med" time="${test.med * 1000}" /></testsuite>`
        );
      }
    };

  function createArangoSearch(params) {
    if (db._view(params.name) !== null) {
      return;
    }

    var meta = { links: {} };
    params.collections.forEach(function(c) {
      meta.links[c] = { includeAllFields: true, analyzers: params.analyzers };
    });

    db._dropView(params.name);
    internal.print("creating view " + params.name);
    db._createView(params.name, "arangosearch", meta);
  }

  var initialize = function() {
      function createDocuments(n) {
        var name = "values" + n;
        if (db._collection(name) !== null) {
          return;
        }
        db._drop(name);
        internal.print("creating collection " + name);
        var c = db._create(name),
          g = n / 100;

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

        c.ensureIndex({ type: "hash", fields: ["value1"] });
        c.ensureIndex({ type: "hash", fields: ["value2"] });
        c.ensureIndex({ type: "skiplist", fields: ["value3"] });
        c.ensureIndex({ type: "skiplist", fields: ["value4"] });
      }

      createDocuments(10000);
      createDocuments(100000);
      createDocuments(1000000);

      function createView(n) {
        var params = {
          name: "v_values" + n,
          collections: ["values" + n],
          analyzers: ["identity"]
        };

        createArangoSearch(params);
      }

      createView(10000);
      createView(100000);
      createView(1000000);

      function createEdges(n) {
        var name = "edges" + n;
        if (db._collection(name) !== null) {
          return;
        }
        db._drop(name);
        internal.print("creating collection " + name);
        var c = db._createEdgeCollection(name),
          j = 0,
          k = 50,
          l = 0;
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

      function createPhrasesView(n) {
        var params = {
          name: "v_valuesPhrases" + n,
          collections: ["valuesPhrases" + n],
          analyzers: ["text_en"]
        };

        createArangoSearch(params);
      }

      function createDocumentsWithPhrases(n) {
        var name = "valuesPhrases" + n;
        if (db._collection(name) !== null) {
          return;
        }
        db._drop(name);

        internal.print("creating collection " + name);
        var c = db._create(name),
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

        for (var i = 0; i < n; ++i) {
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

      createDocumentsWithPhrases(10000);
      createPhrasesView(10000);
      createDocumentsWithPhrases(100000);
      createPhrasesView(100000);
      createDocumentsWithPhrases(10000000);
      createPhrasesView(10000000);

      internal.wal.flush(true, true);
    },
    // /////////////////////////////////////////////////////////////////////////////
    // CRUD
    // /////////////////////////////////////////////////////////////////////////////

    // //// Helper
    drop = function(params) {
      var view = params.view;
      if (view !== null) {
        if (db._view(view) !== null) {
          db._dropView(view);
        }
      }
      var name = params.collection;
      if (db._collection(name) !== null) {
        db._drop(name);
      }
    },
    create = function(params) {
      var name = params.collection;
      db._create(name);
      var view = params.view;
      if (view !== null) {
        var viewParams = {
          name: view,
          collections: [name],
          analyzers: [params.analyzers]
        };
        createArangoSearch(viewParams);
      }
    },
    fill = function(params) {
      var c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10),
        docSize = parseInt(params.docSize) || 0,
        doc = {};
      for (var i = 0; i < docSize; ++i) {
        doc["value" + i] = i;
      }

      for (var i = 0; i < n; ++i) {
        doc._key = "test" + i;
        c.insert(doc);
      }
    },
    // //// Test Functions

    insert = function(params) {
      fill(params);
    },
    update = function(params) {
      var c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      for (var i = 0; i < n; ++i) {
        c.update("test" + i, { value: i + 1, value2: "test" + i, value3: i });
      }
    },
    replace = function(params) {
      var c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      for (var i = 0; i < n; ++i) {
        c.replace("test" + i, { value: i + 1, value2: "test" + i, value3: i });
      }
    },
    remove = function(params) {
      var c = db._collection(params.collection),
        n = parseInt(params.collection.replace(/[a-z]+/g, ""), 10);
      for (var i = 0; i < n; ++i) {
        c.remove("test" + i);
      }
    },
    count = function(params) {
      var c = db._collection(params.collection);
      c.count();
    },
    anyCrud = function(params) {
      var c = db._collection(params.collection);
      c.any();
    },
    all = function(params) {
      var c = db._collection(params.collection);
      c.toArray();
    },
    truncate = function(params) {
      var c = db._collection(params.collection);
      c.truncate();
    },
    // /////////////////////////////////////////////////////////////////////////////
    // edgeTests
    // /////////////////////////////////////////////////////////////////////////////

    outbound = function(params) {
      db._query(
        "FOR v, e, p IN @minDepth..@maxDepth OUTBOUND @start @@c RETURN v",
        {
          "@c": params.collection,
          minDepth: params.minDepth,
          maxDepth: params.maxDepth,
          start: params.collection.replace(/edges/, "values") + "/test1"
        },
        {},
        { silent }
      );
    },
    any = function(params) {
      db._query(
        "FOR v, e, p IN @minDepth..@maxDepth ANY @start @@c RETURN v",
        {
          "@c": params.collection,
          minDepth: params.minDepth,
          maxDepth: params.maxDepth,
          start: params.collection.replace(/edges/, "values") + "/test1"
        },
        {},
        { silent }
      );
    },
    outboundPath = function(params) {
      db._query(
        "FOR v, e, p IN @minDepth..@maxDepth OUTBOUND @start @@c RETURN p",
        {
          "@c": params.collection,
          minDepth: params.minDepth,
          maxDepth: params.maxDepth,
          start: params.collection.replace(/edges/, "values") + "/test1"
        },
        {},
        { silent }
      );
    },
    anyPath = function(params) {
      db._query(
        "FOR v, e, p IN @minDepth..@maxDepth ANY @start @@c RETURN p",
        {
          "@c": params.collection,
          minDepth: params.minDepth,
          maxDepth: params.maxDepth,
          start: params.collection.replace(/edges/, "values") + "/test1"
        },
        {},
        { silent }
      );
    },
    shortestOutbound = function(params) {
      db._query(
        "FOR v IN OUTBOUND SHORTEST_PATH @start TO @dest @@c RETURN v",
        {
          "@c": params.collection,
          start: params.collection.replace(/edges/, "values") + "/test1",
          dest: params.collection.replace(/edges/, "values") + "/test9999"
        },
        {},
        { silent }
      );
    },
    shortestAny = function(params) {
      db._query(
        "FOR v IN ANY SHORTEST_PATH @start TO @dest @@c RETURN v",
        {
          "@c": params.collection,
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

    subquery = function(params) {
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
    min = function(params) {
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
    max = function(params) {
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
    concat = function(params) {
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
    merge = function(params) {
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
    keep = function(params) {
      db._query(
        "FOR c IN @@c RETURN KEEP(c, '_key', '_rev', '_id')",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    },
    unset = function(params) {
      db._query(
        "FOR c IN @@c RETURN UNSET(c, '_key', '_rev', '_id')",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    },
    attributes = function(params) {
      db._query(
        "FOR c IN @@c RETURN ATTRIBUTES(c)",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    },
    values = function(params) {
      db._query(
        "FOR c IN @@c RETURN VALUES(c)",
        {
          "@c": params.collection
        },
        {},
        { silent }
      );
    },
    has = function(params) {
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
    md5 = function(params) {
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
    sha1 = function(params) {
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
    skipIndex = function(params) {
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
    skipDocs = function(params) {
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
    sortAll = function(params) {
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
    sortHeap = function(params) {
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
    filter = function(params) {
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
    extract = function(params) {
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
    join = function(params) {
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
    lookup = function(params) {
      var key,
        numeric = params.numeric;
      for (var i = 0; i < params.n; ++i) {
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
    lookupIn = function(params) {
      var keys = [],
        numeric = params.numeric;
      for (var i = 0; i < params.n; ++i) {
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
    collect = function(params) {
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
    passthru = function(params) {
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
    numericSequence = function(n) {
      var result = [];
      for (var i = 0; i < n; ++i) {
        result.push(i);
      }
      return result;
    },
    // /////////////////////////////////////////////////////////////////////////////
    // arangosearchTests
    // /////////////////////////////////////////////////////////////////////////////

    arangosearchLookupByAttribute = function(params) {
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
    arangosearchRangeLookupOperator = function(params) {
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
    arangosearchRangeLookupFunc = function(params) {
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
    arangosearchBasicConjunction = function(params) {
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
    arangosearchBasicDisjunction = function(params) {
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
    arangosearchDisjunction = function(params) {
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
    arangosearchPrefix = function(params) {
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
    arangosearchMinMatch2of3 = function(params) {
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
    arangosearchScoring = function(params) {
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
    arangosearchPhrase = function(params) {
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
    arangosearchCrudCreateViewOnCollection = function(params) {
      var viewParams = {
        name: params.view,
        collections: [params.collection],
        analyzers: [params.analyzer]
      };
      createArangoSearch(viewParams);
      // make query to force waiting full index commit
      db._query(
        "FOR d IN @@v  OPTIONS { waitForSync:true } LIMIT 1 RETURN d",
        {
          "@v": params.view
        },
        {},
        { silent }
      );
    },
    arangosearchCrudUpdateViewOnCollection = function(params) {
      var view = db._view(params.view),
        meta = {
          links: { [params.collection]: { fields: { [params.attr]: {} } } }
        };
      view.properties(meta, false); // full update
      // make query to force waiting full index commit
      db._query(
        "FOR d IN @@v  OPTIONS { waitForSync:true } LIMIT 1 RETURN d",
        {
          "@v": params.view
        },
        {},
        { silent }
      );
    },
    arangosearchCrudDeleteViewOnCollection = function(params) {
      dropView(params);
    },
    main = function() {
      var documentTests = [
          //  { name: "isarray-const",          params: { func: passthru, name: "IS_ARRAY", values: numericSequence(2000) } },
          //  { name: "length-const",           params: { func: passthru, name: "LENGTH", values: numericSequence(2000) } },
          //  { name: "min-const",              params: { func: passthru, name: "MIN", values: numericSequence(2000) } },
          //  { name: "unique-const",           params: { func: passthru, name: "UNIQUE", values: numericSequence(2000) } },

          {
            name: "collect-number",
            params: { func: collect, attr: "value7", count: false }
          },
          {
            name: "collect-string",
            params: { func: collect, attr: "value8", count: false }
          },
          {
            name: "collect-count-number",
            params: { func: collect, attr: "value7", count: true }
          },
          {
            name: "collect-count-string",
            params: { func: collect, attr: "value8", count: true }
          },
          { name: "subquery", params: { func: subquery, attr: "value1" } },
          { name: "concat", params: { func: concat, attr: "value5" } },
          { name: "merge-number", params: { func: merge, attr: "value5" } },
          { name: "merge-string", params: { func: merge, attr: "value6" } },
          { name: "keep", params: { func: keep, attr: "value5" } },
          { name: "unset", params: { func: unset, attr: "value5" } },
          { name: "attributes", params: { func: attributes } },
          { name: "values", params: { func: values } },
          { name: "has", params: { func: has, attr: "value5" } },
          { name: "md5", params: { func: md5, attr: "value2" } },
          { name: "sha1", params: { func: sha1, attr: "value2" } },
          { name: "min-number", params: { func: min, attr: "value5" } },
          { name: "min-string", params: { func: min, attr: "value6" } },
          { name: "max-number", params: { func: max, attr: "value5" } },
          { name: "max-string", params: { func: max, attr: "value6" } },
          {
            name: "sort-heap-number",
            params: { func: sortHeap, attr: "value5" }
          },
          {
            name: "sort-heap-string",
            params: { func: sortHeap, attr: "value6" }
          },
          {
            name: "sort-all-number",
            params: { func: sortAll, attr: "value5" }
          },
          {
            name: "sort-all-string",
            params: { func: sortAll, attr: "value6" }
          },
          {
            name: "filter-number",
            params: { func: filter, attr: "value5", value: 333 }
          },
          {
            name: "filter-string",
            params: { func: filter, attr: "value6", value: "test333" }
          },
          { name: "extract-doc", params: { func: extract } },
          { name: "extract-id", params: { func: extract, attr: "_id" } },
          { name: "extract-key", params: { func: extract, attr: "_key" } },
          { name: "extract-number", params: { func: extract, attr: "value1" } },
          { name: "extract-string", params: { func: extract, attr: "value2" } },
          { name: "join-key", params: { func: join, attr: "_key" } },
          { name: "join-id", params: { func: join, attr: "_id" } },
          { name: "join-hash-number", params: { func: join, attr: "value1" } },
          { name: "join-hash-string", params: { func: join, attr: "value2" } },
          {
            name: "join-skiplist-number",
            params: { func: join, attr: "value3" }
          },
          {
            name: "join-skiplist-string",
            params: { func: join, attr: "value4" }
          },
          {
            name: "lookup-key",
            params: { func: lookup, attr: "_key", n: 10000, numeric: false }
          },
          {
            name: "lookup-hash-number",
            params: { func: lookup, attr: "value1", n: 10000, numeric: true }
          },
          {
            name: "lookup-hash-string",
            params: { func: lookup, attr: "value2", n: 10000, numeric: false }
          },
          {
            name: "lookup-skiplist-number",
            params: { func: lookup, attr: "value3", n: 10000, numeric: true }
          },
          {
            name: "lookup-skiplist-string",
            params: { func: lookup, attr: "value4", n: 10000, numeric: false }
          },
          {
            name: "in-key",
            params: { func: lookupIn, attr: "_key", n: 10000, numeric: false }
          },
          {
            name: "in-hash-number",
            params: { func: lookupIn, attr: "value1", n: 10000, numeric: true }
          },
          {
            name: "in-hash-string",
            params: { func: lookupIn, attr: "value2", n: 10000, numeric: false }
          },
          {
            name: "in-skiplist-number",
            params: { func: lookupIn, attr: "value3", n: 10000, numeric: true }
          },
          {
            name: "in-skiplist-string",
            params: { func: lookupIn, attr: "value4", n: 10000, numeric: false }
          },
          {
            name: "skip-index",
            params: { func: skipIndex, attr: "value1", limit: 10 }
          },
          {
            name: "skip-docs",
            params: { func: skipDocs, attr: "value1", limit: 10 }
          }
        ],
        edgeTests = [
          {
            name: "traversal-outbound-1",
            params: { func: outbound, minDepth: 1, maxDepth: 1 }
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
          { name: "shortest-outbound", params: { func: shortestOutbound } },
          { name: "shortest-any", params: { func: shortestAny } }
        ],
        arangosearchTests = [
          {
            name: "arangosearch-key-lookup",
            params: {
              func: arangosearchLookupByAttribute,
              attr: "_key",
              value: "test4242"
            }
          },
          {
            name: "arangosearch-range-lookup-operator",
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
            name: "arangosearch-range-lookup-function",
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
            name: "arangosearch-basic-conjunction",
            params: {
              func: arangosearchBasicConjunction,
              attr0: "value2",
              value0: "test42",
              attr1: "value1",
              value1: 42
            }
          },
          {
            name: "arangosearch-basic-disjunction",
            params: {
              func: arangosearchBasicDisjunction,
              attr0: "value2",
              value0: "test42",
              attr1: "value1",
              value1: 4242
            }
          },
          {
            name: "arangosearch-disjunction",
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
            name: "arangosearch-prefix-low",
            params: {
              func: arangosearchPrefix,
              attr: "value2",
              value: "test4242"
            }
          },
          {
            name: "arangosearch-prefix-high",
            params: { func: arangosearchPrefix, attr: "value2", value: "test4" }
          }
        ],
        arangosearchPhrasesTests = [
          {
            name: "arangosearch-minmatch-low",
            params: {
              func: arangosearchMinMatch2of3,
              attr1: "value2",
              value1: "low",
              value2: "nomatch",
              value3: "phrase"
            }
          },
          {
            name: "arangosearch-minmatch-high",
            params: {
              func: arangosearchMinMatch2of3,
              attr1: "value2",
              value1: "brown",
              value2: "tree",
              value3: "nomatch"
            }
          },
          {
            name: "arangosearch-score-tfidf-low",
            params: {
              func: arangosearchScoring,
              attr: "value2",
              value: "wheel",
              scorer: "TFIDF"
            }
          },
          {
            name: "arangosearch-score-bm25-low",
            params: {
              func: arangosearchScoring,
              attr: "value2",
              value: "wheel",
              scorer: "BM25"
            }
          },
          {
            name: "arangosearch-score-tfidf-high",
            params: {
              func: arangosearchScoring,
              attr: "value2",
              value: "brown",
              scorer: "TFIDF"
            }
          },
          {
            name: "arangosearch-score-bm25-high",
            params: {
              func: arangosearchScoring,
              attr: "value2",
              value: "brown",
              scorer: "BM25"
            }
          },
          {
            name: "arangosearch-phrase-low",
            params: {
              func: arangosearchPhrase,
              attr: "value2",
              value: "Low Phrase"
            }
          },
          {
            name: "arangosearch-phrase-high",
            params: {
              func: arangosearchPhrase,
              attr: "value2",
              value: "Brown Planet"
            }
          }
        ],
        crudTests = [
          // { name: "testhooks",              params: {
          //                                          func: function(){},
          //                                          setup : function(){ internal.print("setup")},
          //                                          teardown : function(){ internal.print("teardown")},
          //                                          setupEachCall : function(){ internal.print("setup each")},
          //                                          teardownEachCall : function(){ internal.print("teardown each")},
          //                                          }
          // },
          {
            name: "insert",
            params: {
              func: insert,
              setupEachCall: function(params) {
                drop(params);
                create(params);
              },
              teardown: drop
            }
          },
          {
            name: "insert docSize4",
            params: {
              func: insert,
              setupEachCall: function(params) {
                drop(params);
                create(params);
              },
              teardown: drop,
              docSize: 4
            }
          },
          {
            name: "update",
            params: {
              func: update,
              setupEachCall: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "replace",
            params: {
              func: replace,
              setupEachCall: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "remove",
            params: {
              func: remove,
              setupEachCall: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "count",
            params: {
              func: count,
              setup: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "all",
            params: {
              func: all,
              setup: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "truncate",
            params: {
              func: truncate,
              setup: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          },
          {
            name: "any",
            params: {
              func: anyCrud,
              setup: function(params) {
                drop(params);
                create(params);
                fill(params);
              },
              teardown: drop
            }
          }
        ];

      initialize(); // initializes values colletion
      var output = "",
        options;

      // document tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {
          db._collection(params.collection).load();
        },
        teardown: function() {},
        collections: [
          //    { name: "values10000",    label: "10k" },
          //    { name: "values100000",   label: "100k" },
          { name: "values1000000", label: "1000k" }
        ],
        removeFromResult: 1
      };
      var documentTestsResult = testRunner(documentTests, options);
      output += toString(documentTestsResult);

      // edge tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {
          db._collection(params.collection).load();
        },
        teardown: function() {},
        collections: [
          //    { name: "edges10000",    label: "10k" },
          //    { name: "edges100000",   label: "100k" },
          { name: "edges1000000", label: "1000k" }
        ],
        removeFromResult: 1
      };
      var edgeTestsResult = testRunner(edgeTests, options);
      output += toString(edgeTestsResult);

      // arangosearch tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {
          params["view"] = "v_" + params.collection;
        },
        teardown: function() {},
        collections: [
          //    { name: "values10000",    label: "10k" },
          //    { name: "values100000",   label: "100k" },
          { name: "values1000000", label: "1000k" }
        ],
        removeFromResult: 1
      };
      var arangosearchTestsResult = testRunner(arangosearchTests, options);
      output += toString(arangosearchTestsResult);

      // arangosearch phrase tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {
          params["view"] = "v_" + params.collection;
        },
        teardown: function() {},
        collections: [
          //  { name: "valuesPhrases10000",    label: "10k" },
          //  { name: "valuesPhrases100000",   label: "100k" },
          { name: "valuesPhrases10000000", label: "10000k" }
        ],
        removeFromResult: 1
      };
      var arangosearchPhrasesTestsResult = testRunner(
        arangosearchPhrasesTests,
        options
      );
      output += toString(arangosearchPhrasesTestsResult);

      // crud tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {},
        teardown: function() {},
        collections: [
          //   { name: "crud10000",    label: "10k" },
          //   { name: "crud100000",   label: "100k" },
          { name: "crud1000000", label: "1000k" }
        ],
        removeFromResult: 1
      };
      var crudTestsResult = testRunner(crudTests, options);
      output += toString(crudTestsResult);

      // arangosearch crud tests
      options = {
        runs: 5,
        digits: 4,
        setup: function(params) {
          params["view"] = "v_" + params.collection;
        },
        teardown: function() {},
        collections: [
          //   { name: "crud10000",    label: "10k + ARS " },
          //   { name: "crud100000",   label: "100k + ARS" },
          { name: "crud1000000", label: "1000k + ARS" }
        ],
        removeFromResult: 1
      };
      var arangosearchCrudTestsResult = testRunner(crudTests, options);
      output += toString(arangosearchCrudTestsResult);

      print("\n" + output + "\n");

      toJUnit(documentTestsResult);
      toJUnit(edgeTestsResult);
      toJUnit(arangosearchTestsResult);
      toJUnit(arangosearchPhrasesTestsResult);
      toJUnit(crudTestsResult);
      toJUnit(arangosearchCrudTestsResult);
    };

  main();
})();
