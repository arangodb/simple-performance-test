function main () {
  global.returnValue = 0;
  require("./simple/test").test({
    outputCsv: true,
    tiny: true,
    runs: 1,
    crud: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
