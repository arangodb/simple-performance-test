function main () {
  GLOBAL.returnValue = 0;
  require("./simple/test").test({
    small: true,

   documents: true
  });
  return GLOBAL.returnValue;
}
if (typeof arango !== "undefined") {
  process.exit(main());
}
