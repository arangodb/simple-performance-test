function main () {
  return require("./simple/test").test({
    outputCsv: true,
    tiny: true,
    runs: 1,
    crud: true
  });
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
