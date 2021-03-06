/**
 * "update" controller, used to update the
 *  cached version of a file, and evaluate
 *  any checkers, etc.
 */

var async = require('async')
  , ClassLoader = require('../classloader')
  , readFile = require('../ast').readFile
  
  , MAX_PARALLEL = 20;

function handleMissing(loader, ast, onComplete) {
    ast.on('missing', function(missing) {
        if (!missing) return onComplete({});

        async.eachLimit(missing, MAX_PARALLEL, function(data, callback) {
            loader.suggestImport(data.name, function(err, imports) {
                console.log("Suggest!", data.name, err, imports);
                if (err) return callback(err);

                data.imports = imports;
                console.log('data', data, imports);
                callback();
            });
        }, function(err) {
            if (err) return onComplete(err);

            var json = missing.reduce(function(dict, item) {
                if (item.imports && item.imports.length) {
                    // we've at least heard of the class!
                    dict.missing.push(item);
                } else {
                    // what the hell is this?!
                    dict.unknown.push(item);
                }
                return dict;
            }, {missing:[], unknown:[]});

            onComplete(null, json);
        });
    });
}

module.exports = function(req, res) {

    var path = req.body.path;
    var loader = ClassLoader.cachedFromSource(path);
    readFile(path, {
        strict: false
      , checkImports: true
      , loader: loader
    }, function(err, ast) {
        if (err) {
            res.send(400, err.message);
            return console.error('update.js:', err);
        }

        console.log("update: cached", path);
        loader.putCache(path, ast);

        // if we add multiple handlers, we could
        // async.map them and reduce the results into
        // a single dict
        handleMissing(loader, ast, function(err, json) {
            console.log("suggest", err, json);
            if (err) return res.send(400, err.message);

            res.json(json);
        });
    });
}

// don't attach the middleware
module.exports.usesBuffers = false;
