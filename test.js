
var fs = require('fs');
var Ast = require('./ast');

//var path = '/Users/dhleong/git/minus-for-Android/src/com/minus/android/now/InstantSocket.java';
var path = '/lib/android-sdk/sources/android-19/android/widget/GridView.java';
var buf = fs.readFile(path, function(err, buf) {
    var ast = new Ast(path, buf);
    console.log(ast.dump());

    //console.log(buf);
});

