function main () {
  require("./test").test({small: true, documents: true});
}
if (typeof arango !== "undefined") {
  main();
}
