function main () {
  require("./simple/test").test({
    small: true,
    aqlJoinTests: true,
    printQueryCount: false
  });
}
if (typeof arango !== "undefined") {
  main();
}
