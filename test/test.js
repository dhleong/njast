/*
require('nodetime').profile({
    accountKey: 'e65f83e46f6f22ffc72bad639c412c39df60bd02', 
    appName: 'njast'
  });
*/

var fs = require('fs')
    , Ast = require('../ast')
    // , Tagifier = require('../tagifier')
    // , Analyzer = require('../analyze')
    ;

var path;
path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/now/InstantSocket.java';
path = '/lib/android-sdk/sources/android-15/android/widget/GridView.java';
path = '/lib/android-sdk/sources/android-15/android/view/View.java';
path = 'Foo.java';

/* jshint unused:false */
function stringify(obj) {
    return JSON.stringify(obj, function(key, value) {
        if (key.charAt(0) == '_')
            return;

        return value;
    }, '  ');
}

fs.readFile(path, function(err, buf) {

    var ast = new Ast(path, buf);
    ast.on('class', function(node) {
        console.log(" CLASS:" + node.name);
    }).on('toplevel', function(node) {
        console.log("TOPLVL:" + node.name
            + " extends " + node.superclass
            + " implements " + node.interfaces.join(','));
    }).on('interface', function(node) {
        console.log("INTRFC:" + node.name);
    }).on('vardef', function(node) {
        console.log("VARDEF:" + node.name);
    }).on('method', function(node) {
        console.log("METHOD:" + node.name);
    })
    .parse();
    console.log(ast.dump());

//     Analyzer.of(path, buf)
//         //.word("onInitializeAccessibilityNodeInfoInternal")
//         //.at(14972, 18)
//         .word("doBar")
//         .at(22, 14)
//         .find(function(err, type) {
//             if (err) {
//                 console.log(err);
//                 return;
//             }
//             console.log(type.dump());
//
//             var scope = type.getLocalScope();
//             /*
//             console.log("scope=", 
//                 scope.constructor.name, 
//                 scope.dumpLine(),
//                 scope.dump());
//                 */
//         });
//
    /*
    Tagifier.of(path, buf)
        .wordAt('doBar', 22, 14)
        .on('word', function(err, type) {
            console.log("WORD!", stringify(err), type);
        })
        .on('parsed', function(err, tags) {
            console.log("TAGS!", stringify(err), stringify(tags));
        })
        .start();
    */
});

