function main () {
  return require("./simple/test").test({
    outputCsv: true,
    big: true,
    runs: 1,

    documents: true,
    ioless: true,
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
  process.exit(main());
}
