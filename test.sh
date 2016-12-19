#!/bin/sh

build/bin/arangod --server.authentication false --database.directory perftest --server.endpoint tcp://127.0.0.1:1234 &

PID=$!
RETURN=1

while [ "$RETURN" != "0" ]; do
  curl -f -s 127.0.0.1:1234/_api/version
  RETURN=$?
done

set -e

SEQWRITEREADSTART=$(date +%s%N | cut -b1-13)
time build/bin/arangosh --server.endpoint tcp://127.0.0.1:1234 --javascript.execute-string "col = db._create('testung');for (i=0;i<100000;i++) col.insert({_key: 'key' + i, 'test': 'testung'});for (i=0;i<100000;i++) col.document('key' + i);"
SEQWRITEREADEND=$(date +%s%N | cut -b1-13)
kill $PID
wait

echo '<?xml version="1.0" encoding="UTF-8"?>' > performance.xml
echo "<testsuite errors=\"0\" failures=\"0\" tests=\"1\" name=\"performance\" time=\"$(($SEQWRITEREADEND-$SEQWRITEREADSTART))\">" >> performance.xml
echo "<testcase name=\"SEQREADANDWRITE\" time=\"$(($SEQWRITEREADEND-$SEQWRITEREADSTART))\"/>" >> performance.xml
echo "</testsuite>" >> performance.xml
