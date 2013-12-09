
var util = require("util")
    , fs = require('fs')
    , Tokenizer = require('./tokenizer');

INDENT_LEVEL = 2;

function indent(level) {
    var buf = "";
    var level = level ? level : 0;
    for (i=0; i < level; i++)
        buf += ' ';

    return buf;
}

function dumpArray(label, array, level) {

    var buf = '';
    if (array && array.length > 0) {
        buf += "\n" + indent(level);
        buf += label + ":\n";
        array.forEach(function(cl) {
            buf += cl.dump(level);
        });
    }

    return buf;
}

/**
 * Returns an array with the results of calling dump()
 *  on each member of the array
 */
Array.prototype.dumpEach = function dumpEach() {
    var ret = [];
    this.forEach(function(el) {
        this.push(el.dump());
    }, ret);
    return ret;
}

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
 * Superclass for block-like things
 */
function BlockLike(path, tok) {
    this._path = path;
    this.tok = tok;
    this.line = tok.getLine();
    this.line_end = this.line; // for now
}

BlockLike.prototype.dumpLine = function() {
    return "(@" + this.line + " ~ " + this.line_end + ")";
}

BlockLike.prototype.getPath = function() {
    return this._path;
}

/** Call when done processing */
BlockLike.prototype.end = function() {
    this.line_end = this.tok.getLine();
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
        var type = tok.peekName();
        //console.log('type = ' + type);
        if (type == 'package') {
            tok.readName();
            this.package = tok.readQualified();
            tok.readSemicolon();
        } else if (type == 'import') {
            tok.readName();
            this.imports.push(tok.readQualified());
            tok.readSemicolon();
        } else {
            klass = new Class(path, tok);
            this.classes.push(klass);

            // TODO save refs to all "tags" 
            break; // FIXME temporary, to prevent unwanted processing for now
        }
    }
}

JavaFile.prototype.dump = function() {
    var buf = "[JavaFile:package " + this.package + ";\n";
    this.imports.forEach(function(i) {
        buf += 'import ' + i + ";\n";
    });

    buf += "\nClasses:\n";
    this.classes.forEach(function(cl) {
        buf += cl.dump(2) + "\n";
    });

    return buf + "]";
}


/**
 * A java class
 */
function Class(path, tok, modifiers) {
    BlockLike.call(this, path, tok);

    this.modifiers = modifiers ? modifiers.slice() : [];
    this.superclass = null;
    this.interfaces = [];

    if (!modifiers) {
        // only look if they weren't provided
        while (tok.isModifier())
            this.modifiers.push(tok.readName());
    }

    // should be a class!
    tok.expect("class", tok.peekName);

    tok.readName(); // read "class"
    this.name = tok.readGeneric(); // class name (of course)

    if (!tok.peekBlockOpen()) { // opening block

        if ("extends" == tok.peekName()) {
            tok.readName();

            this.superclass = tok.readGeneric();
        }

        if ("implements" == tok.peekName()) {
            tok.readName();

            do {
                this.interfaces.push(tok.readGeneric());
            } while (tok.readComma());
        }

        // we should be opening the class now
        if (!tok.peekBlockOpen())
            throw "Expected ``{'' but was ``" + tok.readName() + "''";
    }

    this.body = new ClassBody(path, tok);

    this.end();
}
util.inherits(Class, BlockLike);

Class.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var parentsLevel = nextLevel + INDENT_LEVEL;
    var buf = indent(level);
    buf += "[Class:" + this.modifiers.join(' ') 
        + " ``" + this.name + "'' " + this.dumpLine();

    if (this.superclass)
        buf += "\n" + indent(parentsLevel) + "extends [" + this.superclass + "]";

    if (this.interfaces.length > 0)         
        buf += "\n" + indent(parentsLevel) + "implements [" + this.interfaces.join(", ") + "]";

    buf += this.body.dump(nextLevel);

    return buf + "\n" + indent(level) + "]";
}


/**
 * The body of a class (extracted for anonymous classes!)
 */
