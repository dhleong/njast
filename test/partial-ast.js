#!/usr/bin/env mocha 

var Ast = require('../ast')
  , chai = require('chai')
  , should = chai.should()
  
  , ast;

function partial(text, start, callback) {
    if (!callback) {
        callback = start;
        start = 1;
    }

    it(text, function(done) {
        Ast.parseFile('Bla.java', {
            type: 'part',
            start: start,
            text: new Buffer(text)
        }, {
            strict: false
        }, function(err, _ast) {
            if (err) throw err;

            ast = _ast;

            callback(ast);
            done();
        });
    });
}

describe("Partial ASTs", function() {

    partial('public static final String CONSTANT = "bla";', 42,
    function(ast) {
        var node = ast.locate(42, 29)
        should.exist(node);
        node.should.have.deep.property('constructor.name')
            .that.equals("VarDef");
        node.should.have.property('name')
            .that.equals("CONSTANT");
    });

    partial('public static void method() {}', function(ast) {
        var node = ast.locate(1, 21);
        node.should.have.deep.property('constructor.name')
            .that.equals("Method");
    });
});


describe("Method", function() {
    it("args");
});
