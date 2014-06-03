/**
 * "update" controller, used to update the
 *  cached version of a file, and evaluate
 *  any checkers, etc.
 */

var ClassLoader = require('../classloader')
  , readFile = require('../ast').readFile;

module.exports = function(req, res) {

    var loader = ClassLoader.cachedFromSource(path);
    var path = req.body.path;
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

        // TODO suggest imports, actually
        ast.on('missing', function(missing) {
            res.json({
                missing: missing
            });
        });
    });
}

// don't attach the middleware
module.exports.usesBuffers = false;
