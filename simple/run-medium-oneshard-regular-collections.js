function main () {
  require("./test").test({
    medium: true,
    oneshardTests: true,
    numberOfShards: 5
  });
}
if (typeof arango !== "undefined") {
  main();
}
