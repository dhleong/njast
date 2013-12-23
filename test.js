/*
require('nodetime').profile({
    accountKey: 'e65f83e46f6f22ffc72bad639c412c39df60bd02', 
    appName: 'njast'
  });
*/

var fs = require('fs');
var Ast = require('./ast');

var path;
path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/now/InstantSocket.java';
path = '/lib/android-sdk/sources/android-15/android/widget/GridView.java';
path = '/lib/android-sdk/sources/android-15/android/view/View.java';
//path = 'Foo.java';

var buf = fs.readFile(path, function(err, buf) {
    var ast = new Ast(path, buf);
    ast.on('class', function(node) {
        console.log(" CLASS:" + node.name);
    }).on('vardef', function(node) {
        console.log("VARDEF:" + node.name);
    }).on('method', function(node) {
        console.log("METHOD:" + node.name);
    })
    .parse();
    //console.log(ast.dump());
});

