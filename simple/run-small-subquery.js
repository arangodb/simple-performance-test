function main () {
  require("./simple/test").test({
    small: true,
    subqueryTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
