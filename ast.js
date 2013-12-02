
var fs = require('fs')
    , Tokenizer = require('./tokenizer');

/**
 * Constructs Ast root
 * @param path FS path of the file to parse
 * @param buffer Optional; if provided, a String 
 *  with the contents of "path"
 */
function Ast(path, buffer) {
    this._path = path;

    this._fp = buffer
        ? buffer
        : fs.readFileSync(buffer);
    this.tok = new Tokenizer(this._fp);
    
    this._root = new JavaFile(this._path, this.tok);
}

/**
 * File name of this Ast root
 */
Ast.prototype.getPath = function() {
    return this._path;
}

/**
 * Return a string representing the AST
 */
Ast.prototype.dump = function() {
    return this._root.dump();
}

/**
 * Root "Java File" obj; contains
 *  top-level classes, imports, and package
 */
function JavaFile(path, tok) {
    this._path = path;
    this.tok = tok;

    this.package = '<default>';
    this.imports = [];
    this.classes = [];

    // parse the file
    for (;;) {
        var type = tok.readName();
        console.log('type = ' + type);
        if (type == 'package')
            this.package = tok.readQualified();
        else if (type == 'import')
            this.imports.push(tok.readQualified());
        else {
            console.log("At line: " + this.tok.getLine());
            return; //this.classes.push(new Class(path, tok));
        }
    }
}

JavaFile.prototype.dump = function() {
    var buf = "[JavaFile: package " + this.package + ";\n";
    this.imports.forEach(function(i) {
        buf += 'import ' + i + ";\n";
    });

    return buf + "]";
}


/**
 * A java class
 */
function Class(path, tok) {
}


module.exports = Ast;
