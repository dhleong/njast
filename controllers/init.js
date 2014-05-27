/**
 * "init" controller, used to precache
 */

var ClassLoader = require('../classloader')
  , readFile = require('../ast').readFile;

module.exports = function(req, res) {
    res.send(204);

    var path = req.body.path;
    readFile(path, function(err, ast) {
        if (err) return console.error(err);

        console.log("init: cached", path);
        ClassLoader.cachedFromSource(path)
            .putCache(path, ast);
    });
}

// don't attach the middleware
module.exports.usesBuffers = false;
