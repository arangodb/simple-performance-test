function main () {
  require("./simple/test").test({
    small: true,
    satelliteGraphTests: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
