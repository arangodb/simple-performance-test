function main () {
  return require("./simple/test").test({
    outputCsv: true,
    tiny: true,
    crud: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
