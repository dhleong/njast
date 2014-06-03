/**
 * "init" controller, used to precache
 */

var ClassLoader = require('../classloader')
  , readFile = require('../ast').readFile;

module.exports = function(req, res) {

    // nothing to see here, move along...
    res.send(204);

    var loader = ClassLoader.cachedFromSource(path);
    var path = req.body.path;
    console.log("init...", path);
    readFile(path, {
        strict: false
    }, function(err, ast) {
        if (err) return console.error(err); 

        console.log("init: cached", path);
        loader.putCache(path, ast);

        // TODO begin pre-caching/indexing
    });
}

// don't attach the middleware
module.exports.usesBuffers = false;
