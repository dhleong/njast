#!/usr/bin/env node

var Ast = require('../../ast')
  , glob = require('glob')
  , path = require('path')
  , async = require('async');

var source = path.join(process.env.ANDROID_HOME, 'sources', 'android-19', '**', '*.java');

glob(source, function(err, files) {
    if (err) return console.error(err);

    async.eachSeries(files, function(file, cb) {
        var timer = setTimeout(function() {
            cb(new Error('Timeout parsing ' + file));
        }, 4000);

        console.log("Parsing", file);
        Ast.readFile(file, function(err, ast) {
            clearTimeout(timer);

            if (!err)
                console.log("... Parsed", file);
            cb(err, ast);
        });
    }, function(err) {
        if (err) throw err;

        console.log('done!');
    });
});
