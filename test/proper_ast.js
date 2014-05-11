#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , should = require('chai').should()
  , parseFile = require('../proper_ast').parseFile

  , PATH = 'FullAst.java'

  , buf, ast;

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

describe("Parse of", function() {
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

        it("has FullAst class", function() {
            ast.should.have.property('qualifieds')
                .with.key('net.dhleong.njast.FullAst');
            ast.should.have.property('toplevel')
                .and.with.property('qualifiedName')
                    .that.equals('net.dhleong.njast.FullAst');
        });

        describe("handles ClassDeclarations", function() {
            it("Extends FullBase");
            it("Implements FullInterface");
        });

        // TODO
        it("has SomeInterface"/*, function() {
            ast.should.have.property('qualifieds')
                .with.key('net.dhleong.njast.SomeInterface');
        }*/);
        it("has SomeEnum");
        it("has SomeAnnotation");
    });

});
