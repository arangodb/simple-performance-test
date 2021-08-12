function main () {
  require("./simple/test").test({
    small: true,

    crud: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
