function main () {
  global.returnValue = 0;
  require("./simple-performance-test/simple/test").test({
    outputCsv: false,
    medium: true,
    runs: 1,
    documents: false,
    ioless: false,
    edges: false,
    search: false,
    phrase: false,
    noMaterializationSearch: false,
    crud: false,
    crudSearch: false,
    subqueryTests: false,
    mditests: true,
    vectortests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
