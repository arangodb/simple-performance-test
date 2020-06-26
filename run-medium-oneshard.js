function main () {
  require("./test").test({medium: true, oneshardTests: true});
}
if (typeof arango !== "undefined") {
  main();
}
