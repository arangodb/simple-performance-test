function main () {
  require("./simple/test").test({small: true, disjointSmartGraphTests: true});
}
if (typeof arango !== "undefined") {
  main();
}
