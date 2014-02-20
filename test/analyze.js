
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
        .at(17, 31)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "int");
            test.equals(type.type, Ast.VARIABLE);

            test.done();
        });
    },

    arg3: function(test) {
        
        an.word("arg3")
        .at(17, 31)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "net.dhleong.njast.lame.Boring");
            test.equals(type.type, Ast.VARIABLE);

            test.done();
        });
    },

    prepare: function(test) {
        an.word("prepare")
        .at(20, 28)
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
        .at(23, 44)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "doBar");
            test.equals(type.type, Ast.METHOD);

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

            test.done();
        });
    },

}
