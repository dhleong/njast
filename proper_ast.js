
var events = require('events')
  , util = require('util')
  , Tokenizer = require('./proper_tokenizer');

function Ast(path, buffer) {
    // this._path = path;
    // this._fp = buffer;
    this.tok = new Tokenizer(path, buffer);
    this._root; // filled via parse()

    this.toplevel = [];
    this.qualifieds = {};

    var self = this;
    this.on('qualified', function(node) {
        self.qualifieds[node.qualifiedName] = node;
    })
    .on('toplevel', function(node) {
        self.toplevel.push(node);
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
function SimpleNode(prev) {
    this._prev = prev;
    this._root = prev._root;
    if (!this._root) {
        this._root = prev;
    }
    if (!(this._root instanceof Ast))
        throw Error("Root is wrong!" + this._root.constructor.name);

    this.tok = prev.tok;
    this.start = prev.tok.getPos();
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

SimpleNode.prototype._qualify = function(separator) {

    if (this.getParent() instanceof CompilationUnit) {
        this.qualifiedName = this.getParent().package + '.' + this.name;
        this.getRoot().emit('toplevel', this);
    } else {
        // parent is a ClassBody; grandparent is a Class/Interface
        this.qualifiedName = this.getParent().getParent().qualifiedName
                           + separator + this.name;
    }
}

/**
 * Root AST node of a java file
 */
function CompilationUnit(ast, package) {
    SimpleNode.call(this, ast);

    this.package = package;

    this.imports = [];
    this.types = [];

    var tok = this.tok;
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
    while ((type = TypeDeclaration.read(this))) {
        this.types.push(type);
    }

    this._end();
}
util.inherits(CompilationUnit, SimpleNode);

CompilationUnit.read = function(ast) {
    if (ast.tok.readString("package")) {
        return new CompilationUnit(ast, ast.tok.readQualified());
    } else {
        return new CompilationUnit(ast, "default");
    }
};

/**
 * Factory for TypeDeclarations
 */
var TypeDeclaration = {
    read: function(prev) {
        var tok = prev.tok;

        // it can be just a semicolon
        while (tok.readSemicolon()) 
            continue;

        // class or interface decl
        var mods = Modifiers.read(prev);
        if (tok.readString("class")) {
            return new Class(prev, mods);
        } else if (tok.readString("enum")) {
            tok.raiseUnsupported("enum");
        } else if (tok.readString("interface")) {
            return new Interface(prev, mods);
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
function Class(prev, mods) {
    SimpleNode.call(this, prev);
    
    this.mods = mods;

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this._qualify('$');

    this.typeParams = TypeParameters.read(prev);

    if (tok.readString('extends')) {
        this.extends = Type.read(prev);
    }
    if (tok.readString('implements')) {
        this.implements = [];
        do {
            this.implements.push(Type.read(prev));
        } while(tok.readComma());
    }

    // body
    this.body = new ClassBody(prev);

    this._end();
}
util.inherits(Class, SimpleNode);

/**
 * A Java class declaration
 */
function Interface(prev, mods) {
    SimpleNode.call(this, prev);

    this.mods = mods;

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this._qualify('$');

    this.typeParams = TypeParameters.read(prev);
    
    if (tok.readString('extends')) {
        this.extends = [];
        do {
            this.extends.push(Type.read(prev));
        } while(tok.readComma());
    }

    // TODO technically this should be InterfaceBody,
    //  since all methods should be declared as if abstract,
    //  but for now... this is sufficient
    this.body = new ClassBody(prev);

    this._end();
}
util.inherits(Interface, SimpleNode);


/**
 * 
 */
function ClassBody(prev) {
    SimpleNode.call(this, prev);

    // shorcut indexes of declared things
    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];

    // ALL child elements, in parse-order
    this.kids = [];
    
    // TODO statements
    var tok = this.tok;
    tok.expectBlockOpen();
    while (!tok.readBlockClose()) {
        var el = this._readDeclaration();
        if (!el) continue;

        this.kids.push(el);

        // TODO push onto index by type
    }

    this._end();
}
util.inherits(ClassBody, SimpleNode);

ClassBody.prototype._readDeclaration = function() {
    var tok = this.tok;
    if (tok.readSemicolon())
        return;

    // TODO
    var mods = Modifiers.read(this);
    if (tok.peekBlockOpen()) {
        var block = Block.read(this);
        if (block)
            return block;
    }

    return this._readMember(mods);
};

ClassBody.prototype._readMember = function(mods) {
    var tok = this.tok;

    var typeParams = TypeParameters.read(this);
    if (typeParams) {
        // TODO generic method or constructor
        tok.raiseUnsupported("generic method/constructor");
    }

    var type = Type.read(this);
    if (!type) {
        // TODO class/interface decl?
        tok.raiseUnsupported("nested class/interface");
    }

    if (tok.peekParenOpen()) {
        // TODO
        tok.raiseUnsupported("constructor");
    }

    typeParams = TypeParameters.read(this);
    var ident = tok.readIdentifier();

    if (tok.peekParenOpen()) {
        // TODO
        tok.raiseUnsupported("method");
    }

    return new Field(this, mods, type, typeParams, ident);
};

function Field(prev, mods, type, typeParams, name) {
    SimpleNode.call(this, prev);

    this.start = mods.start;
    this.mods = mods;
    this.type = type;
    this.typeParams = typeParams;
    this.name = name;
    this._qualify('#');

    var tok = this.tok;
    if (tok.readEquals()) {
        // TODO
        tok.raiseUnsupported("field initialization");
    }

    tok.expectSemicolon();

    this._end();
}
util.inherits(Field, SimpleNode);

function Block(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
    this.expectBlockOpen();
    while (!tok.readBlockClose()) {
        // TODO block statement
        tok.readIdentifier();
    }

    this._end();
}
util.inherits(Block, SimpleNode);

Block.read = function(prev) {
    if (!prev.tok.peekBlockOpen())
        return;

    return new Block(prev);
}

/**
 * Modifiers list
 */
function Modifiers(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
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

Modifiers.read = function(prev) {
    // TODO annotations
    var tok = prev.tok;
    if (tok.readAt())
        tok.raiseUnsupported("annotations");

    var ident = tok.peekIdentifier();
    if (!Tokenizer.isModifier(ident)) 
        return;

    return new Modifiers(prev);
}

/**
 * Factory for Types
 */
var Type = {
    read: function(prev) {
        var ident = prev.tok.peekIdentifier();
        if ('void' == ident || Tokenizer.isPrimitive(ident))
            return new BasicType(prev);
        else if (Tokenizer.isReserved(ident))
            return; // not a type

        return new ReferenceType(prev);
    }
}

function BasicType(prev) {
    SimpleNode.call(this, prev);

    this.name = prev.tok.readIdentifier();

    this._end();
}
util.inherits(BasicType, SimpleNode);

function ReferenceType(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this.simpleName = this.name; // Simple name will drop all TypeArguments

    // TODO <TypeArgs> . etc.
    if (tok.readGenericOpen())
        tok.raiseUnsupported('type arguments');
    if (tok.readDot())
        tok.raiseUnsupported('Type.OtherType');

    this._end();
}
util.inherits(ReferenceType, SimpleNode);


function TypeParameters(prev) {
    SimpleNode.call(this, prev);

    this._end();
}
util.inherits(Modifiers, SimpleNode);

TypeParameters.read = function(prev) {
    var tok = prev.tok;
    if (!tok.readGenericOpen())
        return;

    // TODO
    tok.raiseUnsupported("TypeParameters");
    return new TypeParameters(prev);
}


/**
 * Exports
 */
module.exports = {
    parseFile: function(path, buffer, callback) {
        var ast = new Ast(path, buffer);
        ast.parse(CompilationUnit);
        callback(null, ast);
    }
}
