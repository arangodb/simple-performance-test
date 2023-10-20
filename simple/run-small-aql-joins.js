function main () {
  require("./simple/test").test({
    small: true,
    aqlJoinTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
