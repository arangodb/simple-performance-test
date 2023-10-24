function main () {
  return require("./simple/test").test({
    small: true,

    oneshardTests: true,
     numberOfShards: 5
  });
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
