#!/usr/bin/env mocha --tester nyan

var fs = require('fs')
  , should = require('chai').should()
  , Ast = require('../ast')
  , Analyzer = require('../analyze')
  , Suggestor = require('../suggest')

  , PATH = 'Foo.java'

  , buf, an, suggestor;


beforeEach(function(done) {
    fs.readFile(PATH, function(err, b) {

        buf = b;
        an = Analyzer.of(PATH, b);
        suggestor = Suggestor.of(PATH, b);
        done();
    });
});

describe("Foo.java", function() {
    it("at 14,21: analyzes as var", function(cb) {
        an.at(14, 21)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('type')
                .that.equals(Ast.EXPRESSION);
            
            resolved.should.have.property('name')
                .that.equals('field1');

            // get the type!
            var varType = resolved.resolveExpressionType();
            should.exist(varType);
            varType.should.have.property('name')
                .that.equals('net.dhleong.njast.Foo$Fancy$Fancier');

            cb();
        });
    });

    it("at 53,28: analyzes as var", function(cb) {
        an.at(53, 28)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('type')
                .that.equals(Ast.EXPRESSION);
            
            resolved.should.have.property('name')
                .that.equals('other');

            // get the type!
            var varType = resolved.resolveExpressionType();
            should.exist(varType);
            varType.should.have.property('name')
                .that.equals('net.dhleong.njast.Foo$Fancy$Fancier');

            cb();
        });
    });
});

describe("Foo.java at 14,23", function() {
    it("suggests", function() {
        suggestor
        .at(14, 23)
        .find(function(/* err, resolved */) {
            // // TODO up
            // console.log("reso", resolved);
        });
    });
});