function ClassBody(path, tok) {
    BlockLike.call(this, path, tok);

    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];

    tok.expect(true, tok.readBlockOpen);
    var _javadoc = null;
    var _mods = []; // workspace

    // read in the body
    for (;;) {
        if (tok.readBlockClose())
            break;

        // save comments in hopes of javadoc
        var nextJavadoc = tok.getLastComment();
        if (nextJavadoc && !_javadoc)
            _javadoc = nextJavadoc
        else if (nextJavadoc)
            _javadoc += nextJavadoc;

        // what've we got here?
        token = tok.peekName();
    
        // check for static block
        if (token == 'static') {
            if (tok.readBlockOpen()) {
                _mods = [];
                _javadoc = null;

                // yep, static block
                this.blocks.push(new Block(path, tok));
            } else {

                _mods.push(tok.readName());
            }
        }

        if (Tokenizer.isModifier(token)) {
            _mods.push(tok.readName());
            continue;
        }

        if ("" == token) {
            if (tok.isAnnotation()) {
                _mods.push(new Annotations(tok));
                continue;
            } 

            break; // TODO ?

        } else if ("class" == token) {
            this.subclasses.push(new Class(path, tok, _mods));
        } else {
            var fom = this._parseFieldOrMethod(path, tok, _mods);
            if (!fom)
                break; // TODO ?

            if ('VarDef' == fom.constructor.name)
                this.fields.push(fom);
            else if ('Method' == fom.constructor.name)
                this.methods.push(fom);

            console.log("JAVADOC for", fom.constructor.name, fom.name, _javadoc);
        }

        _mods = [];
        _javadoc = null;
        console.log('peek=', _mods.join(' '), token);
    }

    this.end();
}
util.inherits(ClassBody, BlockLike);

ClassBody.prototype._parseFieldOrMethod = function(path, tok, modifiers) {

    var type = tok.readGeneric();
    var name = tok.readName();
    //console.log('!!!fom=', modifiers.join(' '), type, name);

    if (tok.peekEquals() || tok.peekSemicolon()) {
        //console.log("vardef!", type, name);
        var field = new VarDef(path, tok, type, name);
        field.modifiers = modifiers;
        return field;
    } else {
        //console.log("method!", type, name, tok.getLine());
        //console.log("mods:", modifiers);
        return new Method(path, tok, modifiers, type, name);
    }
};

ClassBody.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    buf = indent(level) + " {" + this.dumpLine();
    buf += dumpArray("Subclasses", this.subclasses, nextLevel);
    buf += dumpArray("Fields", this.fields, nextLevel);
    buf += dumpArray("Methods", this.methods, nextLevel);
    return buf + "\n" + indent(level) + "}";
}

/**
 * Method in a class
 */
function Method(path, tok, modifiers, returnType, name) {
    BlockLike.call(this, path, tok);

    this.modifiers = modifiers;
    
    this.returnType = returnType;
    this.name = name;

    this.args = new ArgumentsDef(path, tok);

    // throws declaration?
    if (tok.peekName() == "throws") {
        tok.readName();

        this.throws = [];
        do {
            this.throws.push(tok.readGeneric());
        } while (tok.readComma());
    }

    if (!tok.readSemicolon()) {
        // we have a body!
        this.body = new Block(path, tok);
    }

    this.end();
}
util.inherits(Method, BlockLike);

Method.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var type = this.body ? "Method" : "MethodDef";
    var buf = indent(level);
    buf += "[" + type + ":" + this.modifiers.join(' ')
        + " ``" + this.name + "'' " + this.dumpLine()
        + "\n" + indent(nextLevel) + this.args.dump()
        + (!this.throws ? '' : "\n" + indent(nextLevel) + "throws " + this.throws.join(','))
        + "\n" + indent(nextLevel) + " -> " + this.returnType;

    if (this.body)
        buf += this.body.dump(nextLevel);

    return buf + "\n" + indent(level) + "]";
}


/**
 * A variable definition; could be 
 *  a field, a local variable, or even
 *  a method arg definition
 */
