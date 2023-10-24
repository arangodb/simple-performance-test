function main () {
  return require("./simple/test").test({
    small: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
