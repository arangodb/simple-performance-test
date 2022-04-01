function main () {
  require("./simple/test").test({
    outputCsv: true,
    big: true,

    documents: false,
    ioless: false,
    edges: false,
    search: false,
    phrase: true,
    noMaterializationSearch: false,
    crud: false,
    crudSearch: false,
    subqueryTests: false
  });
}
if (typeof arango !== "undefined") {
  main();
}
