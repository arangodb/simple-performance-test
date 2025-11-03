'use strict';

const Mustache = require("mustache");
const {aql, db} = require("@arangodb");
const _ = require("lodash");

const {htmlDecode, unravel, cartesian} = require("./utils");
const {targets} = require("./aggregations");

const aqlQuery = function (def, vars, start, end, interval) {
    const agg = def.aggregation && def.aggregation !== 'NONE'
        ? def.aggregation
        : null;
    vars['start'] = start;
    vars['end'] = end;
    let queryExpression = Mustache.render(def.query, vars);
    const querySnippet = aql.literal(queryExpression);

    if (agg) {
        switch (agg) {
            case 'ABS':
                return aql`
                  ${querySnippet}
                  LET diff = doc.value1 > 0 && doc.value2 > 0 ? doc.value1 - doc.value2 : 0
                  FILTER doc.time >= ${start} AND doc.time <= DATE_TIMESTAMP(DATE_TRUNC(DATE_NOW(), 'd'))
                  SORT doc.time
                  RETURN [diff, doc.time]
                `;
            case 'RELD':
                return aql`
                  ${querySnippet}
                  LET diff = doc.value1 > 0 && doc.value2 > 0 ? ((doc.value1 - doc.value2) / doc.value2) * 100 : 0
                  FILTER doc.time >= ${start} AND doc.time <= DATE_TIMESTAMP(DATE_TRUNC(DATE_NOW(), 'd'))
                  SORT doc.time
                  RETURN [ABS(diff), doc.time]
                `;
            case 'RELI':
                return aql`
                  ${querySnippet}
                  LET diff = doc.value1 > 0 && doc.value2 > 0 ? ((doc.value2 - doc.value1) / doc.value1) * 100 : 0
                  FILTER doc.time >= ${start} AND doc.time <= DATE_TIMESTAMP(DATE_TRUNC(DATE_NOW(), 'd'))
                  SORT doc.time
                  RETURN [ABS(diff), doc.time]
                `;
            case 'VAL1':
                return aql`
                  ${querySnippet}
                  FILTER doc.time >= ${start} AND doc.time <= DATE_TIMESTAMP(DATE_TRUNC(DATE_NOW(), 'd'))
                  SORT doc.time
                  RETURN [doc.value1, doc.time]
                `;
            case 'VAL2':
                return aql`
                  ${querySnippet}
                  FILTER doc.time >= ${start} AND doc.time <= DATE_TIMESTAMP(DATE_TRUNC(DATE_NOW(), 'd'))
                  SORT doc.time
                  RETURN [doc.value2, doc.time]
                `;
            default:
                return aql`
                  ${querySnippet}
                  FILTER doc.time >= ${start} AND doc.time < ${end}
                  COLLECT date = FLOOR(doc.time / ${interval}) * ${interval}
                  AGGREGATE value = ${aql.literal(agg)}(doc.value)
                  SORT date
                  RETURN [value, date]
                `;
        }
    } else {
        return aql`
          ${querySnippet}
          FILTER doc.time >= ${start} AND doc.time < ${end}
          SORT doc.time
          RETURN [doc.value, doc.time]
        `;
    }
};

const computeMultiValues = function (cfg, vars) {
    let multiKeys = [];
    let multiValues = [];

    if (cfg['multiValueTemplateVariables']) {
        let d = cfg['multiValueTemplateVariables'];
        multiKeys = _.map(_.split(d, ','), str => str.trim());
    }

    for (let key of multiKeys) {
        if (key in vars) {
            let value = vars[key].value;

            if (!Array.isArray(value)) {
                value = [value];
            }

            let l = [];

            for (let v of value) {
                let obj = {};
                obj[key] = htmlDecode(v);
                l.push(obj);
            }

            multiValues.push(l);
        }
    }

    if (multiValues.length > 0) {
        multiValues = unravel(...cartesian(multiValues));
    } else {
        multiValues = [[{}]];
    }

    if (cfg.logQuery) {
        console.log(`multiKeys: ${multiKeys}`);
        console.log(`multiValues: ${JSON.stringify(multiValues)}`);
    }

    return {multiKeys, multiValues};
};

