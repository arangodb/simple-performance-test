function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputCsv: false,
    small: true,
    runs: 3,
    documents: false,
    ioless: false,
    edges: false,
    search: false,
    phrase: false,
    noMaterializationSearch: false,
    crud: false,
    crudSearch: false,
    subqueryTests: false,
    mditests: false,
    vectorTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
