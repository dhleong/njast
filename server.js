#!/usr/bin/env node

var express = require('express');

// --------------------------------------------------------------------------------
// configs
// --------------------------------------------------------------------------------

var HTTP_PORT; // undefined picks a random port
HTTP_PORT = 3000; // for testing convenience

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

