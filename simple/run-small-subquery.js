function main () {
  require("./simple/test").test({
    small: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
