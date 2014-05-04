#!/usr/bin/env node

var express = require('express');

// --------------------------------------------------------------------------------
// prepare express
// --------------------------------------------------------------------------------

var app = express();
app.configure(function() {
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
server.listen()
.on('listening', function() {
    console.log("Listening on port " + server.address().port);
});

