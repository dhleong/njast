#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , chai = require('chai')
  , should = chai.should()
  , Suggestor = require('../suggest')

  , PATH = 'Foo.java'

  , buf, suggestor;


chai.use(function(_chai, utils) {
    utils.addProperty(chai.Assertion.prototype, 'field1', function() {
        var obj = utils.flag(this, 'object');
        new chai.Assertion(obj).to.have.property('methods')
            .that.is.an('array')
            .with.deep.property('[0]')
                .that.has.property('name').that.equals('doFancier');

        new chai.Assertion(obj).to.have.property('methods')
            .with.deep.property('[1]')
                .with.property('name').that.equals('buz');
        new chai.Assertion(obj).to.have.property('methods')
            .with.deep.property('[2]')
                .with.property('name').that.equals('bla');
        new chai.Assertion(obj).to.have.property('methods')
            .with.deep.property('[3]')
                .with.property('name').that.equals('breaks');

        new chai.Assertion(obj).to.have.property('fields')
            .that.is.an('array')
            .with.length(0);

    });
});


before(function(done) {
    fs.readFile(PATH, function(err, b) {

        buf = b;
        suggestor = Suggestor.of(PATH, b);
        done();
    });
});

describe("Suggestions in Foo.java at", function() {
    it("14, 23: field1.", function(done) {
        suggestor
        .at(14, 23)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.be.field1;

            done();
        });
    });

    it("63, 29: doFancier().", function(done) {
        suggestor
        .at(63, 29)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('methods')
                .that.is.an('array').of.length(1)
                .with.deep.property('[0]')
                    .that.has.property('name').that.equals('biz');

            done();
        });
    });

    it("68, 28: Fancy.this.", function(done) {
        suggestor
        .at(68, 28)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('methods')
                .that.is.an('array').of.length(1)
                .with.deep.property('[0]')
                    .that.has.property('name').that.equals('biz');

            done();
        });
    });

    it("79, 14: this.", function(done) {
        suggestor
        .at(79, 14)
        .find(function(err, resolved) {
            if (err) throw err;

            resolved.should.have.property('methods')
                .that.is.an('array').of.length(8)
                .with.deep.property('[0]')
                    .that.has.property('name').that.equals('baz');

            resolved.should.have.property('fields')
                .that.is.an('array').of.length(2)
                .with.deep.property('[0]')
                    .that.has.property('name').that.equals('field1');

            done();
        });
    });

    it("75, 21: this.field1.", function(done) {
        suggestor
        .at(75, 21)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.be.field1;

            done();
        });
    });

    // oh boy.
    it("43, 40: Foo.this.field1.", function(done) {
        suggestor
        .at(43, 40)
        .find(function(err, resolved) {
            
            should.not.exist(err);

            resolved.should.be.field1;

            done();
        });
    });

    it("83, 13: baz() -> Fancy", function(done) {
        suggestor
        .at(83, 13)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.property('methods')
                .that.is.an('array')
                .with.deep.property('[0].name')
                    .that.equals('biz');

            done();
        });
    });

    it("overridable methods"/* , function(done) {
        suggestor
        .at(12, 4)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.should.have.deep.property('methods[0].name')
                .that.equals('baz');

            // TODO should NOT have fields;
            // TODO SHOULD have methods from Extended

            done();
        });
    }*/);
});

