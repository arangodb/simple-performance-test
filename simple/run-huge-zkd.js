function main () {
  require("./simple/test").test({
    outputCsv: true,
    huge: true,
    testZKD: true,
  });
}
if (typeof arango !== "undefined") {
  main();
}
