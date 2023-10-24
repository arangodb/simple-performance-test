function main () {
  return require("./simple/test").test({
    outputCsv: true,
    big: true,
    crud: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
