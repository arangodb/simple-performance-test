function main () {
  require("./simple/test").test({
    outputCsv: true,
    big: true,
    indexes: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
