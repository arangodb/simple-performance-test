function main () {
  require("./simple/test").test({
    outputCsv: true,
    small: true,

    documents: false,
    edges: true,
    search: false,
    phrase: false,
    crud: false,
    crudSearch: false
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
