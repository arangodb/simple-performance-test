function main () {
  return require("./simple/test").test({
    small: true,
    satelliteGraphTests: true
  });
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
