function main () {
  require("./simple/test").test({
    outputCsv: true,
    big: true,

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