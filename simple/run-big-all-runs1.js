function main () {
  require("./simple/test").test({
    outputCsv: true,
    big: true,
    runs: 1,

    documents: true,
    ioless: true,
    edges: true,
    search: false,
    phrase: true,
    noMaterializationSearch: false,
    crud: true,
    crudSearch: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
