function main () {
  require("./simple/test").test({
    medium: true,
    oneshardTests: true,
    numberOfShards: 5
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
