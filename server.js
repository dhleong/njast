#!/usr/bin/env node

var express = require('express')
  , parseFile = require('./ast').parseFile
  , ClassLoader = require('./classloader');

// --------------------------------------------------------------------------------
// configs
// --------------------------------------------------------------------------------

// var DEBUG = true;
var HTTP_PORT; // undefined picks a random port
HTTP_PORT = 3000; // for testing convenience


// --------------------------------------------------------------------------------
// re-route logging (actually, we can just run this externally)
// --------------------------------------------------------------------------------

/*  // this crashes node when run within vim for some reason...
if (DEBUG) {
    var fs = require('fs');
    var dir = '/Users/dhleong/code/njast';
    var access = fs.createWriteStream(dir + '/node.access.log', { flags: 'a' });

    // // redirect stdout / stderr
    // process.stdout.pipe(access);
    process.stderr.pipe(access);
    console.log = function() {
        var line = Array.prototype.slice.apply(arguments)
            .map(function(arg) {
                if (typeof(arg) == 'string') return arg;
                return require('util').inspect(arg);
            }).join(" ");

        access.write(line + '\n');
        process.stdout.write(line + '\n');
    }
}
*/

// --------------------------------------------------------------------------------
// prepare express
// --------------------------------------------------------------------------------

var app = express();
app.use(require('body-parser')());

// --------------------------------------------------------------------------------
// middleware
// --------------------------------------------------------------------------------

// middleware that handles request body
var bufferParser = function(req, res, next) {

    if (!req.body)
        return res.send(400, "Empty body");
    else if (!req.body.pos)
        return res.send(400, "No pos");

    var path = req.body.path;
    var line = req.body.pos[0];
    var ch   = req.body.pos[1];
    var file = req.body.buffer;

    if (!(path && line && file !== undefined && ch !== undefined)) {
        console.log("400!", path, line, ch, file);
        return res.send(400);
    }

    if (typeof(file) == 'string')
        file = {type: 'full', text: file};

    req.path = path;
    req.line = line;
    req.ch = ch;
    req.start = 0;
    req.buf = file
    req.buf.text = new Buffer(file.text); // FIXME encoding?

    /** 
     * Convenience function to get an ast.
     *  Unlike parseFile, strict defaults to false!
     */
    req.ast = function(options, callback) {
        if (!callback) {
            callback = options;
            options = {strict: false};
        }
        
        parseFile(path, req.buf, options, callback);
    };

    req.classLoader = function() {
        return ClassLoader.cachedFromSource(path);
    };

    /** same stuff for document and define, so... */
    req.resolveDeclaringNode = function(cb) {

        var loader = req.classLoader();
        req.ast(function(err, ast) {
            if (err) return res.send(400, err.message);

            var node = ast.locate(req.line, req.ch);
            node.resolveDeclaringType(loader, function(err, type) {
                if (err) return res.send(400, err.message);

                var declaring = ast.qualifieds[type];
                if (declaring) {
                    // yes, it's local... is it a type?
                    if (declaring.name == node.name)
                        // class, enum, etc.
                        return cb(declaring.constructor.name.toLowerCase(), declaring);

                    // search by scope
                    var varDef = node.searchScope(node.name)
                    if (varDef)
                        return cb('var', varDef);

                    var method = node.searchMethodScope(node.name);
                    if (method)
                        return cb('method', method);
                }

                // TODO parent types?
                res.json({error:"Not implemented; found: " + node.constructor.name + " in " + type});
            });
        });
    };

    res.results = function(json) {
        res.json({
            // TODO proper start/end locations?
            start: {ch: ch}
          , end: {ch: ch} 
          , results: json
        });
    };

    next();
};

// --------------------------------------------------------------------------------
// prepare routing
// --------------------------------------------------------------------------------

// util endpoint
app.post('/log', function(req, res) {
    console.log('<<', req.body.data, req.body.obj);
    res.json({})
});

// connect all controllers
require('fs').readdir('./controllers', function(err, files) {
    if (err) throw err;

    files.forEach(function(file) {
        var path = '/' + file.substr(0, file.indexOf('.'));
        if (path == '/')
            return;

        var controller = require('./controllers' + path);
        var middleware = controller.usesBuffers === false
            ? []
            : bufferParser;
        app.post(path, middleware, controller); 
    });
});

// --------------------------------------------------------------------------------
// start server on any random port and dump it so we know
// --------------------------------------------------------------------------------

var server = require('http').createServer(app);
server.listen(HTTP_PORT)
.on('listening', function() {
    console.log("Listening on port " + server.address().port);
});

