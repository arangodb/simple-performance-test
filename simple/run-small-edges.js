function main () {
  GLOBAL.returnValue = 0;
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
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
