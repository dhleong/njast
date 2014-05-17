#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , chai = require('chai')
  , should = chai.should()
  , parseFile = require('../proper_ast').parseFile

  , PATH = 'FullAst.java'

  , buf, ast
  , fullast;


chai.use(function(_chai, utils) {
    /** 
     * For use on expressions, but can also be used on VarDefs
     * @param left Mixed; if object, key:value property assertions on the
     *          left side; if string, the `name` of var on left
     * @param type (optional, default:'=') Type of assignment
     * @param right Object of key:value property assertions on the right side
     * @param value (optional) If provided, shortcut to {right: {value: <value>}}
     *
     * ex: should.be.assignment({left: 'varName', type: '=', value: 42}) 
     */
    utils.addMethod(chai.Assertion.prototype, 'assignment', function(def) {
        var obj = utils.flag(this, 'object'); 
        if (def.value)
            def.right = {value: def.value};
        if (!def.type)
            def.type = '=';
            
        if (!def.left)
            throw Error("You must provide `left` argument to assignment()");
        if (utils.type(def.left) === 'string')
            def.left = {name: def.left};

        if (!def.right)
            throw Error("You must provide `right` argument to assignment()");

        if (~obj.constructor.name.indexOf('VarDef')) {
            var varDef = obj;
            if (obj.kids) {
                // LocalVarDef, or perhaps FieldDecl
                varDef = obj.kids[0];
            }

            Object.keys(def.left).forEach(function(prop) {
                if (prop != 'type' || typeof(varDef.type) == 'string') {
                    new chai.Assertion(varDef).to.have.property(prop)
                        .that.equals(def.left[prop]);
                } else {
                    new chai.Assertion(varDef).to.have.property(prop)
                        .with.property('name')
                            .that.equals(def.left[prop]);
                }
            });

            new chai.Assertion(def.type).to.equal('=');

            Object.keys(def.right).forEach(function(prop) {
                new chai.Assertion(varDef).to.have.property('initializer')
                    .with.deep.property(prop)
                        .that.equals(def.right[prop]);
            });
            return;
        }

        Object.keys(def.left).forEach(function(prop) {
            new chai.Assertion(obj).to.have.property('left')
                .with.property(prop)
                    .that.equals(def.left[prop]);
        });

        new chai.Assertion(obj).to.have.property('chain')
            .that.is.an('array').of.length(1)
                .with.deep.property('[0]')
                    .that.is.an('array').of.length(2)
                        .with.deep.property('[0]')
                            .that.equals(def.type);
                            
        var right = obj.chain[0][1];
        right._prev = right._root = right._tok = null;
        Object.keys(def.right).forEach(function(prop) {
            new chai.Assertion(right).to.have.deep.property(prop)
                .that.equals(def.right[prop]);
        });
    });

    // allow `.is.an('array').that.contains(...)`
    utils.addMethod(chai.Assertion.prototype, 'contains', function(item) {
        var obj = utils.flag(this, 'object');
        new chai.Assertion(obj).to.contain(item);
    });
});

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
                .that.contains({
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

        describe("handles ClassDeclarations: ", function() {

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
                // this is super yuck, but we should do it for completeness
                fullast.body.should.have.property('kids')
                    .with.deep.property('[0]')
                        .that.has.property('kids')
                            .that.is.an('array')
                            .with.length(1)
                            .and.has.deep.property('[0]')
                            .that.has.property('name')
                                .that.equals('field1');
                fullast.body.kids[0].should.have.property('type')
                    .that.has.property('name')
                        .that.equals('Imported');

                fullast.body.should.have.property('fields')
                    .that.is.an('array')
                        .with.deep.property('[0]')
                            .that.has.property('name')
                                .that.equals('field1');
            });

            it("Has private int singleInt", function() {
                var singleInt = fullast.body.fields[1];
                singleInt.should.have.property('type')
                    .that.has.property('name')
                        .that.equals('int');
                singleInt.should.have.property('name')
                    .that.equals('singleInt');
            });

            it("Has initialized field2", function() {
            
                var field2 = fullast.body.fields[2];
                field2.should.have.property('type')
                    .that.has.property('name')
                        .that.equals('Imported');
                field2.should.be.assignment({
                    left: 'field2',
                    right: {
                        'type.name': 'Imported'
                    }
                });
            });

            it("Has array field singleArray", function() {
            
                var field2 = fullast.body.fields[3];
                field2.should.have.property('type')
                    .that.has.property('name')
                        .that.equals('int');
                field2.type.should.have.property('array')
                    .that.equals(1);
            });

            it("Has static block", function() {
                fullast.body.should.have.property('blocks')
                    .that.is.an('array')
                        .with.deep.property('[0].mods.kids')
                            .that.contains('static');
                
                var block = fullast.body.blocks[0];
                block.kids[0].should.be.assignment({
                    left: 'field1',
                    right: {
                        'type.name': 'Imported'
                    }
                });
            });

            it("Has normal block", function() {
                fullast.body.should.have.property('blocks')
                    .that.is.an('array')
                        .and.not.has.deep.property('[1].mods.kids');
                
                var block = fullast.body.blocks[1];
                block.kids[0].should.be.assignment({
                    left: 'singleInt',
                    value: '42'
                });
            });

            it("Has simpleMethod", function() {
                fullast.body.should.have.property('methods')
                    .that.is.an('array')
                        .with.deep.property('[0]')
                            .that.has.property('name')
                                .that.equals('simpleMethod');
            });

            it("Has fluidMethod", function() {
                var fluidMethod = fullast.body.methods[1];
                should.exist(fluidMethod);
                fluidMethod.should.have.property('name')
                    .that.equals('fluidMethod');

                fluidMethod.should.have.property('params')
                    .with.deep.property('constructor.name')
                        .that.equals('FormalParameters');
                fluidMethod.params.kids.should.be.an('array')
                    .of.length(2);

                var params = fluidMethod.params.kids;
                params[0].should.have.property('name')
                    .that.equals('arg1');
                params[0].should.have.property('type')
                    .that.has.property('name')
                        .that.equals('int');
                params[1].should.have.property('name')
                    .that.equals('arg2');
                params[1].should.have.property('type')
                    .that.has.property('name')
                        .that.equals('int');

                fluidMethod.should.have.property('throws')
                    .that.is.an('array')
                        .of.length(1)
                        .with.deep.property('[0]')
                            .that.has.property('name')
                                .that.equals('Exception');
            });

            it("Has local variable declarations in fluidMethod", function() {
                
                var fluidMethod = fullast.body.methods[1];
                should.exist(fluidMethod);
                var statements = fluidMethod.body.kids;
                should.exist(statements);

                statements.should.be.an('array');
                statements.should.have.deep.property('[0]')
                    .that.has.property('kids')
                        .that.is.an('array')
                            .with.deep.property('[0]')
                                .that.has.property('name')
                                    .that.equals('local1');
                var local1 = statements[0].kids[0];
                local1.should.have.property('type')
                    .that.has.property('name')
                        .that.equals('int');

                var groups = statements[1];
                groups.should.have.property('kids')
                    .that.is.an('array').of.length(2)
                        .with.deep.property('[0]')
                            .that.has.property('name')
                                .that.equals('group1');
            });

            // TODO
            it("Has local classes in fluidMethod");
            it("Has a Label in fluidMethod");

            describe("Expressions:", function() {
                it("Simple assignment", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var assign = states[2];

                    should.exist(assign);

                    assign.should.be.assignment({
                        left: 'local1'
                      , right: {
                            name: 'arg2'
                        }
                    });
                });

                it("Literal assignment", function() {
                    
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var assign = states[3];

                    should.exist(assign);

                    assign.should.be.assignment({
                        left: 'arg1',
                        type: '+=',
                        value: '42'
                    });
                });

                it("Literal assignment in VarDef", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var string = states[4];
                    should.exist(string);
                    string.should.be.assignment({
                        left: {
                            type: 'String',
                            name: 'myString'
                        },
                        value: 'literal'
                    });

                    var chars = states[5];
                    chars.should.be.assignment({
                        left: {
                            type: 'char',
                            name: 'myChar',
                        },
                        value: 'a'
                    });
                });

                it("Method Invocation", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var method = states[6];
                    should.exist(method);

                    method.should.have.deep.property('constructor.name')
                        .that.equals('MethodInvocation');
                    method.should.have.property('name')
                        .that.equals('simpleMethod');
                });

                it("instanceof", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var iof = states[7];
                    should.exist(iof);

                    iof.should.be.assignment({
                        left: {
                            type: 'boolean',
                            name: 'test'
                        },
                        right: {
                            'constructor.name': 'InstanceOfExpression',
                            'left.name': 'field1',
                            'right.name': 'SomeInterface'
                        }
                    });
                });

                it("Assignment with infix op", function() {
                    
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var infix = states[8];
                    should.exist(infix);

                    infix.should.be.assignment({
                        left: 'group2',
                        right: {
                            'left.value': '4',
                            'chain[0][0]': '+',
                            'chain[0][1].name': 'arg2',
                        }
                    });
                });

                it("Assignment with Creator", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var assign = states[9];

                    should.exist(assign);

                    assign.should.be.assignment({
                        left: 'field2'
                      , right: {
                            'type.name': 'Imported'
                        }
                    });
                });

                it("Prefix expression", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var prefix = states[10];

                    should.exist(prefix);

                    prefix.should.have.property('op')
                        .that.equals('++');
                    prefix.should.have.property('expression')
                        .that.has.property('name')
                            .that.equals('group2');
                });

                it("Anonymous class in Creator", function() {
                    var fluid = fullast.body.methods[2];
                    var ret = fluid.body.kids[0];

                    should.exist(ret);
                    ret.should.have.property('value')
                        .with.deep.property('type.name')
                            .that.equals('SomeInterface');
                    ret.value.should.property('body')
                        .with.deep.property('constructor.name')
                            .that.equals('ClassBody');
                        
                });

                // TODO
                it("Chain assignment");
                it("Array declaration");
                it("Array initialization");
            });

            describe("Control Flow:", function() {
                it("if");
                it("assert");
                it("switch");
                it("while");
                it("do");
                it("for");
                it("break");
                it("continue");

                it("return", function() {
                    var fluid = fullast.body.methods[2];
                    var ret = fluid.body.kids[0];

                    should.exist(ret);
                    ret.should.have.property('value')
                        .with.deep.property('type.name')
                            .that.equals('SomeInterface');
                });

                it("throw");
                it("synchronized");
                it("try");
            });

            describe("Annotations", function() {

                it("Override", function() {
                    var overridable = fullast.body.methods[3];
                    should.exist(overridable);
                    overridable.should.have.deep.property('mods.kids[0]')
                        .that.has.property('name').that.equals('Override');
                });

                it("SuppressWarnings with ElementValuePairs", function() {
                    var overridable = fullast.body.methods[3];
                    overridable.should.have.deep.property('mods.kids[1]')
                        .that.has.property('name').that.equals('SuppressWarnings');

                    var sw = overridable.mods.kids[1];
                    sw.should.have.property('args')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0]')
                            .that.has.deep.property('constructor.name')
                                .that.equals('AnnotationElementValuePair');
                });

                it("SuppressWarnings with Array", function() {
                    var suppress = fullast.body.methods[4];
                    suppress.should.have.deep.property('mods.kids[0]')
                        .that.has.property('name').that.equals('SuppressWarnings');

                    var sw = suppress.mods.kids[0];
                    sw.should.have.property('args')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0]')
                            .that.has.deep.property('constructor.name')
                                .that.equals('AnnotationElementValueArray');
                });

                it("SuppressWarnings with value=Array", function() {
                    var suppress = fullast.body.methods[5];
                    suppress.should.have.deep.property('mods.kids[0]')
                        .that.has.property('name').that.equals('SuppressWarnings');

                    var sw = suppress.mods.kids[0];
                    sw.should.have.property('args')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0].value') // assumes ValuePair
                            .that.has.deep.property('constructor.name')
                                .that.equals('AnnotationElementValueArray');
                });
            });

            describe("Nested types:", function() {
                it("Class", function() {
                    fullast.body.should.have.property('subclasses')
                        .that.is.an('array')
                        .with.deep.property('[0].name')
                            .that.equals('NestedClass');
                    fullast.body.subclasses[0].should.have.property('qualifiedName')
                        .that.equals('net.dhleong.njast.FullAst$NestedClass');
                });

                it("Static Class", function() {
                    fullast.body.should.have.property('subclasses')
                        .that.is.an('array')
                        .with.deep.property('[1].name')
                            .that.equals('StaticNestedClass');
                    fullast.body.subclasses[1].should.have
                    .deep.property('mods.kids')
                        .that.is.an('array')
                        .and.contains('static');
                    fullast.body.subclasses[1].should.have.property('qualifiedName')
                        .that.equals('net.dhleong.njast.FullAst$StaticNestedClass');
                });
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
