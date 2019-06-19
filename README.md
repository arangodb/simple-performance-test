# How to start

    arangod \
        -c none \
        --javascript.app-path /tmp/app \
        --javascript.startup-directory /usr/share/arangodb3/js \
        --server.rest-server false \
        --javascript.module-directory `pwd` \
        DATABASE_DIR \
        --javascript.script CONFIGURATION.js

## Configurations

- run-small-crud.js
