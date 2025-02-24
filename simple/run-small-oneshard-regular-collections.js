function main () {
  GLOBAL.returnValue = 0;
  require("./simple/test").test({
    small: true,

    oneshardTests: true,
     numberOfShards: 5
  });
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
