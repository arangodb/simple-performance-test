function main () {
  GLOBAL.returnValue = 0;
  require("./simple/test").test({
    outputCsv: true,
    medium: true,

    documents: true,
    indexes: true,
    ioless: true,
    edges: true,
    search: true,
    phrase: true,
    noMaterializationSearch: true,
    crud: true,
    crudSearch: true,
    subqueryTests: true,
    mditests: true
  });
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
