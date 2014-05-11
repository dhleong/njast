#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , should = require('chai').should()
  , parseFile = require('../proper_ast').parseFile

  , PATH = 'FullAst.java'

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

        // TODO
        it("handles static import");
        it("handles simple import.*");

        it("handles simple import", function() {

            ast.should.have.property('_root')
                .with.property('imports')
                .that.is.an('array')
                .and.to.contain({  // doesn't have "contains" :(
                    static: false, 
                    star: false,
                    path: 'net.dhleong.njast.subpackage.Imported'
                });
        });
    });

});
