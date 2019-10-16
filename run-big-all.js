function main () {
  require("./test").test({
    outputCsv: true,
    small: false,
    big: true,

    documents: true,
    edges: true,
    search: true,
    phrase: true,
    crud: true,
    crudSearch: true
  });
}
if (!require("internal").isArangod()) {
  main();
}
