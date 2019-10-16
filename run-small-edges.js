function main () {
  require("./test").test({
    outputCsv: true,
    small: true,

    documents: false,
    edges: true,
    search: false,
    phrase: false,
    crud: false,
    crudSearch: false
  });
}
if (!require("internal").isArangod()) {
  main();
}
