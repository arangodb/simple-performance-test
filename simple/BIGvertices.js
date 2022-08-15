// This script can create a binary tree in ArangoDB with relatively large
// vertex documents (approx. 1 MB each). You can give the depth and you can
// choose what type of graph to create.
//
// Usage:
//
// makeGraph("G", "V", "E")      - creates a general graph with name G, vertex
//                                 collection V and edge collection E
// makeTree(6, "V", "E") - creates the actual tree after the graph was created
//                         6 is the depth and one has to name the vertex and
//                         edge collections
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
//    RETURN v.data
//
// Execution plan:
//  Id   NodeType          Site  Est.   Comment
//   1   SingletonNode     COOR     1   * ROOT
//   2   TraversalNode     COOR    64     - FOR v  /* vertex (projections: `data`) */ IN 0..6  /* min..maxPathDepth */ OUTBOUND 'V/S1:K1' /* startnode */  GRAPH 'G'
//   3   CalculationNode   COOR    64       - LET #3 = v.`data`   /* attribute expression */
//   4   ReturnNode        COOR    64       - RETURN #3
//
// In the line with Id 2 you can see that the TraversalNode uses a projection to the field `data`.
//

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

function makeGraph(graphName, vertexCollName, edgeCollName) {
  let graph = require("@arangodb/general-graph");
  try {
    graph._drop(graphName, true);
  }
  catch {
  }
  graph._create(graphName, [graph._relation(edgeCollName, [vertexCollName], [vertexCollName])]);
}

function makeKey(i) {
  return "S" + (i % 3) + ":K" + i;
}

function makeTree(depth, vertexCollName, edgeCollName) {
  let V = db._collection(vertexCollName);
  let E = db._collection(edgeCollName);
  let klumpen = {};
  for (let i = 0; i < 1000; ++i) {
    klumpen["K"+i] = makeRandomString(1024);
  }
  for (let i = 1; i <= 2 ** depth - 1; ++i) {
    let v = klumpen;
    v.data = "D"+i;
    v.smart = "S"+(i % 3);
    v._key = makeKey(i);
    V.insert(v);
    print("Have created", i, "vertices out of", 2 ** depth - 1);
  }

  // This is now a gigabyte of data, one megabyte per vertex.

  // Make a binary tree:
  for (let i = 1; i <= 2 ** (depth - 1) - 1; ++i) {
    let e = { _from: vertexCollName + "/" + makeKey(i), 
              _to: vertexCollName + "/" + makeKey(2 * i)};
    E.insert(e);
    e = { _from: vertexCollName + "/" + makeKey(i), 
          _to: vertexCollName + "/" + makeKey(2 * i + 1)};
    E.insert(e);
  }

}
