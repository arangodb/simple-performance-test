function main () {
  require("./test").test({
    outputXml: true,
    xmlDirectory: "xml",

    small: true,

    documents: true,
    edges: true,
    search: true,
    phrase: true,
    crud: true,
    crudSearch: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
