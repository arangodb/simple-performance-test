/* jshint globalstrict:false, unused:false */
/* global print, ARGUMENTS */
const _ = require('lodash');
const internal = require('internal');
const db = require('internal').db;
const time = internal.time;

function main (argv) {
  let options = {};
  let optionsDefaults = {
    maxRunTime: 240, // 240s
    collectionsPerDatabase: 30,
    indexesPerCollection: 2,
    numberOfShards: 1,
    replicationFactor: 3,
    maxCount: -1
  };
  
  let dbTime = 0;
  let cTime = 0;
  let iTime = 0;
  let dbLast;
  let cLast;
  let iLast;
  if (argv.length >= 1) {
    try {
      options = internal.parseArgv(argv, 0);
    } catch (x) {
      print('failed to parse the options: ' + x.message + '\n' + String(x.stack));
      print('argv: ', argv);
      throw x;
    }
  }

  if (options.hasOwnProperty('testOutput')) {
    options.testOutputDirectory = options.testOutput + '/';
  }
  _.defaults(options, optionsDefaults);

  let pad = function(value, length) {
    if (value.length < length) {
      value = Array(length - value.length).join(" ") + value;
    }
    return value;
  };

  let format = function(value) {
    return pad(value.toFixed(2), 8);
  };

  let start = time();
  let end = start;
  if (options.maxRunTime > 0) {
    end += options.maxRunTime;
  }
  let now = start;
  let last = now;
  let i = 0;
  let results = [];
  while (true) {
    if (end > start) {
      if (now >= end) {
        break;
      }
    } else {
      if (i > options.maxCount) {
        break;
      }
    }
    if (i > 0) {  
      print("created " + pad(String(i), 3) + " databases  --  last: " + format(last) + "s  --  db: last: " + format(dbLast) + "s, avg: " + format(dbTime / i) + "s  --  collections: last: " + format(cLast) + "s, avg: " + format(cTime / i) + "s  --  indexes: last: " + format(iLast) + "s, avg: " + format(iTime / i) + "s");
      results.push({
        "run": i,
        "lastRun": last,
        "databases": {
          "dblast": dbLast,
          "avg": (dbTime / i),
        },
        "collections": {
          "last": cLast,
          "avg": (cTime / i)
        },
        "indexes": {
          "last": iLast,
          "avg": (iTime / i)
        }
      });
    }

    db._useDatabase("_system");

    last = time();
    let dbName = "database_" + i;
    let dbStart = time();
    db._createDatabase(dbName, { sharding: "single" });
    dbLast = time() - dbStart;
    dbTime += dbLast;

    db._useDatabase(dbName);

    cLast = 0;
    iLast = 0;
    for (let j = 0; j < options.collectionsPerDatabase; ++j) {
      let cName = "collection_" + j;
      let cStart = time();
      let c = db._create(cName, { numberOfShards: options.numberOfShards, replicationFactor: options.replicationFactor });
      let diff = time() - cStart;
      cLast += diff;
      cTime += diff;
      for (let k = 0; k < options.indexesPerCollection; ++k) {
        let iStart = time();
        c.ensureIndex({ fields: ["value_" + k], type: k % 1 === 0 ? "hash" : "persistent", unique: k % 1 !== 0 });
        let diff = time() - iStart;
        iLast += diff;
        iTime += diff;
      }
    }

    i+=1;
    now = time();
    last = now - last;
  }
  let CSV = "run,lastRun,dblast,dbAvg,colLast,colAvg,idxLast,idxAvg\n";
  
  results.forEach(set => {
    CSV += set.run + "," +
      set.lastRun + "," +
      set.databases.dblast + "," +
      set.databases.avg + "," +
      set.collections.last + "," +
      set.collections.avg + "," +
      set.indexes.last + "," +
      set.indexes.avg + "\n";
  });
  require("fs").write("results.csv", CSV);

}
if (typeof arango !== "undefined") {
  main(ARGUMENTS);
}
