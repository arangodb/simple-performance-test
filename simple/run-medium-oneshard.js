function main () {
  require("./simple/test").test({
    medium: true,
    oneshardTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
