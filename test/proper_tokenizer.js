#!/usr/bin/env mocha 

var should = require('chai').should()
  , Tokenizer = require('../proper_tokenizer');


function tokify(string) {
    return new Tokenizer(".", new Buffer(string));
}

describe("readAssignment", function() {
    it("rejects +", function() {
        should.not.exist(tokify('+').readAssignment());
    });

    it("rejects + a", function() {
        should.not.exist(tokify('+ a').readAssignment());
    });

    it("accepts +=", function() {
        tokify('+=').readAssignment().should.equal('+=');
    });

    it("accepts =", function() {
        tokify('=').readAssignment().should.equal('=');
    });

    it("rejects <=", function() {
        should.not.exist(tokify('<=').readAssignment());
    });

    it("accepts <<=", function() {
        tokify('<<=').readAssignment().should.equal('<<=');
    });

    it("rejects >=", function() {
        should.not.exist(tokify('>=').readAssignment());
    });

    it("accepts >>=", function() {
        tokify('>>=').readAssignment().should.equal('>>=');
    });

    it("accepts >>>=", function() {
        tokify('>>>=').readAssignment().should.equal('>>>=');
    });
});
