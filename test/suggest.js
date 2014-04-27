#!/usr/bin/env mocha --tester nyan

var fs = require('fs')
  , should = require('chai').should()
  , Ast = require('../ast')
  , Analyzer = require('../analyze')
  , Suggestor = require('../suggest')

  , PATH = 'Foo.java'

  , buf, an, suggestor;


before(function(done) {
    fs.readFile(PATH, function(err, b) {

        buf = b;
        an = Analyzer.of(PATH, b);
        suggestor = Suggestor.of(PATH, b);
        done();
    });
});

describe("Foo.java at 14,21", function() {
    it("analyzes as var", function() {
        an.at(14, 21)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('type')
                .that.equals(Ast.VARIABLE);
        });
    });
});

describe("Foo.java at 14,23", function() {
    it("suggests", function() {
        suggestor
        .at(14, 23)
        .find(function(err, resolved) {
            // TODO up
            console.log("reso", resolved);
        });
    });
});
