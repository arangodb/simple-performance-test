function main () {
  require("./test").test({small: true, satelliteGraphTests: true});
}
if (typeof arango !== undefined) {
  main();
}
