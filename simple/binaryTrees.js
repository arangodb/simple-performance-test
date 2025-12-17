rand = require("internal").rand;
time = require("internal").time;

function makeRandomString(l) {
  var r = rand();
  var d = rand();
  var s = "x";
  for (var i = 0; i < l; ++i) {
    s += r;
    r += d;
  }
  return s;
}

function numberOfDbservers() {
  return Object.values(db._connection.GET("/_admin/cluster/health").Health).filter(item => item.Role == "DBServer").length;
}

function createGraph(graphName, vertexCollName, edgeCollName) {
  let graph = require("@arangodb/general-graph");
  try {
    graph._drop(graphName, true);
  }
  catch {
  }
  graph._create(graphName, [graph._relation(edgeCollName, [vertexCollName], [vertexCollName])], [], {numberOfShards: numberOfDbservers()});
}

function makeKey(i) {
  return "S" + (i % 3) + ":K" + i;
}

// creates a binary tree where every vertex includes one megabyte of data
//
// The following AQL query and its performance could be of interest:
//
// FOR v IN 0..6 OUTBOUND "V/S1:K1" GRAPH "G"
//   RETURN v.data
//
// This traverses the whole graph starting from the root but retrieves only
// a tiny part of the vertex data. This tests the 3.10 feature of
// traversal projections. You can see that it does this from this explain
// output for the above query:
//
// Query String (58 chars, cacheable: true):
//  FOR v IN 0..6 OUTBOUND "V/S1:K1" GRAPH "G"
//    RETURN v.smallData
//
// Execution plan:
//  Id   NodeType          Site  Est.   Comment
//   1   SingletonNode     COOR     1   * ROOT
//   2   TraversalNode     COOR    64     - FOR v  /* vertex (projections: `data`) */ IN 0..6  /* min..maxPathDepth */ OUTBOUND 'V/S1:K1' /* startnode */  GRAPH 'G'
//   3   CalculationNode   COOR    64       - LET #3 = v.`smallData`   /* attribute expression */
//   4   ReturnNode        COOR    64       - RETURN #3
//
// In the line with Id 2 you can see that the TraversalNode uses a projection to the field `smallData`.
function makeTreeWithLargeData(graphName, vertexCollName, edgeCollName, depth) {
  createGraph(graphName, vertexCollName, edgeCollName);
  let V = db._collection(vertexCollName);
  let E = db._collection(edgeCollName);

  // create vertices
  let klumpen = {};
  for (let i = 0; i < 1000; ++i) {
    klumpen["K"+i] = makeRandomString(1024);
  }
  for (let i = 1; i <= 2 ** depth - 1; ++i) {
    let v = klumpen;
    v.smallData = "D"+i;
    v.smart = "S"+(i % 3);
    v._key = makeKey(i);
    V.insert(v);
    print("Have created", i, "vertices out of", 2 ** depth - 1);
  }

  // make a binary tree from these vertices
  for (let i = 1; i <= 2 ** (depth - 1) - 1; ++i) {
    let e = { _from: vertexCollName + "/" + makeKey(i), 
              _to: vertexCollName + "/" + makeKey(2 * i)};
    E.insert(e);
    e = { _from: vertexCollName + "/" + makeKey(i), 
          _to: vertexCollName + "/" + makeKey(2 * i + 1)};
    E.insert(e);
  }
}

// creates a binary tree with vertex 2 beeing a supernode
//        1
//     /     \
//    3       2  with additional superNodeSize neighbours
//   / \     / \
//  7   6   5   4
//       ...
function makeTreeWithSupernode(graphName, vertexCollName, edgeCollName, depth, superNodeSize) {
  createGraph(graphName, vertexCollName, edgeCollName);
  let V = db._collection(vertexCollName);
  let E = db._collection(edgeCollName);

  // Add 2^depth - 1 vertices for tree and additionally superNodeSize vertices
  let docs = []
  for (let i = 1; i <= 2**depth-1+superNodeSize; ++i) {
      docs.push({data: "D"+i, smart: "S"+(i%3), _key: makeKey(i)});
  }
  V.insert(docs);

  // make a binary tree from the first 2^depth - 1 vertices
  docs = [];
  for (let i = 1; i <= 2 ** (depth - 1) - 1; ++i) {
      docs.push({ _from: vertexCollName + "/" + makeKey(i), 
		  _to: vertexCollName + "/" + makeKey(2 * i)});
      docs.push({ _from: vertexCollName + "/" + makeKey(i), 
		  _to: vertexCollName + "/" + makeKey(2 * i + 1)});

  }
  E.insert(docs);

  // make vertex 2 a supernode
  if (depth > 1) {
    docs = [];
    let key = makeKey(2);
    for (let j=1; j <= superNodeSize; j++) {
      docs.push({_from: vertexCollName + "/" + key, _to: vertexCollName + "/" + (2**depth - 1+j)});
    }
    E.insert(docs);
  }
}
