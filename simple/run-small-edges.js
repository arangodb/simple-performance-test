function main () {
  return require("./simple/test").test({
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
if (typeof arango !== "undefined") {
  process.exit(main());
}
