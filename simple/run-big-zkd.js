function main () {
  require("./simple/test").test({
    outputCsv: true,
    big: true,
    testZKD: true,
  });
}
if (typeof arango !== "undefined") {
  main();
}
