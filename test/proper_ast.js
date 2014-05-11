#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , should = require('chai').should()
  , parseFile = require('../proper_ast').parseFile

  , PATH = 'Foo.java'

  , buf, ast;

describe("Full Parse of", function() {
    beforeEach(function(done) {
        fs.readFile(PATH, function(err, b) {

            buf = b;
            parseFile(PATH, b, function(err, _ast) {
                should.not.exist(err);
                ast = _ast;

                done();
            });
        });
    });

    describe("FullAst.java", function() {
        
        it("is in the right package", function() {
            ast.getPackage().should.equal('net.dhleong.njast');
        });
    });

});
