function main () {
  GLOBAL.returnValue = 0;
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
    vectorTests: true
  });
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
