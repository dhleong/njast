#!/usr/bin/env mocha 

var ClassLoader = require('../classloader')
  , Ast = require('../ast')
  , extractPackage = ClassLoader.extractPackage

  , should = require('chai').should();

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

    it("suggests NotImport", function() {
        loader.suggestImport('NotImported', function(err, suggestions) {
            should.not.exist(err);

            suggestions.should.be.an('array').of.length(2)
                .and.contain('net.dhleong.njast.subpackage.NotImported')
                .and.contain('net.dhleong.njast.subpackage2.NotImported');

        });
    });
});

describe("SourceClassLoader", function() {
    
    it("caches types", function(done) {
        var sourceLoader = loader._loaders[0];
        sourceLoader.walkTypes(function() {}, function(err) {
            should.not.exist(err);

            should.exist(sourceLoader._fileToTypes);

            var foo = sourceLoader._fileToTypes['./Foo.java'];
            should.exist(foo);
            foo.should.contain('net.dhleong.njast.Foo$Fancy$Fancier');
            sourceLoader._allCachedTypes
                .should.contain('net.dhleong.njast.Foo$Fancy$Fancier');

            done();
        });
    });

    it("updates cached types on put", function() {
        var sourceLoader = loader._loaders[0];
        should.exist(sourceLoader._fileToTypes);

        // delete all but main class, and and something new
        sourceLoader.putCache('./Foo.java', {
            qualifieds: {
                'net.dhleong.njast.Foo': true
              , 'net.dhleong.njast.Foo$Unexpected': true
            }
        });

        var foo = sourceLoader._fileToTypes['./Foo.java'];
        should.exist(foo)
        foo.should.not.contain('net.dhleong.njast.Foo$Fancy');
        foo.should.not.contain('net.dhleong.njast.Foo$Fancy$Fancier');
        foo.should.contain('net.dhleong.njast.Foo');
        foo.should.contain('net.dhleong.njast.Foo$Unexpected');

        sourceLoader._allCachedTypes
            .should.not.contain('net.dhleong.njast.Foo$Fancy');
        sourceLoader._allCachedTypes
            .should.not.contain('net.dhleong.njast.Foo$Fancy$Fancier');
        sourceLoader._allCachedTypes
            .should.contain('net.dhleong.njast.Foo$Unexpected');

    });
});

describe("ProxyClassLoader", function() {
    it("reads project.properties", function(done) {
        ClassLoader.fromSource('./fakeProject/src/com/fakeproject/FakeProject.java')
        .then(function(loader) {

            loader._loaders.should.be.an('array')
                .of.length(3);
            loader._loaders[0].should.have.property('_root')
                .that.equals('fakeProject');
            // loader[1] is now the core java classes loader
            loader._loaders[2].should.have.property('_root')
                .that.match(/fakeProject\/third-party\/dependency$/);
            done();
        });
    });
});

describe("extractPackage handles", function() {
    it("normal class", function() {
        extractPackage('java.util.HashMap').should.equal('java.util');
    });
    it("inner class", function() {
        extractPackage('java.util.Map$Entry').should.equal('java.util');
    });
});
describe("JarClassLoader", function() {
    var jloader;
    before(function() {
        // wackiness so we actually get our assertions
        jloader = loader._loaders[1];
        return loader.promise();
    });

    it("is included for core", function() {
        loader._loaders.should.be.an('array')
            .of.length(2);

        should.exist(jloader);
        jloader.should.have.deep.property('constructor.name')
            .that.equals('JarClassLoader');
    });

    it("finds HashMap", function(done) {
        jloader.openClass("java.util.HashMap", function(err) {
            should.not.exist(err);

            done();
        });
    });

    it("projects HashMap", function(done) {
        jloader.openClass("java.util.HashMap", ['fields', 'methods'], function(err, projection) {
            should.not.exist(err);

            projection.should.have.property('methods')
                .that.is.an('array')
                .with.deep.property('[0].name')
                    .that.equals('size');

            done();
        });
    });

    it("projects ArrayList", function(done) {
        jloader.openClass("java.util.ArrayList", ['fields', 'methods'], function(err, projection) {
            should.not.exist(err);

            projection.should.have.property('methods')
                .that.is.an('array')
                .with.deep.property('[0].name')
                    .that.equals('trimToSize');

            done();
        });
    });


    it("projects String", function(done) {
        jloader.openClass("java.lang.String", ['fields', 'methods'], function(err, projection) {
            should.not.exist(err);

            projection.should.have.property('methods')
                .that.is.an('array')
                .with.deep.property('[0].name')
                    .that.equals('length');

            done();
        });
    });
});
