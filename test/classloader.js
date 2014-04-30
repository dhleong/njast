#!/usr/bin/env mocha 

var ClassLoader = require('../classloader')
  , should = require('chai').should();

var loader;

beforeEach(function() {
    
    loader = ClassLoader.fromSource('.');
});

describe("ClassLoader", function() {
    
    it("loads Foo", function(done) {
        loader.openClass("net.dhleong.njast.Foo", function(err, ast) {
            should.not.exist(err);
            should.exist(ast);

            ast.should.have.property('name')
                .that.equals('Foo');

            done();
        });
    });

    it("loads Fancy", function(done) {
        loader.openClass("net.dhleong.njast.Foo$Fancy", function(err, ast) {
            should.not.exist(err);
            should.exist(ast);

            ast.should.have.property('name')
                .that.equals('Fancy');

            done();
        });
    });

    it("loads Fancier", function(done) {
        loader.openClass("net.dhleong.njast.Foo$Fancy$Fancier", function(err, ast) {
            should.not.exist(err);
            should.exist(ast);

            ast.should.have.property('name')
                .that.equals('Fancier');

            done();
        });
    });
});
