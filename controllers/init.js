/**
 * "init" controller, used to precache
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
            return console.error(err);
        }

        console.log("init: cached", path);
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
