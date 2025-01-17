function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputCsv: true,
    small: true,

    documents: true,
    indexes: true,
    ioless: true,
    edges: true,
    search: true,
    phrase: true,
    noMaterializationSearch: true,
    crud: true,
    crudSearch: true,
    mditests: true,
    vectortests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
