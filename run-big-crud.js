function main () {
  require("./test").test({
    outputCsv: true,
    big: true,
    crud: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
