function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    small: true,
     oneshardTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
