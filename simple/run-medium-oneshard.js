function main () {
  require("./simple/test").test({
    medium: true,
    oneshardTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
