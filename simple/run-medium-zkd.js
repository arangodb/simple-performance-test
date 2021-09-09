function main () {
  require("./simple/test").test({
    outputCsv: true,
    medium: true,
    testZKD: true,
  });
}
if (typeof arango !== "undefined") {
  main();
}
