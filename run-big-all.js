function main () {
  require('./test').test({
    outputCsv: true,
    big: true,

    documents: true,
    edges: true,
    search: true,
    phrase: true,
    crud: true,
    crudSearch: true
  });
}
