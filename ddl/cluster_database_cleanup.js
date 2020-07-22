/* jshint globalstrict:false, unused:false */
/* global print, ARGUMENTS */
const _ = require('lodash');
const internal = require('internal');
const db = require('internal').db;

function main (argv) {
  let i = 0;
  while (true) {
    db._useDatabase("_system");

    let dbName = "database_" + i;
    try {
      db._dropDatabase(dbName);
      print(dbName);
    } catch (x) {
      print("done");
      return;
    }
    i += 1;
  }
}
if (typeof arango !== "undefined") {
  main(ARGUMENTS);
}
