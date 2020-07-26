function main () {
  require("./simple/test").test({
    small: true,

   documents: true
  });
}
if (typeof arango !== "undefined") {
  main();
}
