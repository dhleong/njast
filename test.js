
var fs = require('fs');
var Ast = require('./ast');

var path;
path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/now/InstantSocket.java';
path = '/lib/android-sdk/sources/android-15/android/widget/GridView.java';
path = '/lib/android-sdk/sources/android-15/android/view/View.java';
var buf = fs.readFile(path, function(err, buf) {
    var ast = new Ast(path, buf);
    console.log(ast.dump());
});

