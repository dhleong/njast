#!/usr/bin/env mocha 
//--reporter nyan

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

describe("Foo.java", function() {
    it("at 14,21: analyzes as var", function(done) {
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

            done();
        });
    });

    it("at 53,28: analyzes as var", function(done) {
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

            done();
        });
    });
});

describe("Foo.java at 14,23", function() {
    it("suggests", function(done) {
        suggestor
        .at(14, 23)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('methods')
                .that.is.an('array')
                .with.deep.property('[0]')
                    .that.has.property('name').that.equals('doFancier');

            resolved.methods.should.have.deep.property('[1]')
                .with.property('name').that.equals('buz');
            resolved.methods.should.have.deep.property('[2]')
                .with.property('name').that.equals('bla');
            resolved.methods.should.have.deep.property('[3]')
                .with.property('name').that.equals('breaks');

            resolved.should.have.property('fields')
                .that.is.an('array')
                .with.length(0);

            done();
        });
    });
});
