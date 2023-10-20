function main () {
  require("./simple/test").test({
    medium: true,
    aqlJoinTests: true,
    printQueryCount: false
  });
}
if (typeof arango !== "undefined") {
  main();
}
