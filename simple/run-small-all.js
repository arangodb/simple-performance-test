function main () {
  require("./simple/test").test({
    outputCsv: true,
    small: true,

    documents: true,
    ioless: true,
    edges: true,
    search: true,
    phrase: true,
    noMaterializationSearch: true,
    crud: true,
    crudSearch: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
