function main () {
  require("./test").test({
    outputCsv: true,
    medium: true,
    runs: 1,

    documents: true,
    edges: true,
    search: true,
    phrase: true,
    noMaterializationSearch: true,
    crud: true,
    crudSearch: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
