function main () {
  require("./test").test({small: true, subqueryTests: true});
}
if (typeof arango !== undefined) {
  main();
}
