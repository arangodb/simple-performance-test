#!/bin/sh

port=5193

build/bin/arangod --server.authentication false --database.directory perftest --server.endpoint tcp://127.0.0.1:${port} &

PID=$!
RETURN=1

while [ "$RETURN" != "0" ]; do
  curl -f -s 127.0.0.1:${port}/_api/version
  RETURN=$?
done

set -e

curl -X POST http://127.0.0.1:${port}/_admin/execute -d "require('internal').load('./test.js');" --dump - 

kill $PID
wait

echo '<?xml version="1.0" encoding="UTF-8"?>' > performance.xml

cat ulf | grep -P "^[a-z][a-z0-9-]+.*?\|\s[0-9]" | cut -d "|" -f 1,8 | tr -d " " | awk -F'|' '{ print "<testsuite errors=\"0\" failures=\"0\" tests=\"1\" name=\""$1"\" time=\""$2 * 1000"\"><testcase name=\""$1"\" time=\""$2 * 1000"\" /></testsuite>" }' | sed -e "s/\.[0-9]*//g" >> performance.xml
