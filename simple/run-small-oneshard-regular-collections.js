function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    small: true,

    oneshardTests: true,
     numberOfShards: 5
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
