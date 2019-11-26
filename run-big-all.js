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
    crudSearch: true,
    subqueryTests: true
  });
}
if (typeof arango !== undefined) {
  main();
}
