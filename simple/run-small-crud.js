function main () {
  return require("./simple/test").test({
    small: true,

    crud: true
  });
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
