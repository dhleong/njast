#!/usr/bin/env mocha 

var ClassLoader = require('../classloader')
  , Ast = require('../ast')
  , should = require('chai').should();

/* 
 * Trim the size of the stacktrace for easier viewing as we debug */
/* jshint ignore:start 
 */
console.oldError = console.error;
console.error = function () {
    if (typeof arguments.stack !== 'undefined') {
        console.oldError.call(console, arguments.stack);
    } else {
        var oldStack = arguments[4];
        if (typeof oldStack !== 'undefined') {
            arguments[4] = oldStack.substr(0, 
                oldStack.indexOf('\n'));
            var at = oldStack.indexOf('at');
            if (~at) {
                arguments[4] += '\n';
                for (var i=0; i < at; i++)
                    arguments[4] += ' ';
                arguments[4] += '...';
            }
        }
        console.oldError.apply(console, arguments);
    }
};
/* jshint ignore:end */

var loader;

before(function() {
    
    loader = ClassLoader.fromSource('.');
});

describe("ClassLoader", function() {
    
    /* // deprecated
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
    */

    it("resolves return type of Foo#baz", function(done) {
        loader.resolveMethodReturnType('net.dhleong.njast.Foo', 'baz', function(err, value) {
            if (err) throw err;
            should.not.exist(err);

            value.type.should.equal('net.dhleong.njast.Foo$Fancy');
            value.from.should.equal(Ast.FROM_METHOD);

            done();
        });
    });

    it("resolves return type of Extended#fluidMethod", function(done) {
        loader.resolveMethodReturnType('net.dhleong.njast.subpackage.Extended', 
                'fluidMethod', function(err, value) {
            if (err) throw err;
            should.not.exist(err);

            value.type.should.equal('net.dhleong.njast.subpackage.Extended');
            value.from.should.equal(Ast.FROM_METHOD);

            done();
        });
    });
});
