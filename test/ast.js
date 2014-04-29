#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , should = require('chai').should()
  , Ast = require('../ast')

  , PATH = 'Foo.java'

  , buf, ast;


beforeEach(function(done) {
    fs.readFile(PATH, function(err, b) {

        buf = b;
        ast = new Ast(PATH, b);
        ast.parse(function() {
            done();
        });
    });
});

describe("Foo.java", function() {
    it("finds Foo", function() {
        var obj = ast.extractClass("net.dhleong.njast.Foo");
        should.exist(obj);
        obj.constructor.name.should.equal('Class');
    });

    it("finds Foo$Fancy", function() {
        var obj = ast.extractClass("net.dhleong.njast.Foo$Fancy");
        should.exist(obj);
        obj.constructor.name.should.equal('Class');
    });

    it("finds Foo$Fancy$Fancier", function() {
        var obj = ast.extractClass("net.dhleong.njast.Foo$Fancy$Fancier");
        should.exist(obj);
        obj.constructor.name.should.equal('Class');
    });
});