function VarDef(path, tok, type, name) {
    this._path = path;
    this.line = tok.getLine();

    if (type) {
        this.type = type;
        this.name = name;
    } else {
        this.modifiers = [];

        if (tok.isAnnotation())
            this.modifiers.push(new Annotations(tok));

        while (tok.isModifier())
            this.modifiers.push(tok.readName());

        this.type = tok.readGeneric();
        this.name = tok.readName();
    }

    this.initializer = null;

    if (tok.peekExpressionEnd())
        return; // just defined; not initialized
    else if (!tok.readEquals())
        tok.expect(true, tok.readEquals);

    var value = tok.peekName();
    //console.log('vardef=', type, name, value);
    
    if ('new' == value) {
        this._parseInstantiation(path, tok);
    } else {
        // TODO constant value
        this.initializer = tok.readName(); // FIXME
    }
}

VarDef.prototype.dump = function(level) {
    var buf = indent(level);
    var mods = this.modifiers ? this.modifiers.join(' ') : "";
    var init = this.creator ? "\n" + indent(level+INDENT_LEVEL) + " = " + this.creator.dump() : "";
    return buf + "[VarDef:" + mods
        + " [" + this.type + "] ``" + this.name + "'' (@" + this.line + ")" 
        + init
        + "\n";
}

VarDef.prototype._parseInstantiation = function(path, tok) {

    this.creator = new Creator(path, tok);
    
    tok.expect(true, tok.readSemicolon);
    //console.log("Instantiate!", type, this.args);
}


/**
 * "Creator" (Oracle's term)
 */
function Creator(path, tok) {

    tok.expect("new", tok.readName);
    var type = tok.readGeneric();
    this.initializer = '[new] ' + type; // TODO fancier
    this.args = new Arguments(path, tok);

    if (tok.peekBlockOpen()) {
        this.body = new ClassBody(path, tok);
    }
}

Creator.prototype.dump = function(level) {

    var buf = this.initializer ? this.initializer : "";
    buf += this.args ? this.args.dump() : "";
    if (this.body)
        buf += this.body.dump(level + INDENT_LEVEL);

    return buf;
}

/**
 * Arguments list, ex: `(var1, 2, 3)`
 */
function Arguments(path, tok) {

    this.line = tok.getLine();
    this.expressions = [];

    tok.expect(true, tok.readParenOpen);

    do {
        var expr = Expression.read(path, tok);
        if (!expr)
            break;

        this.expressions.push(expr);
    } while (tok.readComma());

    console.log(this.dump());
    tok.expect(true, tok.readParenClose);
}

Arguments.prototype.dump = function(level) {
    return "[ARGS:@" + this.line + " (" + this.expressions.dumpEach().join(" , ") + ")]";
}


/**
 * Arguments list definition: ex `(@annot final int var, @special java.lang.Class klass)`
 */
function ArgumentsDef(path, tok) {
    this.line = tok.getLine();
    this.args = [];
    
    tok.expect(true, tok.readParenOpen);
    while (!tok.peekParenClose()) {
        this.args.push(new VarDef(path, tok));

        tok.readComma();
    }

    tok.expect(true, tok.readParenClose);
}

ArgumentsDef.prototype.dump = function() {
    if (this.args.length) {
        return "[ARGD:@" + this.line + 
            this.args.dumpEach().join(",") + "]";
    } else {
        return "[ARGD:@" + this.line + " (no-args)]";
    }
}


/**
 * Using annotations
 */
function Annotations(tok) {
    this.line = tok.getLine();

    this.annotations = [];

    while (tok.isAnnotation()) {
        this.annotations.push(new Annotation(tok));
    }
}

function Annotation(tok) {
    this.line = tok.getLine();

    tok.expect(true, tok.readAt);
    this.name = '@' + tok.readQualified();
    this.args = new AnnotationArguments(tok);
}

