function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputCsv: true,
    medium: true,

    documents: false,
    ioless: false,
    edges: false,
    search: false,
    phrase: false,
    noMaterializationSearch: false,
    crud: false,
    crudSearch: false,
    subqueryTests: false,
    mditests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
