function main () {
  require("./test").test({medium: true, subqueryTests: true});
}
if (typeof arango !== "undefined") {
  main();
}
