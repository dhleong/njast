
var fs = require('fs')
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

module.exports = {

    setUp: function(callback) {
        
        fs.readFile(PATH, function(err, buf) {

            an = Analyzer.of(PATH, buf);
            callback();
        });

    },

    out: function(test) {
        
        an.word("out")
        .at(21, 31)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "int");
            test.equals(type.type, Ast.VARIABLE);

            test.done();
        });
    },

    arg3: function(test) {
        
        an.word("arg3")
        .at(27, 43)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "net.dhleong.njast.Boring");
            test.equals(type.type, Ast.VARIABLE);

            test.done();
        });
    },

    prepare: function(test) {
        an.word("prepare")
        .at(23, 28)
        .find(function(err, type) {
            test.ifError(err);

            if (!err) {
                test.equals(type.name, "prepare");
                test.equals(type.type, Ast.METHOD);

                var fanciest = type.container;
                test.equals(fanciest.name, 'net.dhleong.njast.util.Fanciest');
                test.equals(fanciest.type, Ast.TYPE);
            }

            test.done();
        });
        
    },
    

    doBar: function(test) {

        an.word("doBar")
        .at(26, 44)
        .find(function(err, type) {
            test.ifError(err);

            if (!err) {
                // TODO It seems that java bytecode separates
                //  paths with '/', separates fields and methods
                //  with '.', and nested classes with '$'. 
                // Their methods, of course, can be differentiated
                //  from fields by having :(ARGS;)RETURN; vs fields
                //  which are simply :TYPE;

                // the main thing
                test.equals(type.name, "net.dhleong.njast.Bar#doBar");
                test.equals(type.type, Ast.METHOD);

                // well, we resolve this anyway,
                //  so it doesn't hurt to keep it (?)
                var biz = type.container;
                test.equals(biz.name, 'biz');
                test.equals(biz.type, Ast.METHOD_CALL);

                var baz = biz.container;
                test.equals(baz.name, 'baz');
                test.equals(baz.type, Ast.METHOD_CALL);

                var buz = baz.container;
                test.equals(buz.name, 'buz');
                test.equals(buz.type, Ast.METHOD_CALL);

                var fancier = buz.container;
                test.equals(fancier.name, 
                    'net.dhleong.njast.Foo$Fancy$Fancier');
                test.equals(fancier.type, Ast.TYPE);

                // the real trick!
                var bar = type.owner;
                test.equals(bar.name, 'net.dhleong.njast.Bar');
                test.equals(bar.type, Ast.TYPE);
            }

            test.done();
        });
    },

}
