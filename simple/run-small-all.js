function main () {
  require("./simple/test").test({
    outputCsv: true,
    small: true,

    documents: true,
    ioless: true,
    edges: true,
    search: false,
    phrase: true,
    noMaterializationSearch: false,
    crud: true,
    crudSearch: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
