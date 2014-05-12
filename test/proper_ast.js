#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , should = require('chai').should()
  , parseFile = require('../proper_ast').parseFile

  , PATH = 'FullAst.java'

  , buf, ast
  , fullast;

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

                if (ast.toplevel) {
                    fullast = ast.toplevel[0];
                }

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
            ast.qualifieds.should.contain.key('net.dhleong.njast.FullAst'); 
            ast.should.have.property('toplevel')
                .that.is.an('array')
                .with.deep.property('[0]')
                    .that.has.property('qualifiedName')
                        .that.equals('net.dhleong.njast.FullAst');
        });

        describe("and handles ClassDeclarations: ", function() {

            // TODO
            it("Has TypeParameters");

            it("Extends FullBase", function() {
                fullast.should.have.property('extends')
                    .with.property('name')
                        .that.equals('FullBase');
            });

            it("Implements FullInterface", function() {
                fullast.should.have.property('implements')
                    .with.deep.property('[0]')
                        .that.has.property('name')
                            .that.equals('FullInterface');
            });

            it("Has default static field1", function() {
                fullast.body.should.have.property('kids')
                    .with.deep.property('[0]')
                        .that.has.property('name')
                            .that.equals('field1');
                fullast.body.kids[0].should.have.property('type')
                    .that.has.property('name')
                        .that.equals('Imported');
            });
        });

        // TODO
        it("has SomeInterface", function() {
            ast.qualifieds.should.contain.key('net.dhleong.njast.SomeInterface');
            ast.should.have.property('toplevel')
                .that.is.an('array')
                .with.deep.property('[1]')
                    .that.has.property('qualifiedName')
                        .that.equals('net.dhleong.njast.SomeInterface');
        });
        it("has SomeEnum");
        it("has SomeAnnotation");
    });

});
