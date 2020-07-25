function main () {
  require("./test").test({
    small: true,

    crud: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
