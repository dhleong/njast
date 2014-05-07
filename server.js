#!/usr/bin/env node

var express = require('express');

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
app.configure(function() {
    app.use(express.bodyParser());
    app.use(app.router);
});

// --------------------------------------------------------------------------------
// prepare routing
// --------------------------------------------------------------------------------

app.post('/suggest', require('./controllers/suggest')); 

// --------------------------------------------------------------------------------
// start server on any random port and dump it so we know
// --------------------------------------------------------------------------------

var server = require('http').createServer(app);
server.listen(HTTP_PORT)
.on('listening', function() {
    console.log("Listening on port " + server.address().port);
});

