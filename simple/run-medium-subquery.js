function main () {
  GLOBAL.returnValue = 0;
  require("./simple/test").test({
    medium: true,
    subqueryTests: true
  });
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
