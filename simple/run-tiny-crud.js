function main () {
  require("./simple/test").test({
    outputCsv: true,
    tiny: true,
    crud: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
