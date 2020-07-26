function main () {
  require("./simple/test").test({
    medium: true,
    oneshardTests: true,
    numberOfShards: 5
  });
}
if (typeof arango !== "undefined") {
  main();
}
