#!/usr/bin/env mocha

var fs = require('fs')
  , should = require('chai').should()
  , Ast = require('../ast')
  , Analyzer = require('../analyze');


/* jshint unused:false */
function stringify(obj) {
    return JSON.stringify(obj, function(key, value) {
        if (key.charAt(0) == '_')
            return;

        return value;
    }, '  ');
}

var PATH = "./Foo.java";
var an;

before(function(done) {
    fs.readFile(PATH, function(err, buf) {

        an = Analyzer.of(PATH, buf);
        done();
    });

});

describe("Analyzing Foo.java at", function() {

    it("21, 31 finds out: int", function(done) {
        
        an.word("out")
        .at(21, 31)
        .find(function(err, type) {
            should.not.exist(err);

            type.name.should.equal('int');
            type.type.should.equal(Ast.VARIABLE);

            done();
        });
    });

    it("27, 43 finds arg3: Boring", function(done) {
        
        an.word("arg3")
        .at(27, 43)
        .find(function(err, type) {
            should.not.exist(err);

            type.name.should.equal("net.dhleong.njast.Boring");
            type.type.should.equal(Ast.VARIABLE);

            done();
        });
    });

    it("23, 28 finds prepare: method -> Fanciest", function(done) {
        an.word("prepare")
        .at(23, 28)
        .find(function(err, type) {
            should.not.exist(err);

            type.name.should.equal('prepare');
            type.type.should.equal(Ast.METHOD);

            type.should.have.property('container')
                .with.property('name')
                    .that.equals('net.dhleong.njast.util.Fanciest');
            type.should.have.property('container')
                .with.property('type')
                    .that.equals(Ast.TYPE);

            done();
        });
        
    });
    

    it("26, 44 finds doBar: method", function(done) {

        an.word("doBar")
        .at(26, 44)
        .find(function(err, type) {
            should.not.exist(err);

            // TODO It seems that java bytecode separates
            //  paths with '/', separates fields and methods
            //  with '.', and nested classes with '$'. 
            // Their methods, of course, can be differentiated
            //  from fields by having :(ARGS;)RETURN; vs fields
            //  which are simply :TYPE;

            // the main thing
            type.name.should.equal("net.dhleong.njast.Bar#doBar");
            type.type.should.equal(Ast.METHOD);

//             // well, we resolve this anyway,
//             //  so it doesn't hurt to keep it (?)
//             var biz = type.container;
//             biz.name.should.equal('biz');
//             biz.type.should.equal(Ast.METHOD_CALL);
//
//             var baz = biz.container;
//             baz.name.should.equal('baz');
//             baz.type.should.equal(Ast.METHOD_CALL);
//
//             var buz = baz.container;
//             buz.name.should.equal('buz');
//             buz.type.should.equal(Ast.METHOD_CALL);
//
//             var fancier = buz.container;
//             fancier.name.should.equal(
//                 'net.dhleong.njast.Foo$Fancy$Fancier');
//             fancier.type.should.equal(Ast.TYPE);

            // the real trick!
            var bar = type.owner;
            bar.name.should.equal('net.dhleong.njast.Bar');
            bar.type.should.equal(Ast.TYPE);

            done();
        });
    });

    it("68, 26: Foo.this. <- Fancy", function(done) {
        an.at(68, 26)
        .find(function(err, type) {
            should.not.exist(err);

            type.type.should.equal(Ast.TYPE);
            type.name.should.equal('net.dhleong.njast.Foo$Fancy');

            done();
        });
    });

    it("43, 40: Foo.this.field1. <- ", function(done) {
        an.at(43, 40)
        .find(function(err, resolved) {
            should.not.exist(err);

            resolved.name.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
            resolved.type.should.equal(Ast.TYPE);

            done();
        });
    });
});
