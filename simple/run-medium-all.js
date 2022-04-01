function main () {
  require("./simple/test").test({
    outputCsv: true,
    medium: true,

    documents: true,
    ioless: false,
    edges: false,
    search: true,
    phrase: true,
    noMaterializationSearch: true,
    crud: false,
    crudSearch: false,
    subqueryTests: false
  });
}
if (typeof arango !== "undefined") {
  main();
}