function AnnotationArguments(tok) {
    this.line = tok.getLine();

    this.expressions = [];

    if (!tok.peekParenOpen())
        return; // no args

    tok.expect(true, tok.readParenOpen);

    do {
        // FIXME: allow var=val
        this.expressions.push(tok.readName());
    } while (tok.readComma());

    tok.expect(true, tok.readParenClose);

}


/**
 * Code blocks!
 */
function Block(path, tok) {
    BlockLike.call(this, path, tok);

    this.statements = [];

    tok.readBlockOpen();
    // console.log("Block=", tok.readName(), tok.getLastComment());
    
    // read statements
    while (!tok.readParenClose()) {

        var statement = Statement.read(path, tok);
        if (!statement)
            break;

        this.statements.push(statement);
    }
    tok.readBlockClose();

    this.end();
}
util.inherits(Block, BlockLike);

Block.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var buf = '\n' + indent(level) + '{' + this.dumpLine() + '\n';

    buf += dumpArray("Statements", this.statements, nextLevel);

    return buf + '\n' + indent(level) + '}';
}


/**
 * An individual statement (within a Block)
 */
function Statement(path, tok, type) {
    this._path = path;
    this.line = tok.getLine();
    this.type = type;

    this.kids = [];

    switch (type) {
    case "if":
        this.parens = Statement.read(path, tok);
        this.kids.push(Statement.read(path, tok));
        if (tok.peekName() == 'else') {
            tok.expect("else", tok.readName);
            this.kids.push(Statement.read(path, tok));
        }
        break;
    }
}

Statement.prototype.dump = function(level) {
    var buf = indent(level) + '[STMT@' + this.line + ": " + this.type;
    if (this.kids.length) {
        buf += indent(level + INDENT_LEVEL) + this.kids.dumpEach().join("\n");
    }

    return buf  + "]";
}

/** Factory; we might return VarDef, for example */
Statement.read = function read(path, tok) {
    if (tok.peekBlockOpen()) {

        // it's a block
        return new Block(path, tok);

    } else if (tok.readParenOpen()) {

        // should we wrap this so we know?
        var expr = Expression.read(path, tok);
        console.log("ParExpression", expr);
        tok.expect(true, tok.readParenClose);
        return expr;
    } else if (tok.isControl()) {
        var control = tok.readName();
        return new Statement(path, tok, control);
    } else if (tok.isModifier()) {
        // definitely a vardef, I think
        return new VarDef(path, tok);
    } else if ((type = tok.peekGeneric())
            && (name = tok.peekName(type.length))) {
        
        console.log("Var def statement!", type, name);
        return new VarDef(path, tok, type, name);
    } else {
        // some sort of expression
        return Expression.read(path, tok);
    }
}


/**
 * An expression 
 */
function Expression(path, tok) {
    // TODO
    this.line = tok.getLine();

    this.name = tok.readQualified();
    this.value = this.name;

    if (tok.peekParenOpen()) {
        console.log("METHOD CALL:", this.name);
        this.right = new Arguments(path, tok);
        return;
    }

    while (!tok.peekExpressionEnd()) {
        var read = tok.peekGeneric();
        if (read) {
            if (read == 'new')
                this.right = new Creator(path, tok);
            else
                this.value += tok.readGeneric();

            console.log(this.value);
        } else if (tok.readEquals()) {
            // assignment
            this.value += ' [=] ';
            console.log(this.value);
        } else {
            // FIXME what?
            console.log("WHAT?", tok._peek());
            break;
        }
    }
}

Expression.read = function read(path, tok) {

    var name = tok.peekName();
    if (!name) {
        console.log("Read expression", tok.getLine());
        return null;
    }

    if (name == 'new') {
        return new Creator(path, tok);
    } else {

        // FIXME: allow maths, etc.
        return new Expression(path, tok);
    }
}


Expression.prototype.dump = function(level) {
    // TODO
    var buf = indent(level) + "[EXPR:@" + this.line + " " + this.value;

    if (this.right) {
        buf += this.right.dump(level);
    }
    
    return buf + "]";
}

module.exports = Ast;
