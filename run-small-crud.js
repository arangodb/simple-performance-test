function main () {
  require("./test").test({small: true, crud: true});
}
if (!require("internal").isArangod()) {
  main();
}
