function main () {
  require("./simple/test").test({
    big: true,
    aqlJoinTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
