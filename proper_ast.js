
var Tokenizer = require('./proper_tokenizer');

function Ast(path, buffer) {
    // this._path = path;
    // this._fp = buffer;
    this.tok = new Tokenizer(path, buffer);

    this._root;
}

Ast.prototype.parse = function(startType) {

    this._root = startType.read(this.tok);
};

Ast.prototype.getPackage = function() {

    if (this._root instanceof CompilationUnit)
        return this._root.package;

};


function CompilationUnit(tok, package) {
    this.package = package;

    this.imports = [];

    tok.expectSemicolon();

    // imports
    while (tok.readString("import")) {
        var static = tok.readString("static");

        var path = tok.readQualified();
        var star = tok.readStar()

        if (path) {
            this.imports.push({
                static: static,
                path: path,
                star: star
            });
        }

        tok.expectSemicolon();
    }
}

CompilationUnit.read = function(tok) {
    if (tok.readString("package")) {
        return new CompilationUnit(tok, tok.readQualified());
    } else {
        return new CompilationUnit(tok, "default");
    }
};


module.exports = {
    parseFile: function(path, buffer, callback) {
        var ast = new Ast(path, buffer);
        ast.parse(CompilationUnit);
        callback(null, ast);
    }
}
