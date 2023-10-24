function main () {
  require("./simple/test").test({
    small: true,
    satelliteGraphTests: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
