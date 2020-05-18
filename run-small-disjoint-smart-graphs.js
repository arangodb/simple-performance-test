function main () {
  require("./test").test({small: true, disjointSmartGraphTests: true});
}
if (typeof arango !== undefined) {
  main();
}
