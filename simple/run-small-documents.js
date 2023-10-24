function main () {
  require("./simple/test").test({
    small: true,

   documents: true
  });
  return global.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
