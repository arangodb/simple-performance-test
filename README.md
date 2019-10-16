# How to start

## Directly running in a Single Server

    arangod \
        -c none \
        --javascript.app-path /tmp/app \
        --javascript.startup-directory /usr/share/arangodb3/js \
        --server.rest-server false \
        --javascript.module-directory `pwd` \
        DATABASE_DIR \
        --javascript.script CONFIGURATION.js

## Start from arangosh

If you want to run against a running instance, use

    arangosh \
         -c none \
         --javascript.startup-directory /usr/share/arangodb3/js \
         --javascript.module-directory `pwd` \
         --javascript.execute CONFIGURATION.js \
         --server.endpoint tcp://127.0.0.1:8529 \
         --server.username <user>
         --server.password <secret>

Note: You need to have an ArangoDB running on this endpoint (or change it)
Also Note: the test will create now collections with the _system database on this endpoint.
Also Note: if you do not use authentication you either want to set the --server.password to some
random value or use --server.authentication false otherwise a prompt asking for the
password will halt the execution until responded.

## Configurations

- run-big-all.js
- run-small-all-junit.js
- run-small-all.js
- run-small-crud.js
- run-small-documents.js
- run-small-edges.js
