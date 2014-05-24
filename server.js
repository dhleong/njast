#!/usr/bin/env node

var express = require('express')
  , parseFile = require('./ast').parseFile
  , ClassLoader = require('./classloader');

// --------------------------------------------------------------------------------
// configs
// --------------------------------------------------------------------------------

var DEBUG = true;
var HTTP_PORT; // undefined picks a random port
HTTP_PORT = 3000; // for testing convenience


// --------------------------------------------------------------------------------
// re-route logging (for now, anyway)
// --------------------------------------------------------------------------------

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

// --------------------------------------------------------------------------------
// prepare express
// --------------------------------------------------------------------------------

var app = express();
app.use(require('body-parser')());

// --------------------------------------------------------------------------------
// prepare routing
// --------------------------------------------------------------------------------

app.post('/log', function(req, res) {
    console.log('<<', req.body.data);
    res.json({})
});

// middleware that handles request body
app.use(function(req, res, next) {

    if (!req.body)
        return res.send(400, "Empty body");
    else if (!req.body.pos)
        return res.send(400, "No pos");

    var path = req.body.path;
    var line = req.body.pos[0];
    var ch   = req.body.pos[1];
    var file = req.body.buffer;

    if (!(path && line && file !== undefined && ch !== undefined))
        return res.send(400);

    req.path = path;
    req.line = line;
    req.ch = ch;
    req.buf = new Buffer(file); // FIXME encoding?

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

    res.results = function(json) {
        res.json({
            // TODO proper start/end locations?
            start: {ch: ch}
          , end: {ch: ch} 
          , results: json
        });
    };

    next();
});

// connect all controllers
require('fs').readdir('./controllers', function(err, files) {
    if (err) throw err;

    files.forEach(function(file) {
        var path = '/' + file.substr(0, file.indexOf('.'));
        if (path == '/')
            return;
        app.post(path, require('./controllers' + path)); 
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

