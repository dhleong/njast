/*
require('nodetime').profile({
    accountKey: 'e65f83e46f6f22ffc72bad639c412c39df60bd02', 
    appName: 'njast'
  });
*/

var fs = require('fs')
    , Ast = require('./ast')
    , Analyzer = require('./analyze');

var path;
path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/now/InstantSocket.java';
path = '/lib/android-sdk/sources/android-15/android/widget/GridView.java';
path = '/lib/android-sdk/sources/android-15/android/view/View.java';
path = 'Foo.java';

var buf = fs.readFile(path, function(err, buf) {

    var ast = new Ast(path, buf);
    /*
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
    */
    //console.log(ast.parse().dump());

    Analyzer.of(path, buf)
        //.word("onInitializeAccessibilityNodeInfoInternal")
        //.at(14972, 18)
        .word("doBoring")
        .at(19, 14)
        .find(function(err, type) {
            if (err) {
                console.log(err);
                return;
            }
            console.log(type.dump());

            var scope = type.getLocalScope();
            /*
            console.log("scope=", 
                scope.constructor.name, 
                scope.dumpLine(),
                scope.dump());
                */
        });


});

