function main () {
  require("./test").test({small: true, oneshardTests: true});
}
if (typeof arango !== undefined) {
  main();
}
