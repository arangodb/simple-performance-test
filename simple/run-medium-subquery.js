function main () {
  require("./simple/test").test({
    medium: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
