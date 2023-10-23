function main () {
  return require("./simple/test").test({
    small: true,

   documents: true
  });
}
if (typeof arango !== "undefined") {
  return main();
}
