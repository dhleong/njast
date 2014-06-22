#!/usr/bin/env mocha 
//--reporter nyan

var fs = require('fs')
  , chai = require('chai')
  , should = chai.should()
  , Ast = require('../ast')  
  , parseFile = Ast.parseFile

  , PATH = 'FullAst.java'

  , buf, ast, loader
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
                .with.deep.property(prop)
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

describe("Ast of FullAst.java", function() {
    before(function(done) {
        fs.readFile(PATH, function(err, b) {

            buf = b;
            parseFile(PATH, b, function(err, _ast) {
                if (err)
                    throw err;

                ast = _ast;

                if (ast.toplevel) {
                    fullast = ast.toplevel[0];
                }

                done();
            });
        });
    });

    describe("successfully", function() {
        
        it("is in the right package", function() {
            ast.getPackage().should.equal('net.dhleong.njast');
        });

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

        it("handles import.*", function() {
            ast.should.deep.property('_root.imports')
                .that.is.an('array')
                .that.contains({
                    static: false, 
                    star: true,
                    path: 'net.dhleong.njast.subpackage2'
                });
        });

        it("handles static import", function() {
            ast.should.deep.property('_root.imports')
                .that.is.an('array')
                .that.contains({
                    static: true, 
                    star: false,
                    path: 'net.dhleong.njast.subpackage.Extended.createExtended'
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

            it("Has TypeParameters", function() {
                fullast.should.have.property('typeParams')
                    .with.deep.property('kids[0].name')
                        .that.equals('E');
                fullast.should.have.deep.property('typeParams.kids[1].name')
                    .that.equals('T');
            });

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
                field2.should.be.assignment({
                    left: 'singleArray',
                    right: {
                        '[0].value': '1'
                      , '[1].value': '2'
                      , '[2].value': '3'
                    }
                });
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

            it("Has local classes", function() {
                ast.qualifieds.should.contain
                    .key('net.dhleong.njast.FullAst$1LocalClass');
                ast.qualifieds.should.contain
                    .key('net.dhleong.njast.FullAst$2LocalClass');
            });

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

                it("Array initialization", function() {
                    
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var array1 = states[12];
                    var array2 = states[13];
                    var array3 = states[14];
                    var array4 = states[15];
                    var array5 = states[16];

                    array1.should.be.assignment({
                        left: 'array1',
                        right: {
                            'type.name': 'int'
                          , 'array': 1
                          , 'arraySizes[0].value': '1'
                        }
                    });

                    array2.should.be.assignment({
                        left: 'array2',
                        right: {
                            // array literal
                            'constructor.name': 'Array'
                          , '[0].value': '2'
                          , '[1].value': '3'
                        }
                    });
                    
                    array3.should.be.assignment({
                        left: 'array3',
                        right: {
                            'type.name': 'int'
                          , 'array': 1
                          , 'initializer[0].value': '4'
                          , 'initializer[1].value': '5'
                          , 'initializer[2].value': '6'
                        }
                    });

                    array4.should.be.assignment({
                        left: 'array4',
                        right: {
                            // array[][] literal
                            'constructor.name': 'Array'
                          , '[0][0].value': '7'
                          , '[0][1].value': '8'
                          , '[1][0].value': '9'
                          , '[1][1].value': '10'
                        }
                    });
                    
                    array5.should.be.assignment({
                        left: 'array5',
                        right: {
                            'type.name': 'int'
                          , 'array': 3
                          , 'arraySizes[0].value': '11'
                          , 'arraySizes[1].value': '12'
                        }
                    });

                });

                it("this ref", function() {
                    var nested = fullast.body.subclasses[0];
                    nested.name.should.equal('NestedClass');
                    var ncMethod = nested.body.methods[0];
                    ncMethod.name.should.equal('ncMethod');

                    ncMethod.body.kids.should.be.an('array').of.length(1);
                    var ref = ncMethod.body.kids[0]
                    should.exist(ref);

                    ref.should.have.property('left')
                        .with.property('name')
                            .that.equals('this');
                    ref.should.have.property('chain')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0].constructor.name')
                            .that.equals('MethodInvocation');
                });
            
                it("Other.this ref", function() {
                    var nested = fullast.body.subclasses[0];
                    nested.name.should.equal('NestedClass');
                    var outerClassMethod = nested.body.methods[1];
                    outerClassMethod.name.should.equal('outerClassMethod');
                    
                    var ref = outerClassMethod.body.kids[0]
                    should.exist(ref);
                    ref.should.have.property('left')
                        .with.property('name')
                            .that.equals('FullAst');
                    ref.should.have.property('chain')
                        .that.is.an('array')// .of.length(2)
                        .with.deep.property('[0].name')
                            .that.equals('this');

                    ref.should.have.deep.property('chain[1].constructor.name')
                        .that.equals('MethodInvocation');
                    ref.should.have.deep.property('chain[1].name')
                        .that.equals('simpleMethod');
                });

                it("Generic type ref (TypeArguments) + diamond", function() {
                    var generic = ast.qualifieds[
                        'net.dhleong.njast.FullAst#generic'
                    ];
                    should.exist(generic);

                    generic.should.have.deep.property('body.kids[0].type.simpleName')
                        .that.equals('NestedClass');
                    var def = generic.body.kids[0];
                    var type = def.type;
                    type.should.have.deep.property('namePath[0][0]')
                        .that.equals('FullAst');
                    type.should.have.deep.property('namePath[1][0]')
                        .that.equals('NestedClass');
                    type.should.have.deep.property('namePath[0][1].isDiamond')
                        .that.equals(false);

                    def.should.be.assignment({
                        left: 'object',
                        right: {
                            // [0][1] doesn't compile, even though
                            // the spec says it's valid....
                            'type.namePath[1][1].isDiamond': true
                        }
                    });
                });

                it('Instantiate generic outer class', function() {
                    var nested = fullast.body.subclasses[0];
                    nested.name.should.equal('NestedClass');
                    var outerClassMethod = nested.body.methods[1];
                    outerClassMethod.name.should.equal('outerClassMethod');
                    
                    var ref = outerClassMethod.body.kids[1]
                    should.exist(ref);
                    ref.should.have.property('left')
                        .with.property('name')
                            .that.equals('FullAst');
                    ref.should.have.property('chain')
                        .that.is.an('array')// .of.length(2)
                        .with.deep.property('[0].name')
                            .that.equals('this');

                    ref.should.have.deep.property('chain[1].constructor.name')
                        .that.equals('Creator');
                    ref.should.have.deep.property('chain[1].type.name')
                        .that.equals('FullAst');
                    ref.should.have.deep.property('chain[1].type.typeArgs.isDiamond')
                        .that.equals(true);
                    ref.should.have.deep.property('chain[1].typeArgs.kids[0].name')
                        .that.equals('Imported');
                });

                it("Cast", function() {
                    var method = ast.qualifieds['net.dhleong.njast.FullAst#cast'];
                    should.exist(method);

                    var castAssign = method.body.kids[0];
                    should.exist(castAssign);
                    castAssign.should.be.assignment({
                        left: 'cast',
                        right: {
                            'left.name': 'FullAst'
                          , 'right.name': 'arg'
                        }
                    });
                });

                it("Cast and invoke", function() {
                    var method = ast.qualifieds['net.dhleong.njast.FullAst#cast'];
                    should.exist(method);

                    method.body.kids.should.be.an('array').of.length(3);
                    var stmt = method.body.kids[1];
                    should.exist(stmt);
                    stmt.should.have.deep.property('constructor.name')
                        .that.equals('SelectorExpression');
                    stmt.should.have.deep.property('left.left.name')
                        .that.equals('FullAst');
                    stmt.should.have.deep.property('left.right.name')
                        .that.equals('arg');
                    stmt.should.have.deep.property('chain[0].name')
                        .that.equals('generic');
                });
            
                it("Crazy Cast and invoke", function() {
                    var method = ast.qualifieds['net.dhleong.njast.FullAst#cast'];
                    should.exist(method);

                    method.body.kids.should.be.an('array').of.length(3);
                    var stmt = method.body.kids[2];
                    should.exist(stmt);
                    stmt.should.have.deep.property('constructor.name')
                        .that.equals('SelectorExpression');
                    stmt.should.have.deep.property('left.left.name')
                        .that.equals('FullInterface');
                    stmt.should.have.deep.property('chain[0].name')
                        .that.equals('interfaceMethod');
                });

                it("Generic cast", function() {
                    var method = ast.qualifieds['net.dhleong.njast.FullAst#genericCast'];
                    should.exist(method);

                    method.body.kids.should.be.an('array').of.length(1)
                    .with.deep.property('[0]')
                        .that.is.assignment({
                            left: 'actual',
                            right: {
                                'chain[0].name': 'cast'
                            }
                        });
                });

                it("instanceof &&");

                it("Array access", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var arrayAccess = states[17];
                    arrayAccess.should.be.assignment({
                        left: 'group2',
                        right: {
                            'left.constructor.name': 'SelectorExpression'
                          , 'left.left.name': 'array4' 
                          , 'left.chain.length': 2
                          , 'left.chain[0].constructor.name': 'ArrayAccessExpression' 
                          , 'left.chain[0].value.value': '0'
                          , 'left.chain[1].constructor.name': 'ArrayAccessExpression' 
                          , 'left.chain[1].value.value': '1'
                        }
                    });
                });

                it("Fancy array assignment", function() {
                    var method = ast
                        .qualifieds['net.dhleong.njast.FullAst#moreTests'];
                    var states = method.body.kids;
                    var array = states[0];
                    array.should.be.assignment({
                        left: {
                            // selector expression, so...
                            'left.name': 'singleArray'
                        }
                      , value: '0'
                    });
                });

                // It's in the spec, but doesn't compile. Just use Selector
                // it("Explicit Generic Invocation (from Primary)");

                it("Explicit Generic Invocation (from Selector)", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;
                    var genericInvoke = states[18];
                    genericInvoke.should.have.deep.property('left.name')
                        .that.equals('this');
                    genericInvoke.should.have.deep.property('chain[0].typeArgs')

                    var invocation = genericInvoke.chain[0];
                    invocation.should.have.deep.property('typeArgs.kids[0].name')
                        .that.equals('Imported');
                    invocation.should.have.deep.property('name')
                        .that.equals('generic');
                });

                it("Class literals", function() {
                    var fluid = fullast.body.methods[1];
                    var states = fluid.body.kids;

                    states[19].should.be.assignment({
                        left: 'myClass',
                        right: {
                            'constructor.name': 'SelectorExpression'
                          , 'left.name': 'FullAst'
                          , 'chain[0].name': 'class'
                        }
                    });

                    states[20].should.be.assignment({
                        left: 'arrayClass',
                        right: {
                            'constructor.name': 'SelectorExpression'
                          , 'left.name': 'int'
                          , 'left.constructor.name': 'BasicType'
                          , 'left.array': 2
                          , 'chain[0].name': 'class'
                        }
                    });

                    states[21].should.be.assignment({
                        left: 'objectArrayClass',
                        right: {
                            'constructor.name': 'SelectorExpression'
                          , 'left.name': 'FullAst'
                          , 'left.constructor.name': 'ReferenceType'
                          , 'left.array': 2
                          , 'chain[0].name': 'class'
                        }
                    });

                    states[22].should.be.assignment({
                        left: 'voidClass',
                        right: {
                            'constructor.name': 'SelectorExpression'
                          , 'left.name': 'void'
                          , 'chain[0].name': 'class'
                        }
                    });
                });

                it("Chain assignment", function() {
                    var method = ast.qualifieds[
                        'net.dhleong.njast.FullAst#overridable'
                    ];
                    method.body.kids[0].should.be.assignment({
                        left: 'field1',
                        right: {
                            'left.constructor.name': 'MethodInvocation'
                          , 'left.name': 'fluidMethod'
                          , 'chain[0].constructor.name': 'MethodInvocation'
                          , 'chain[0].name': 'getImported'
                        }
                    });
                });

                it("Fancy ternary", function() {
                    var method = ast.qualifieds[
                        'net.dhleong.njast.FullAst#fancyTernary'
                    ];
                    method.body.kids[0].should.be.assignment({
                        left: 'contentTypeRaw',
                        right: {
                            'constructor.name': 'TernaryExpression'
                        }
                    });
                });

                it("Paren With Infix", function() {
                    var method = ast.qualifieds[
                        'net.dhleong.njast.FullAst#moreTests'
                    ];
                    method.body.kids[1].should.be.assignment({
                        left: 'canScrollDown',
                        right: {
                            'constructor.name': 'Expression',
                            'chain[0][0]': '<'
                        }
                    });
                });
            });

            describe("Control Flow:", function() {
                it('if', function() {

                    var controls = fullast.body.methods[6];
                    var ifStatement = controls.body.kids[0];
                    should.exist(ifStatement);
                    ifStatement.should.have.property('condition');
                    ifStatement.should.have.property('trueStatement')
                        .that.has.deep.property('constructor.name')
                            .that.equals('Block');
                    ifStatement.should.have.property('falseStatement')
                        .that.has.deep.property('constructor.name')
                            .that.equals('IfStatement');
                    ifStatement.falseStatement.should.have.property('condition');
                });

                it('assert', function() {
                    var controls = fullast.body.methods[6];
                    var ifStatement = controls.body.kids[0];
                    should.exist(ifStatement);
                    ifStatement.trueStatement.should.have.deep.property('kids[0]')
                        .with.deep.property('constructor.name')
                            .that.equals('AssertStatement');
                    ifStatement.falseStatement.should.have // else if
                    .deep.property('trueStatement.kids[0]')
                        .with.deep.property('constructor.name')
                            .that.equals('AssertStatement');
                });

                it('switch', function() {
                    var controls = fullast.body.methods[6];
                    var switchStatement = controls.body.kids[1];
                    switchStatement.should.have.deep.property('constructor.name')
                        .that.equals('SwitchStatement');

                    switchStatement.should.have.property('condition');
                    switchStatement.should.have.property('kids')
                        .that.is.an('array').of.length(2)
                        .with.deep.property('[1].labels')
                            .that.contains('default');

                    var enumSwitch = controls.body.kids[3];
                    enumSwitch.should.have.deep.property('constructor.name')
                        .that.equals('SwitchStatement');

                    enumSwitch.should.have.property('condition');
                    enumSwitch.should.have.property('kids')
                        .that.is.an('array').of.length(2)
                        .with.deep.property('[0].labels[0].name')
                            .that.equals('VAL1');
                });

                it('while', function() {
                    var controls = fullast.body.methods[6];
                    var whileStatement = controls.body.kids[9];
                    should.exist(whileStatement);
                    whileStatement.should.have.deep.property('constructor.name')
                        .that.equals('WhileStatement');
                    whileStatement.should.have.property('condition');
                    whileStatement.should.have.property('body');
                });
                it('do', function() {
                    var controls = fullast.body.methods[6];
                    // [10] is a label before us
                    var doStatement = controls.body.kids[11];
                    should.exist(doStatement);
                    doStatement.should.have.deep.property('constructor.name')
                        .that.equals('WhileStatement');
                    doStatement.should.have.property('condition');
                    doStatement.should.have.property('body');
                    doStatement.should.have.property('isDo')
                        .that.equals(true);
                });

                it('for', function() {
                    
                    var controls = fullast.body.methods[6];
                    var classicFor = controls.body.kids[4];
                    classicFor.should.have.deep.property('constructor.name')
                        .that.equals('ForStatement');
                    classicFor.should.have.property('control')
                        .with.deep.property('constructor.name')
                            .that.equals('ClassicForControl');

                    var enhancedFor = controls.body.kids[5];
                    enhancedFor.should.have.deep.property('constructor.name')
                        .that.equals('ForStatement');
                    enhancedFor.should.have.property('control')
                        .with.deep.property('constructor.name')
                            .that.equals('EnhancedForControl');

                    var emptyFor = controls.body.kids[6];
                    emptyFor.should.have.deep.property('constructor.name')
                        .that.equals('ForStatement');
                    emptyFor.should.have.property('control')
                        .with.deep.property('constructor.name')
                            .that.equals('ClassicForControl');

                    // [7] is an init
                    var weirdFor = controls.body.kids[8];
                    weirdFor.should.have.deep.property('constructor.name')
                        .that.equals('ForStatement');
                    weirdFor.should.have.property('control')
                        .with.deep.property('constructor.name')
                            .that.equals('ClassicForControl');
                });

                it('break', function() {
                    // NB parsing tested in "for" above
                });

                it('continue', function() {
                    // NB parsing tested in "do" above
                });

                it('return', function() {
                    var fluid = fullast.body.methods[2];
                    var ret = fluid.body.kids[0];

                    should.exist(ret);
                    ret.should.have.property('value')
                        .with.deep.property('type.name')
                            .that.equals('SomeInterface');
                });

                it('throw', function() {
                    var controls = fullast.body.methods[6];
                    var ifThrow = controls.body.kids[12];
                    ifThrow.should.have.deep.property('constructor.name')
                        .that.equals('IfStatement');
                    ifThrow.should.have.deep.property('trueStatement.constructor.name')
                        .that.equals('ThrowStatement');

                    var throwStatement = ifThrow.trueStatement;
                    throwStatement.should.have.property('body');
                });

                it('synchronized', function() {
                    var controls = fullast.body.methods[6];
                    var synchronized = controls.body.kids[13];
                    synchronized.should.have.deep.property('constructor.name')
                        .that.equals('SynchronizedStatement');
                    synchronized.should.have.property('condition');
                    synchronized.should.have.property('body');
                });

                it('try-finally', function() {
                    var controls = fullast.body.methods[6];
                    var tryFinally = controls.body.kids[14];
                    tryFinally.should.have.deep.property('constructor.name')
                        .that.equals('TryStatement');
                    tryFinally.should.not.have.property('resources');
                    tryFinally.should.not.have.property('catches');
                    tryFinally.should.have.property('finallyBlock');
                });

                it('try-catch', function() {
                    var controls = fullast.body.methods[6];
                    var tryCatch = controls.body.kids[15];
                    tryCatch.should.have.deep.property('constructor.name')
                        .that.equals('TryStatement');
                    tryCatch.should.not.have.property('resources');
                    tryCatch.should.not.have.property('finallyBlock');
                    tryCatch.should.have.property('catches')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0].types')
                            .that.contains('Exception');
                });

                it('try-catch-finally', function() {
                    var controls = fullast.body.methods[6];
                    var tryCatchFinally = controls.body.kids[16];
                    tryCatchFinally.should.have.deep.property('constructor.name')
                        .that.equals('TryStatement');
                    tryCatchFinally.should.not.have.property('resources');
                    tryCatchFinally.should.have.property('finallyBlock');
                    tryCatchFinally.should.have.property('catches')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0].types')
                            .that.contains('Exception');
                });

                it('try with multi-catch', function() {
                    var controls = fullast.body.methods[6];
                    var multiCatch = controls.body.kids[17];
                    multiCatch.should.have.deep.property('constructor.name')
                        .that.equals('TryStatement');
                    multiCatch.should.not.have.property('resources');
                    multiCatch.should.not.have.property('finallyBlock');
                    multiCatch.should.have.property('catches')
                        .that.is.an('array').of.length(1)
                        .with.deep.property('[0].types')
                            .that.contains('RuntimeException');
                    multiCatch.catches[0].types.should.contain('IOException');
                });

                it('try with resources', function() {
                    
                    var controls = fullast.body.methods[6];
                    var withRes = controls.body.kids[18];
                    withRes.should.have.deep.property('constructor.name')
                        .that.equals('TryStatement');
                    withRes.should.not.have.property('finallyBlock');
                    withRes.should.not.have.property('catches');
                    withRes.should.have.property('resources')
                        .that.is.an('array').of.length(1)
                        .and.has.deep.property('[0]').that.is.assignment({
                            left: 'in',
                            right: {
                                'left.name': 'field2'
                            }
                        });
                });
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

        it("has SomeInterface", function() {
            ast.qualifieds.should.contain.key('net.dhleong.njast.SomeInterface');
            ast.should.have.property('toplevel')
                .that.is.an('array')
                .with.deep.property('[1]')
                    .that.has.property('qualifiedName')
                        .that.equals('net.dhleong.njast.SomeInterface');
        });

        it("has SomeEnum", function() {
            ast.qualifieds.should.contain.key('net.dhleong.njast.SomeEnum');
            var someEnum = ast.qualifieds['net.dhleong.njast.SomeEnum'];
            someEnum.should.have.property('body')
                .that.has.property('constants')
                    .that.is.an('array').of.length(3)
                    .with.deep.property('[0].name')
                        .that.equals('VAL1');
        });

        it("has SomeAnnotation", function() {
            ast.qualifieds.should.contain.key('net.dhleong.njast.SomeAnnotation');
            var annot = ast.qualifieds['net.dhleong.njast.SomeAnnotation'];
            should.exist(annot);

            ast.qualifieds.should.contain.key('net.dhleong.njast.SomeAnnotation#array');
        });

        it("has FullAst#constructor()", function() {
            fullast.should.have.deep.property('body.constructors[0].params.kids')
                .that.is.empty;

            var stmt = fullast.body.constructors[0].body.kids[0];
            should.exist(stmt);

            stmt.should.have.deep.property('constructor.name')
                .that.equals('MethodInvocation');
            stmt.name.should.equal('this');
        });

        it("has FullAst#constructor(int)", function() {
            fullast.should.have.deep.property('body.constructors[1].params.kids')
                .that.is.an('array').of.length(1);
        });

        it("has <Y> FullAst#constructor(Y)", function() {
            fullast.should.have.deep.property('body.constructors[2].params.kids')
                .that.is.an('array').of.length(1);

            var ctor = fullast.body.constructors[2];
            ctor.should.have.property('typeParams')
                .with.deep.property('kids[0].name')
                    .that.equals('Y');
        });

        describe('has javadoc on', function() {
            it("FullAst class", function() {
                var klass = ast.qualifieds['net.dhleong.njast.FullAst'];
                klass.should.have.property('javadoc')
                    .that.equals(
                        "/**\n" +
                        " * Javadoc for FullAst class\n" +
                        " */"
                    );
            });

            it("static Imported field1", function() {
                var field = ast.qualifieds['net.dhleong.njast.FullAst#field1'];
                field.should.have.property('javadoc')
                    .that.equals("/** Static, but not a block! */");
            });

            it("simpleMethod", function() {
                var method = ast.qualifieds['net.dhleong.njast.FullAst#simpleMethod'];
                method.should.have.property('javadoc')
                    .that.equals("/** simple method that needs nothing "
                               + "and does nothing */");
            });
        });
    });

    /**
     * Test drilling down into a node by position
     */
    describe("locates at", function() {
        it("43, 23: int group2", function() {
            var node = ast.locate(43, 23);
            should.exist(node);
            node.should.have.property('name')
                .that.equals('group2');
            node.should.have.deep.property('type.name')
                .that.equals('int');
        });

        it("71, 34: field1", function() {
            var node = ast.locate(71, 34);
            should.exist(node);
            node.should.have.property('name')
                .that.equals('field1');
            // just an identifier
            node.should.not.have.property('type');
        });

        it("206, 32: FullAst (cast)", function() {
            var node = ast.locate(206, 32);
            should.exist(node);
            node.should.have.property('name')
                .that.equals('FullAst');
            // just an identifier
            node.should.not.have.property('type');
        });

        it("206, 73: interfaceMethod invocation", function() {
            var node = ast.locate(206, 73);
            should.exist(node);
            node.should.have.deep.property('constructor.name')
                .that.equals('MethodInvocation');
            node.should.have.property('name')
                .that.equals('interfaceMethod');
        });
    });

    describe("evaluates type at", function() {
        before(function(done) {
            loader = require('../classloader').fromSource('FullAst.java');

            // force the right base dir (I know, this is crap)
            loader.openClass('net.dhleong.njast.FullAst', done);
        });

        // NB we're calling a method declared in the superclass (Extended)
        //  of the type we're using it from (Imported)
        it("248, 16 -> Extended", function(done) {
            ast.locate(248, 16)
            .evaluateType(loader, function(err, resolved) {
                if (err) throw err;
                resolved.type.should.equal('net.dhleong.njast.subpackage.Extended');
                done();
            });
        });

        it("183, 31: SomeAnnotation.MAGIC -> int");
    });

    describe("resolves declaring type at", function() {
        before(function(done) {
            loader = require('../classloader').fromSource('FullAst.java');
            // force the right base dir (I know, this is crap)
            loader.openClass('net.dhleong.njast.FullAst', done);
        });

        it("120, 13: FullAst (it's overridden!)", function(done) {
            ast.locate(120, 13)
            .resolveDeclaringType(loader, function(err, type) {
                if (err) throw err;
                type.should.equal('net.dhleong.njast.FullAst');
                done();
            });
        });

        it("176, 15: FullBase (super.)", function(done) {
            ast.locate(176, 15)
            .resolveDeclaringType(loader, function(err, type) {
                if (err) throw err;
                type.should.equal('net.dhleong.njast.subpackage.FullBase');
                done();
            });
        });

        it("183, 31: SomeAnnotation (constant)", function(done) {
            ast.locate(183, 31)
            .resolveDeclaringType(loader, function(err, type) {
                if (err) throw err;
                type.should.equal('net.dhleong.njast.SomeAnnotation');
                done();
            });
        });

        it("203, 22: FullAst (instance var)", function(done) {
            ast.locate(203, 22)
            .resolveDeclaringType(loader, function(err, type) {
                if (err) throw err;
                type.should.equal('net.dhleong.njast.FullAst');
                done();
            });
        });

        it("206, 59: FullInterface (cast)");

        it("248, 16: Extended", function(done) {
            ast.locate(248, 16)
            .resolveDeclaringType(loader, function(err, type) {
                if (err) throw err;
                type.should.equal('net.dhleong.njast.subpackage.Extended');
                done();
            });
        });

        it("249, 18: static method");
    });
});

