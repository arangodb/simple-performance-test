function main () {
  return require("./simple/test").test({
    medium: true,
    oneshardTests: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
