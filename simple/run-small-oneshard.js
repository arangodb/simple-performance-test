function main () {
  return require("./simple/test").test({
    small: true,
     oneshardTests: true
  });
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
