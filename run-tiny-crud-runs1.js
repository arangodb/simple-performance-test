function main () {
  require("./test").test({
    outputCsv: true,
    tiny: true,
    runs: 1,
    crud: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
