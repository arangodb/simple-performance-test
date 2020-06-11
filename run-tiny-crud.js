function main () {
  require("./test").test({
    outputCsv: true,
    tiny: true,
    crud: true
  });
}
if (typeof arango !== undefined) {
  main();
}
