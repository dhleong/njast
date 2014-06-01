#!/usr/bin/env mocha 

var Ast = require('../ast')
  , ClassLoader = require('../classloader')
  , chai = require('chai')
  , should = chai.should()
  
  , ast, loader;

/* 
 * Trim the size of the stacktrace for easier viewing as we debug */
/* jshint ignore:start 
 */
console.oldError = console.error;
console.aerror = function () {
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

function partial(text, start, callback) {
    if (!callback) {
        callback = start;
        start = 1;
    }

    it(text, function(done) {
        Ast.parseFile('Foo.java', {
            type: 'part',
            start: start,
            text: new Buffer(text)
        }, {
            strict: false
        }, function(err, _ast) {
            if (err) throw err;

            ast = _ast;

            if (callback.length == 2) {
                callback(ast, done);
                return;
            }
            callback(ast);
            done();
        });
    });
}

describe("Partial ASTs", function() {

    before(function() {
        loader = ClassLoader.cachedFromSource('Foo.java');
    });

    partial('public static final Fanciest CONSTANT = new Fanciest();', 42,
    function(ast, done) {
        var node = ast.locate(42, 31)
        should.exist(node);
        node.should.have.deep.property('constructor.name')
            .that.equals("VarDef");
        node.should.have.property('name')
            .that.equals("CONSTANT");
        node.evaluateType(loader, function(err, resolved) {
            if (err) throw err;
            resolved.type.should.equal('net.dhleong.njast.Boring$Fanciest');
            done();
        });
    });

    partial('public static void method() {}', function(ast) {
        var node = ast.locate(1, 21);
        node.should.have.deep.property('constructor.name')
            .that.equals("Method");
    });

    partial('void method(Unresolved foo) { foo. }', function(ast) {
        var node = ast.locate(1, 31);
        node.should.have.deep.property('constructor.name')
            .that.equals("IdentifierExpression");

    });

    /** Mostly to ensure no overlap on first char of Imported */
    partial('final Imported object;', function(ast) {
        var node = ast.locate(1, 7);
        node.should.have.deep.property('constructor.name')
            .that.equals("ReferenceType");
    });
});


describe("Method", function() {
    it("args");
});
