# simple-performance-test

- [How to start](#how-to-start)
- [Configurations](#configurations)
- [Third party tools](#third-party-tools)

## How to start

### Directly running in a Single Server

    arangod \
        -c none \
        --javascript.app-path /tmp/app \
        --javascript.startup-directory /usr/share/arangodb3/js \
        --server.rest-server false \
        --javascript.module-directory `pwd` \
        DATABASE_DIR \
        --javascript.script CONFIGURATION.js

### Start from arangosh

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

- simple/run-big-all.js
- simple/run-small-all-junit.js
- simple/run-small-all.js
- simple/run-small-crud.js
- simple/run-small-documents.js
- simple/run-small-edges.js

## Third party tools
### Grafana-connector

`simple-performance-test` tests are intended to be executed on [Jenkins CI](https://jenkins.arangodb.biz/view/Performance/)
with results uploaded to [Depot - Figures ArangoDB](https://figures.arangodb.biz/) and visualized using the following Grafana 
dashboards:
* [Performance Gauge](https://g-dc685c4b12.grafana-workspace.eu-central-1.amazonaws.com/d/ZKP7WpVMz/performance-gauge?orgId=1)
* [Performance Gauge - tests with performance degradation](https://g-dc685c4b12.grafana-workspace.eu-central-1.amazonaws.com/d/tCb3Rs6Hz/performance-gauge-tests-with-performance-degradation?orgId=1)
* [Performance Gauge - tests with performance improvement](https://g-dc685c4b12.grafana-workspace.eu-central-1.amazonaws.com/d/MGNSmWRDz/performance-gauge-tests-with-performance-improvement?orgId=1)

_**Performance Gauge - tests with performance degradation**_ and _**Performance Gauge - tests with performance degradation**_ 
dashboards use a **_custom_** version of Arango's `grafana-connector` Foxx application. This custom version of grafana-connector 
(together with required libraries) can be found in `3rdParty/grafana-connector` folder of the project.
