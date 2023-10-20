function main () {
  require("./simple/test").test({
    medium: true,
    aqlJoinTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
