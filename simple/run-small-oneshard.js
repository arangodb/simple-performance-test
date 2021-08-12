function main () {
  require("./simple/test").test({
    small: true,
     oneshardTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
