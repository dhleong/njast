/**
 * "init" controller, used to precache
 */

var ClassLoader = require('../classloader')
  , readFile = require('../ast').readFile;

module.exports = function(req, res) {

    // nothing to see here, move along...
    res.send(204);

    var path = req.body.path;
    var loader = ClassLoader.cachedFromSource(path);
    console.log("init...", path, loader);
    readFile(path, {
        strict: false
      // , debug: true
    }, function(err, ast) {
        if (err) return console.error(err); 

        console.log("init: cached", path);
        loader.putCache(path, ast);

        // TODO begin pre-caching/indexing
    });
}

// don't attach the middleware
module.exports.usesBuffers = false;
