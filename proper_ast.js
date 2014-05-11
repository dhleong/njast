
var events = require('events')
  , util = require('util')
  , Tokenizer = require('./proper_tokenizer');

function Ast(path, buffer) {
    // this._path = path;
    // this._fp = buffer;
    this.tok = new Tokenizer(path, buffer);
    this._root; // filled via parse()

    this.toplevel;
    this.qualifieds = {};

    var self = this;
    this.on('qualified', function(node) {
        self.qualifieds[node.qualifiedName] = node;
    })
    .on('toplevel', function(node) {
        self.toplevel = node;
    });
}
util.inherits(Ast, events.EventEmitter);

Ast.prototype.parse = function(startType) {

    this._root = startType.read(this, this.tok);
};

Ast.prototype.getPackage = function() {

    if (this._root instanceof CompilationUnit)
        return this._root.package;

};

/**
 * Superclass for simple things
 */
function SimpleNode(prev, tok) {
    this._prev = prev;
    this._root = prev._root;
    if (!this._root) {
        this._root = prev;
    }
    if (!(this._root instanceof Ast))
        throw Error("Root is wrong!" + this._root.constructor.name);

    this.tok = tok;
    this.start = tok.getPos();
}

/** Call at the end of parsing */
SimpleNode.prototype._end = function() {
    this.end = this.tok.getPos();
    this.publish();
}

SimpleNode.prototype.getParent = function() {
    return this._prev;
}

SimpleNode.prototype.getPath = function() {
    return this._root.getPath();
}

SimpleNode.prototype.getRoot = function() {
    return this._root;
}

SimpleNode.prototype.publish = function(type) {
    var eventType = type
        ? type
        : this.constructor.name.toLowerCase();
    this._root.emit(eventType, this);

    if (this.qualifiedName)
        this._root.emit('qualified', this);
}

/**
 * Root AST node of a java file
 */
function CompilationUnit(ast, tok, package) {
    SimpleNode.call(this, ast, tok);

    this.package = package;

    this.imports = [];
    this.types = [];

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

    // TypeDeclarations
    var type;
    while ((type = TypeDeclaration.read(this, tok))) {
        this.types.push(type);
    }

    this._end();
}
util.inherits(CompilationUnit, SimpleNode);

CompilationUnit.read = function(ast, tok) {
    if (tok.readString("package")) {
        return new CompilationUnit(ast, tok, tok.readQualified());
    } else {
        return new CompilationUnit(ast, tok, "default");
    }
};

/**
 * Factory for TypeDeclarations
 */
var TypeDeclaration = {
    read: function(prev, tok) {
        // it can be just a semicolon
        while (tok.readSemicolon()) 
            continue;

        // class or interface decl
        var mods = Modifiers.read(prev, tok);
        if (tok.readString("class")) {
            return new ClassDeclaration(prev, tok, mods);
        } else if (tok.readString("enum")) {
            tok.raiseUnsupported("enum");
        } else if (tok.readString("interface")) {
            tok.raiseUnsupported("interface");
        } else if (tok.readAt()) {
            // TODO annotation
            tok.expectAt();
            tok.raiseUnsupported("annotation declaration");
        }
    }
}

/**
 * A Java class declaration
 */
function ClassDeclaration(prev, tok, mods) {
    SimpleNode.call(this, prev, tok);
    
    this.mods = mods;

    this.name = tok.readIdentifier();

    if (this.getParent() instanceof CompilationUnit) {
        this.qualifiedName = this.getParent().package + '.' + this.name;
        this.getRoot().emit('toplevel', this);
    } else {
        // parent is a ClassBody; grandparent is a Class/Interface
        this.qualifiedName = this.getParent().getParent().qualifiedName
                           + '$' + this.name;
    }

    this._end();
}
util.inherits(ClassDeclaration, SimpleNode);

/**
 * Modifiers list
 */
function Modifiers(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.kids = [];

    while (!tok.isEof()) {
        // TODO annotations
        if (tok.readAt())
            tok.raiseUnsupported("annotations");

        var ident = tok.peekIdentifier();
        if (!Tokenizer.isModifier(ident)) 
            break;
        
        this.kids.push(tok.readIdentifier());
    }

    this._end();
}
util.inherits(Modifiers, SimpleNode);

Modifiers.read = function(prev, tok) {
    // TODO annotations
    if (tok.readAt())
        tok.raiseUnsupported("annotations");

    var ident = tok.peekIdentifier();
    if (!Tokenizer.isModifier(ident)) 
        return;

    return new Modifiers(prev, tok);
}


module.exports = {
    parseFile: function(path, buffer, callback) {
        var ast = new Ast(path, buffer);
        ast.parse(CompilationUnit);
        callback(null, ast);
    }
}
