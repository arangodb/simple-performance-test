function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    medium: true,
    subqueryTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
