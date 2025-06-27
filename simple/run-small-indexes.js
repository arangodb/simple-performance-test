function main () {
  require("./simple/test").test({
    outputCsv: true,
    small: true,
    indexes: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
