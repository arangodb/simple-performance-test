function main () {
  return require("./simple/test").test({
    medium: true,
    subqueryTests: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
