function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputCsv: true,
    tiny: true,
    small: false,

    documents: true,
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
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
