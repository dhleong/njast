
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

    doBar: function(test) {

        an.word("doBar")
        .at(22, 14)
        .find(function(err, type) {
            test.ifError(err);

            test.equals(type.name, "doBar");
            test.equals(type.type, Ast.METHOD);

            var biz = type.container;
            test.equals(biz.name, 'biz');
            test.equals(biz.type, Ast.METHOD_CALL);

            test.done();
        });
    }
    
}
