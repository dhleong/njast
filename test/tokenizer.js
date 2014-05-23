#!/usr/bin/env mocha 

var should = require('chai').should()
  , Tokenizer = require('../tokenizer');


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

describe("readDigit", function() {

    describe("(2)", function() {
        it("accepts 0-1", function() {
            tokify("0").readDigit(2).should.equal("0");
            tokify("1").readDigit(2).should.equal("1");
        });

        it("rejects 2, a", function() {
            should.not.exist(tokify("2").readDigit(2));
            should.not.exist(tokify("a").readDigit(2));
        });
    });

    describe("(10)", function() {
        it("accepts 0-9", function() {
            for (var i=0; i < 10; i++) {
                var string = '' + i;
                tokify(string).readDigit(10).should.equal(string);
            }
        });

        it("rejects x, a, f", function() {
            should.not.exist(tokify("x").readDigit(10));
            should.not.exist(tokify("a").readDigit(10));
            should.not.exist(tokify("f").readDigit(10));
        });
    });

    describe("(16)", function() {
        it("accepts 0-f", function() {
            for (var i=0; i < 10; i++) {
                var string = '' + i;
                tokify(string).readDigit(16).should.equal(string);
            }

            tokify("a").readDigit(16).should.equal("a");
            tokify("b").readDigit(16).should.equal("b");
            tokify("c").readDigit(16).should.equal("c");
            tokify("d").readDigit(16).should.equal("d");
            tokify("e").readDigit(16).should.equal("e");
            tokify("f").readDigit(16).should.equal("f");
        });

        it("rejects x", function() {
            should.not.exist(tokify("x").readDigit(16));
        });
    });
});

describe("readInfixOp", function() {
    it("accepts +", function() {
        tokify('+').readInfixOp().should.equal('+');
    });
    it("rejects +=", function() {
        should.not.exist(tokify('+=').readInfixOp());
    });
    it("accepts ||", function() {
        tokify('||').readInfixOp().should.equal('||');
    });
    it("accepts |", function() {
        tokify('|').readInfixOp().should.equal('|');
    });
    it("accepts ==", function() {
        tokify('==').readInfixOp().should.equal('==');
    });
    it("accepts !=", function() {
        tokify('!=').readInfixOp().should.equal('!=');
    });
    it("accepts >=", function() {
        tokify('>=').readInfixOp().should.equal('>=');
    });
    it("accepts >>", function() {
        tokify('>>').readInfixOp().should.equal('>>');
    });
    it("accepts >>>", function() {
        tokify('>>>').readInfixOp().should.equal('>>>');
    });
});

describe("readPrefixOp", function() {

    it("accepts +", function() {
        tokify('+').readPrefixOp().should.equal('+');
    });
    it("accepts ~", function() {
        tokify('~').readPrefixOp().should.equal('~');
    });
    it("accepts ++", function() {
        tokify('++').readPrefixOp().should.equal('++');
    });
    it("accepts --", function() {
        tokify('--').readPrefixOp().should.equal('--');
    });
    it("rejects +=", function() {
        should.not.exist(tokify('+=').readPrefixOp());
    });
});

describe("readPostfixOp", function() {

    it("rejects +", function() {
        should.not.exist(tokify('+').readPostfixOp());
    });
    it("accepts ++", function() {
        tokify('++').readPostfixOp().should.equal('++');
    });
    it("accepts --", function() {
        tokify('--').readPostfixOp().should.equal('--');
    });
    it("rejects +=", function() {
        should.not.exist(tokify('+=').readPostfixOp());
    });
});
