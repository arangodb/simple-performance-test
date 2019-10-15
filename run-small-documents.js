function main() {
  require('./test').test({small: true, documents: true});
}
if (!require('internal').isArangod()) {
  main();
}