describe("Ast of Foo.java", function() {
    before(function(done) {
        ast = null;
        loader = require('../classloader').fromSource('Foo.java');

        Ast.readFile('Foo.java', {
            strict: false
        }, function(err, _ast) {
            if (err) {
                // should.not.exist(err);
                throw err;
            }

            ast = _ast;
            done();
        });
    });

    // relaxed parsing!
    it("parses", function() {
        should.exist(ast);
    });

    it("finds at 21, 31: int out", function() {
        var node = ast.locate(21, 31);
        should.exist(node);
        node.should.have.property('name')
            .that.equals('out');
        // just an identifier
        node.should.have.property('type')
            .with.property('name')
                .that.equals('int');
    });

    it("finds at 53, 25: other", function() {
        var node = ast.locate(53, 25);
        should.exist(node);
        node.should.have.property('name')
            .that.equals('other');
        // just an identifier
        node.should.not.have.property('type');
    });

    describe("evaluates type at", function() {

        it("21, 31: int", function(done) {
            ast.locate(21, 31)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('int');
                value.from.should.equal(Ast.FROM_OBJECT);

                done();
            });
        });

        it("7, 18: Fancier", function(done) {
            var node = ast.locate(7, 18)
            node.evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);

                done();
            });
        });

        it("53, 25: Fancier", function(done) {
            ast.locate(53, 25)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("58, 17: Fancier", function(done) {
            ast.locate(58, 17)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("68, 21: Fancy.", function(done) {
            ast.locate(68, 21)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy');
                value.from.should.equal(Ast.FROM_TYPE);
                done();
            });
        });

        it("68, 26: Fancy.this.", function(done) {
            ast.locate(68, 26)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });


        it("79, 9: this.", function(done) {
            ast.locate(79, 9)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("43, 38: Foo.this.field1.", function(done) {
            ast.locate(43, 38)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("27, 43: arg3: Boring", function(done) {
            ast.locate(27, 43)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Boring');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("27, 48: doFancier -> Fancy", function(done) {
            ast.locate(27, 48)
            .evaluateType(loader, function(err, value) {
                should.not.exist(err);
                value.type.should.equal('net.dhleong.njast.Foo$Fancy');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("23, 11: Fanciest", function(done) {
            ast.locate(23, 11)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Boring$Fanciest');
                value.from.should.equal(Ast.FROM_TYPE);
                done();
            });
        });

        it("26, 26: buz -> Foo", function(done) {
            ast.locate(26, 26)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("26, 30: buz() -> Foo", function(done) {
            ast.locate(26, 30)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("83, 12: baz() -> Fancy", function(done) {
            ast.locate(83, 12)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo$Fancy');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("26, 44: doBar -> Boring", function(done) {
            ast.locate(26, 44)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Boring');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("87, 20: (superclass method) -> Extended", function(done) {
            ast.locate(87, 20)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.subpackage.Extended');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("identifier chains", function(done) {
            ast.locate(93, 18)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("short daisy chain", function(done) {
            ast.locate(93, 29)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("medium daisy chain", function(done) {
            ast.locate(93, 36)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo$Fancy$Fancier');
                value.from.should.equal(Ast.FROM_OBJECT);
                done();
            });
        });

        it("long daisy chain", function(done) {
            var node = ast.locate(93, 44);
            node.evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo$Fancy');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("94, 32: static method", function(done) {
            var node = ast.locate(94, 32);
            node.evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Boring$Normal');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("95, 25: import static -> Fanciest", function(done) {
            var node = ast.locate(95, 25);
            node.evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Boring$Fanciest');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("96, 14: static factory -> Fanciest", function(done) {
            ast.locate(96, 14)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Boring$Fanciest');
                value.from.should.equal(Ast.FROM_METHOD);
                done();
            });
        });

        it("12, 0: Foo (type context)", function(done) {
            ast.locate(12, 0)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_BODY);
                done();
            });
        }); 

        it("101, 12: Foo (anon type context)", function(done) {
            ast.locate(101, 12)
            .evaluateType(loader, function(err, value) {
                if (err) throw err;
                value.type.should.equal('net.dhleong.njast.Foo');
                value.from.should.equal(Ast.FROM_ANON);
                done();
            });
        }); 

        it("overloaded methods?"); // Will need to specify args & fallback if missing
    });
});

describe("MinusUser.java", function() {
    it.only("test", function(done) {
        // var path = '/Users/dhleong/git/ape-minus/src/main/java/com/minus/ape/MinusUser.java';
        // var path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/ui/EmojiHelper.java';
        // var path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/fragments/MessageThreadListFragment.java';
        var path = '/lib/android-sdk/sources/android-19/android/text/style/LineHeightSpan.java';
        fs.readFile(path, function(err, buf) {
            if (err) throw err;
            console.log("parsing!");
            parseFile(path, buf, {
                strict: false
              , debug: true
            }, function(err, ast) {
                if (err) throw err;
                console.log("PARSED!");
                var node = ast.locate(196, 9);
                should.exist(node);
                done();
            });
        });
    });
});