const setupSingleValue = function (cfg, grafana, params, scopedVars, multiKeys) {
    const logQuery = cfg.logQuery;

    for (let key of Object.keys(scopedVars)) {
        if (key[0] !== '_' && !multiKeys.includes(key)) {
            const val = scopedVars[key];
            grafana[key] = htmlDecode(val.value);

            if (logQuery) {
                console.log('using grafana var \'' + key + '\': \'' + grafana[key] + '\'');
            }
        }
    }

    const {interval, start, end} = params;

    grafana['START'] = start;
    grafana['END'] = end;
    grafana['INTERVAL'] = interval;
};

// see https://grafana.com/grafana/plugins/simpod-json-datasource/
exports.search = function (cfg, target, range = {}) {
    const tv = cfg['templateVariables'];
    const targetArray = target.split('_');
    const trg = targetArray[0];
    let query = tv[trg];
    if (query) {
        if (targetArray.length > 1 && Object.keys(range).length > 0) {
            const params = {
                size: targetArray[1],
                mode: targetArray[2],
                ver1: targetArray[3],
                ver2: targetArray[4],
                start: Number(new Date(range.from)),
                end: Number(new Date(range.to))
            }
            query = Mustache.render(query, params);
        }
        if (cfg.logQuery) {
            console.log(`target query ${trg}: ${query}`);
        }

        return db._query(query).toArray();
    } else if (cfg.logQuery) {
        console.log(`target ${trg} is not known`);
    }

    return [];
}

// see https://grafana.com/grafana/plugins/simpod-json-datasource/
exports.results = function (cfg, params) {
    const logQuery = cfg.logQuery;
    const hideEmpty = cfg.hideEmpty;

    const scopedVars = params.scopedVars || {};
    const {multiKeys, multiValues} = computeMultiValues(cfg, scopedVars);

    // first add single value variables to the map
    const grafana = {};
    setupSingleValue(cfg, grafana, params, scopedVars, multiKeys);

    // now build a list of targets x multi-values combinations
    const {TARGETS} = targets(cfg);
    const defs = [];

    for (let mv of multiValues) {
        for (let target of params.targets) {
            let name = target.target;

            if (!(name in TARGETS)) {
                defs.push({target: target});
                continue;
            }

            const def = _.merge({}, TARGETS[name]);
            const data = def.data;
            const vars = _.assign({grafana}, def.view, data);

            for (let m of mv) {
                vars.grafana = _.assign(vars.grafana, m);
            }

            // in case we defined an alias in the Grafana query definition
            if (data && data.alias) {
                name = Mustache.render(data.alias, vars);
            }

            // in case we defined an alias in the Foxx configuration
            else if (def.alias) {
                name = Mustache.render(def.alias, vars);
            }

            defs.push({target: name, definition: def, vars: _.merge({}, vars)});
        }
    }

    // execute the queries
    const response = [];
    const {interval, start, end, relStart, relEnd} = params;

    for (let def of defs) {
        if (!def.definition) {
            if (!hideEmpty || logQuery) {
                response.push({
                    target: def.target,
                    datapoints: []
                });
            }

            continue;
        }

        if (logQuery) {
            console.log(`using definition '${JSON.stringify(def)}'`);
        }

        const query = aqlQuery(def.definition, def.vars, start, end, interval);

        if (logQuery) {
            console.log(`using query '${JSON.stringify(query)}'`);
        }

        const datapoints = db._query(query).toArray();

        if (logQuery) {
            console.log(`datapoints '${datapoints}'`);
        }

        if (!hideEmpty || datapoints.length > 0 || logQuery) {
            const result = {target: def.target, datapoints};

            if (logQuery) {
                result.query = query;
                result.definition = {
                    alias: def.definition.alias,
                    view: def.definition.view,
                    vars: def.vars
                };
            }


            response.push(result);
        }
    }

    return response;
};
