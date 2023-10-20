function main () {
  require("./simple/test").test({
    big: true,
    aqlJoinTests: true,
    printQueryCount: false
  });
}
if (typeof arango !== "undefined") {
  main();
}
