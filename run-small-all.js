function main () {
  require('./test').test({
    outputCsv: true,
    small: true,

    documents: true,
    edges: true,
    search: true,
    phrase: true,
    crud: true,
    crudSearch: true
  });
}
