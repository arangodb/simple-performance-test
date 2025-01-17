function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputXml: true,
    xmlDirectory: "xml",

    small: true,

    documents: true,
    ioless: true,
    edges: true,
    search: true,
    phrase: true,
    crud: true,
    crudSearch: true,
    mditests: true,
    vectortests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
