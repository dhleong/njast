
var util = require("util")
    , fs = require('fs')
    , Tokenizer = require('./tokenizer');

INDENT_LEVEL = 2;

DEBUG = false;

_log = DEBUG
    ? function() { console.log.apply(console.log, arguments); }
    : function() { };

function indent(level) {
    var buf = "";
    var level = level ? level : 0;
    for (i=0; i < level; i++)
        buf += ' ';

    return buf;
}

/** 
 * Returns the result of calling dump() 
 * on the obj, if possible, else "defaultValue"
 * @param defaultValue (optional) The default value
 *  to return if obj is null/undefined.
 *  The default value is "null"
 */
function dump(obj, defaultValue) {
    defaultValue = defaultValue
        ? defaultValue
        : null;
    return obj ? obj.dump() : defaultValue;
}

function dumpArray(label, array, level) {

    var buf = '';
    if (array && array.length > 0) {
        buf += "\n" + indent(level);
        buf += label + ":\n";
        array.forEach(function(cl) {
            buf += "\n" ;
            if (typeof(cl) == 'string')
                buf += cl;
            else
                buf += cl.dump(level);
        });
    }

    return buf;
}

/**
 * Returns an array with the results of calling dump()
 *  on each member of the array
 */
Array.prototype.dumpEach = function dumpEach(level) {
    var ret = [];
    this.forEach(function(el) {
        if (typeof(el) == "string")
            this.push(el);
        else
            this.push(el.dump(level));
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
    
    this._root = new JavaFile(this, this.tok);
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
 * Superclass for simple things
 */
function SimpleNode(prev, tok) {
    this._prev = prev;
    this._root = prev._root;
    this.tok = tok;
    this.line = tok.getLine();
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


/**
 * Superclass for block-like things
 */
function BlockLike(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.line_end = this.line; // for now
}
util.inherits(BlockLike, SimpleNode);

BlockLike.prototype.dumpLine = function() {
    return "(@" + this.line + " ~ " + this.line_end + ")";
}

/** Call when done processing */
BlockLike.prototype.end = function() {
    this.line_end = this.tok.getLine();
}


/**
 * Root "Java File" obj; contains
 *  top-level classes, imports, and package
 */
function JavaFile(root, tok) {
    SimpleNode.call(this, root, tok);
    this._root = root;

    this.package = '<default>';
    this.imports = [];
    this.classes = [];

    // parse the file
    for (;;) {
        var type = tok.peekName();
        //_log('type = ' + type);
        if (type == 'package') {
            tok.readName();
            this.package = tok.readQualified();
            tok.readSemicolon();
        } else if (type == 'import') {
            tok.readName();
            this.imports.push(tok.readQualified());
            tok.readSemicolon();
        } else {
            klass = new Class(root, tok);
            this.classes.push(klass);

            // TODO save refs to all "tags" 
            break; // FIXME temporary, to prevent unwanted processing for now
        }
    }
}
util.inherits(JavaFile, SimpleNode);

JavaFile.prototype.dump = function() {
    var buf = "[JavaFile:package " + this.package + ";\n";

    /* TODO restore; hidden for testing convenience
    this.imports.forEach(function(i) {
        buf += 'import ' + i + ";\n";
    });
    */

    buf += "\nClasses:\n";
    this.classes.forEach(function(cl) {
        buf += cl.dump(2) + "\n";
    });

    return buf + "] // END " + this.getPath();
}


/**
 * A java class
 * @param prev The previous (parent) node in the AST
 * @param tok A Tokenizer
 */
function Class(prev, tok, modifiers) {
    BlockLike.call(this, prev, tok);

    this.modifiers = modifiers ? modifiers.slice() : [];
    this.superclass = null;
    this.interfaces = [];

    if (!modifiers) {

        if (tok.isAnnotation())
            this.modifiers.push(new Annotations(prev, tok));

        // only look if they weren't provided
        while (tok.isModifier())
            this.modifiers.push(tok.readName());
    }

    // should be a class!
    tok.expect("class", tok.readName);

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
        tok.expect(true, tok.peekBlockOpen);
    }

    this.body = new ClassBody(prev, tok);

    this.end();
    _log("End ClassBody", this.dumpLine());
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

    return buf + "\n" + indent(level) + "] // END " + this.name + "@" + this.line_end;
}


/**
 * A java interface
 */
function Interface(prev, tok, modifiers) {
    BlockLike.call(this, prev, tok);

    this.modifiers = modifiers ? modifiers.slice() : [];
    this.interfaces = [];

    if (!modifiers) {
        // only look if they weren't provided
        while (tok.isModifier())
            this.modifiers.push(tok.readName());
    }

    // should be an interface!
    tok.expect("interface", tok.readName);

    this.name = tok.readGeneric(); // interface name (of course)

    if (!tok.peekBlockOpen()) { // opening block

        if ("extends" == tok.peekName()) {
            tok.readName();

            do {
                this.interfaces.push(tok.readGeneric());
            } while (tok.readComma());
        }

        // we should be opening the class now
        tok.expect(true, tok.peekBlockOpen);
    }

    this.body = new ClassBody(prev, tok); // lazy

    this.end();
}
util.inherits(Interface, BlockLike);

Interface.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var parentsLevel = nextLevel + INDENT_LEVEL;
    var buf = indent(level);
    buf += "[Interface:" + this.modifiers.join(' ') 
        + " ``" + this.name + "'' " + this.dumpLine();

    if (this.interfaces.length > 0)         
        buf += "\n" + indent(parentsLevel) + "extends [" + this.interfaces.join(", ") + "]";

    buf += this.body.dump(nextLevel);

    return buf + "\n" + indent(level) + "] // END " + this.name + "@" + this.line_end;
}


/**
 * The body of a class (extracted for anonymous classes!)
 */
function ClassBody(prev, tok) {
    BlockLike.call(this, prev, tok);

    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];

    tok.expect(true, tok.readBlockOpen);
    var _javadoc = null;
    var _mods = []; // workspace

    // read in the body
    for (;;) {
        if (tok.readBlockClose()) {
            _log("!! Close ClassBody block @", tok.getLine());
            break;
        }

        // save comments in hopes of javadoc
        var nextJavadoc = tok.getLastComment();
        if (nextJavadoc && !_javadoc)
            _javadoc = nextJavadoc
        else if (nextJavadoc)
            _javadoc += nextJavadoc;

        // what've we got here?
        token = tok.peekName();
        _log("In ClassBody block @", tok.getLine(), "peek=", token);
    
        // check for static block
        if (token == 'static') {
            if (tok.readBlockOpen()) {
                _mods = [];
                _javadoc = null;

                // yep, static block
                this.blocks.push(new Block(this, tok));
            } else {

                _mods.push(tok.readName());
                token = tok.peekName();
            }
        }

        if (Tokenizer.isModifier(token)) {
            _mods.push(tok.readName());
            continue;
        }

        if ("" == token) {
            if (tok.isAnnotation()) {
                _mods.push(new Annotations(this, tok));
                continue;
            } 

            if (tok.readSemicolon())
                continue; // ; can be a ClassBodyStatement

            _log("!!! WHAT! @", tok.getLine(),
                'token=', token,
                'nextClose=', tok.peekBlockClose(), 
                'nextSemi=', tok.peekSemicolon());

            tok._countBlank();
            _log('crazy=', tok._read(10));
            tok._rewindLastSkip();
            break; // TODO ?

        } else if ("class" == token) {
            this.subclasses.push(new Class(this, tok, _mods));
        } else if ("interface" == token) {
            this.subclasses.push(new Interface(this, tok, _mods));
        } else {
            var fom = this._parseFieldOrMethod(tok, _mods);
            if (!fom)
                break; // TODO ?

            if ('VarDef' == fom.constructor.name)
                this.fields.push(fom);
            else if ('Method' == fom.constructor.name)
                this.methods.push(fom);

            _log("JAVADOC for", fom.constructor.name, fom.name, _javadoc);
        }

        _mods = [];
        _javadoc = null;
        _log('peek=', _mods.join(' '), token);
    }

    this.end();
}
util.inherits(ClassBody, BlockLike);

ClassBody.prototype._parseFieldOrMethod = function(tok, modifiers) {

    var type = tok.readGeneric();
    var name = tok.readName();
    //_log('!!!fom=', modifiers.join(' '), type, name);

    if (tok.peekEquals() || tok.peekSemicolon()) {
        //_log("vardef!", type, name);
        var field = new VarDef(this, tok, type, name);
        field.modifiers = modifiers;
        return field;
    } else {
        //_log("method!", type, name, tok.getLine());
        //_log("mods:", modifiers);
        return new Method(this, tok, modifiers, type, name);
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
function Method(prev, tok, modifiers, returnType, name) {
    BlockLike.call(this, prev, tok);

    this.modifiers = modifiers;
    
    this.returnType = returnType;
    this.name = name;

    this.args = new ArgumentsDef(this, tok);

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
        this.body = new Block(this, tok);
    }

    this.end();
}
util.inherits(Method, BlockLike);

Method.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var type = this.body ? "Method" : "MethodDef";
    var buf = indent(level);
    buf += "[" + type + ":" + this.modifiers.dumpEach().join(' ')
        + " ``" + this.name + "'' " + this.dumpLine()
        + "\n" + indent(nextLevel) + this.args.dump()
        + (!this.throws ? '' : "\n" + indent(nextLevel) + "throws " + this.throws.join(','))
        + "\n" + indent(nextLevel) + " -> " + this.returnType;

    if (this.body)
        buf += this.body.dump(nextLevel);

    return buf + "\n" + indent(level) + "] // END " + this.name + "@" + this.line_end;
}


/**
 * A variable definition; could be 
 *  a field, a local variable, or even
 *  a method arg definition
 */
function VarDef(prev, tok, type, name) {
    SimpleNode.call(this, prev, tok);

    if (type) {
        this.type = type;
        this.name = name;
    } else {
        this.modifiers = [];

        if (tok.isAnnotation())
            this.modifiers.push(new Annotations(this, tok));

        while (tok.isModifier())
            this.modifiers.push(tok.readName());

        this.type = tok.readGeneric();
        this.name = tok.readName();
    }

    this.initializer = null;

    if (tok.peekExpressionEnd())
        return; // just defined; not initialized
    else if (tok.peekEquals())
        tok.expect(true, tok.readEquals);
    else {
        //_log("!!! Unexpected end of VarDef (?) @", tok.getLine());
        throw new Error("Unexpected end of VarDef (?) @" + tok.getLine() 
                + "; mods=" + this.modifiers 
                + "; type=" + this.type 
                + "; name=" + this.name
                + "; next=" + tok._read(10)
                );
        return; //
    }

    var value = tok.peekName();
    //_log('vardef=', type, name, value);
    
    if ('new' == value) {
        this.creator = new Creator(this, tok);
        tok.expect(true, tok.readSemicolon);
    } else {
        // TODO constant value
        _log("Read creator");
        this.creator = Expression.read(this, tok);
        tok.readSemicolon(); // the expression might've already read it
    }
}
util.inherits(VarDef, SimpleNode);

VarDef.prototype.dump = function(level) {
    var buf = indent(level);
    var mods = this.modifiers ? this.modifiers.join(' ') : "";
    var init = this.creator ? "\n" + indent(level+INDENT_LEVEL) + " = " + this.creator.dump() : "";
    return buf + "[VarDef:" + mods
        + " [" + this.type + "] ``" + this.name + "'' (@" + this.line + ")" 
        + init
        + "\n";
}


/**
 * "Creator" (Oracle's term)
 */
function Creator(prev, tok) {
    SimpleNode.call(this, prev, tok);

    tok.expect("new", tok.readName);
    var type = tok.readGeneric();
    this.initializer = '[new] ' + type; // TODO fancier
    this.args = new Arguments(this, tok);

    if (tok.peekBlockOpen()) {
        this.body = new ClassBody(this, tok);
    }
}
util.inherits(Creator, SimpleNode);

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
function Arguments(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.expressions = [];

    tok.expect(true, tok.readParenOpen);

    _log("Reading Arguments expressions @", tok.getLine());
    do {
        var expr = Expression.read(this, tok);
        if (!expr)
            break;

        this.expressions.push(expr);
    } while (tok.readComma());

    _log(this.dump());
    tok.expect(true, tok.readParenClose);
}
util.inherits(Arguments, SimpleNode);

Arguments.prototype.dump = function(level) {
    return "[ARGS:@" + this.line + " (" + this.expressions.dumpEach().join(" , ") + ")]";
}


/**
 * Arguments list definition: ex `(@annot final int var, @special java.lang.Class klass)`
 */
function ArgumentsDef(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.args = [];
    
    tok.expect(true, tok.readParenOpen);
    while (!tok.peekParenClose()) {
        this.args.push(new VarDef(this, tok));

        tok.readComma();
    }

    tok.expect(true, tok.readParenClose);
}
util.inherits(ArgumentsDef, SimpleNode);

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
function Annotations(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.annotations = [];

    while (tok.isAnnotation()) {
        this.annotations.push(new Annotation(this, tok));
    }
}
util.inherits(Annotation, SimpleNode);

Annotations.prototype.dump = function() {
    return "[ANNOT:@" + this.line + " [" +
        this.annotations.dumpEach().join("  ") + "]]";
}


function Annotation(prev, tok) {
    SimpleNode.call(this, prev, tok);

    tok.expect(true, tok.readAt);
    this.name = '@' + tok.readQualified();
    this.args = new AnnotationArguments(this, tok);
}
util.inherits(Annotation, SimpleNode);

Annotation.prototype.dump = function() {
    return this.name + this.args.dump();
}



function AnnotationArguments(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.expressions = [];

    if (!tok.peekParenOpen())
        return; // no args

    tok.expect(true, tok.readParenOpen);

    do {
        // FIXME: allow var=val
        this.expressions.push(Expression.read(this, tok));
    } while (tok.readComma());

    tok.expect(true, tok.readParenClose);

}
util.inherits(AnnotationArguments, SimpleNode);

AnnotationArguments.prototype.dump = function() {
    if (this.expressions.length) {
        return '(' + this.expressions.dumpEach().join(",") + ')';
    }

    return '';
}


/**
 * Code blocks!
 */
function Block(prev, tok) {
    BlockLike.call(this, prev, tok);

    tok.readBlockOpen();
    // _log("Block=", tok.readName(), tok.getLastComment());
    
    // read statements
    this.statements = new BlockStatements(this, tok);
    tok.readBlockClose();

    this.end();
    _log("\n\n!!!!End Block", this.dumpLine(), this.statements.dump(2));
}
util.inherits(Block, BlockLike);

Block.prototype.dump = function(level) {
    var buf = '\n' + indent(level) + '{' + this.dumpLine() + '\n';

    buf += this.statements.dump(level + INDENT_LEVEL);

    return buf + '\n' + indent(level) + '}';
}


/**
 * Body of a block
 */
function BlockStatements(prev, tok) {
    BlockLike.call(this, prev, tok);
    
    this.statements = [];

    while (!tok.peekBlockClose()) {

        var statement = Statement.read(this, tok);
        if (!statement)
            break;

        this.statements.push(statement);

        var next = tok.peekName();
        if (next == 'case' || next == 'default')
            break;
    }

    this.end();
}
util.inherits(BlockStatements, BlockLike);

BlockStatements.prototype.dump = function(level) {
    return dumpArray("Statements", this.statements, level);
}


/**
 * An individual statement (within a Block)
 */
function Statement(prev, tok, type) {
    BlockLike.call(this, prev, tok);

    this.type = type;

    this.kids = [];

    switch (type) {
    case "if":
        _log(">> IF! @", tok.getLine());
        this.parens = Statement.read(this, tok);
        this.kids.push(Statement.read(this, tok));
        //_log(this.kids.dumpEach());
        if (tok.peekName() == 'else') {
            tok.expect("else", tok.readName);
            this.kids.push(Statement.read(this, tok));
        }
        _log("<< IF! @", tok.getLine(), this.kids.dumpEach());
        break;

    case "switch":
        // this is like switch-ception... parsing 
        //  "switch" inside a switch
        _log("SWITCH! @", tok.getLine());
        this.parens = Statement.read(this, tok);
        tok.expect(true, tok.readBlockOpen);
        while (!tok.peekBlockClose()) {
            var type = tok.readName();
            if ('case' == type) {
                var expr = Expression.read(this, tok);
                tok.expect(true, tok.readColon);
                this.kids.push('case'); // TODO actually implement this type
                this.kids.push(expr);
            } else if ('default' == type) {
                tok.expect(true, tok.readColon);
                this.kids.push('default');
            } else 
                throw new Error("Unexpected statement within switch@", tok.getLine(), ":", type);

            if (tok.peekBlockOpen()) {
                this.kids.push(new Block(this, tok));
                continue;
            }

            var next = tok.peekName();
            if (!(next == 'case' || next == 'default'))
                this.kids.push(new BlockStatements(this, tok));
        }
        tok.expect(true, tok.readBlockClose);
        break;

    case "try":
        //_log("*** TRY!");
        this.kids.push(new Block(this, tok));
        _log("Next=", tok.peekName());
        while ("catch" == tok.peekName()) {
            //_log("*** CATCH!");
            tok.expect("catch", tok.readName);
            this.kids.push("catch");

            tok.expect(true, tok.readParenOpen);
            this.kids.push(new VarDef(this, tok));
            tok.expect(true, tok.readParenClose);

            this.kids.push(new Block(this, tok));
        }

        if ("finally" == tok.peekName()) {
            //_log("*** FINALLY!");
            tok.expect("finally", tok.readName);
            this.kids.push("finally");
            this.kids.push(new Block(this, tok));
        }
        break;

    case "for":
        this.parens = new ForControl(this, tok);
        this.kids.push(Statement.read(this, tok));
        break;

    case "return":
    case "continue":
    case "break":
        if (!tok.peekSemicolon())
            this.parens = Expression.read(this, tok);

        tok.readSemicolon();
        break;
    }

    this.end();
}
util.inherits(Statement, BlockLike);

Statement.prototype.dump = function(level) {
    var buf = indent(level) + '[STMT' + this.dumpLine() + ": " + this.type;
    if (this.parens)
        buf += this.parens.dump();

    if (this.kids.length) {
        buf += dumpArray('Contents', this.kids, level + INDENT_LEVEL);
    }

    return buf  + "]";
}

/** Factory; we might return VarDef, for example */
Statement.read = function(prev, tok) {
    if (tok.peekBlockOpen()) {

        // it's a block
        return new Block(prev, tok);

    } else if (tok.readParenOpen()) {

        // should we wrap this so we know?
        var expr = Expression.read(prev, tok);
        _log("ParExpression", expr);
        tok.expect(true, tok.readParenClose);
        return expr;
    } else if (tok.isControl()) {
        var control = tok.readName();
        return new Statement(prev, tok, control);
    } else if (tok.isModifier()) {
        // definitely a vardef, I think
        return new VarDef(prev, tok);
    } else if ((type = tok.peekGeneric())
            && (name = tok.peekName(type.length))) {
        
        tok.readGeneric();
        tok.readName();
        _log("Var def statement!", type, name);
        return new VarDef(prev, tok, type, name);
    } else {
        // some sort of expression
        var expr = Expression.read(prev, tok);
        tok.readSemicolon(); // may or may not be, here
        _log("Statement->expr", expr);
        return expr;
    }
}


/**
 * An expression 
 */
function Expression(prev, tok, value) {
    SimpleNode.call(this, prev, tok);

    this.value = tok.readQualified();

    if (tok.peekParenOpen()) {
        _log("METHOD CALL:", this.value);
        this.right = new Arguments(this, tok);
        return;
    }

    while (!tok.peekExpressionEnd()) {
        var read = tok.peekGeneric();
        if (read) {
            _log("@", tok.getLine(), "value=", this.value, "read=", read);
            if (read == 'new') {
                this.right = new Creator(this, tok);
                break;
            } else if (tok.peekParenOpen(read.length))
                // method call!
                this.right = new Expression(this, tok);
            else
                this.value += tok.readGeneric();

            _log('Expression Value=', this.value);
        } else if (tok.readEquals()) {
            // assignment
            this.value += ' [=] ';
            _log(this.value);
        } else {
            // FIXME what?
            _log("WHAT?", tok._peek());
            break;
        }
    }
}
util.inherits(Expression, SimpleNode);

Expression.read = function(prev, tok) {

    if (tok.peekParenOpen()) {
        var paren = new ParenExpression(prev, tok);
        if (tok.peekExpressionEnd())
            return paren;

        if (tok.readDot())
            return new ChainExpression(prev, tok, paren, '.');
        else if (tok.peekQuestion())
            return new TernaryExpression(prev, tok, paren);
        else
            return new ChainExpression(prev, tok, paren, ' ');
    } else if (tok.peekQuote()) {
        _log("Read string literal @", tok.getLine());
        return new LiteralExpression(prev, tok, tok.readString());
    } 

    var math = tok.readMath();
    if (math) {
        // lazy way to do an prefix expression
        return new ChainExpression(prev, tok, new LiteralExpression(prev, tok, math));
    }

    var name = tok.peekName();
    if (!name) {
        _log("Read expression missing name @", tok.getLine());
        return null;
    }

    if (name == 'new') {
        return new Creator(prev, tok);
    } else {

        var expr = new Expression(prev, tok);

        if (tok.readDot()) {
            // support chained method calls, eg: Foo.get().calculate().stuff();
            //_log(">> CHAINED FROM", expr.dump());
            var chain = new ChainExpression(prev, tok, expr, '.');
            //_log("<< CHAINED INTO", chain.dump());
            return chain;
        } 

        // allow maths, etc.
        var math = tok.readMath();
        //_log("MATH!?", math);
        if (math) {
            expr = new ChainExpression(prev, tok, expr, math);
        }

        if (tok.peekQuestion()) {
            return new TernaryExpression(prev, tok, expr);
        }

        return expr
    }
}


Expression.prototype.dump = function(level) {
    var buf = indent(level) + "[EXPR:@" + this.line + " " + this.value;

    if (this.right) {
        buf += this.right.dump(level);
    }
    
    return buf + "]";
}


/** Literal value, like a String */
function LiteralExpression(prev, tok, value) {
    SimpleNode.call(this, prev, tok);

    this.value = value;
}
util.inherits(LiteralExpression, SimpleNode);

LiteralExpression.prototype.dump = function() {
    return this.value;
}


/** Ex: (Bar) ((Foo) baz.getFoo()).getBar() */
function ParenExpression(prev, tok, left) {
    BlockLike.call(this, prev, tok);

    //_log("CAST EXPRESSION!!!!");
    tok.expect(true, tok.readParenOpen);

    this.left = left
        ? left
        : Expression.read(this, tok);

    if (!tok.peekParenClose())
        _log(">>> Left=", this.left.dump());
    tok.expect(true, tok.readParenClose);

    //if (!tok.peekExpressionEnd())
    //    this.right = Expression.read(path, tok);
}
util.inherits(ParenExpression, BlockLike);

ParenExpression.prototype.dump = function() {
    return "(" + this.left.dump() + ")" + (this.right ? this.right.dump() : "");
}


/** Ex: Foo.getBar().getBaz(), or even a + b */
function ChainExpression(prev, tok, left, link) {
    BlockLike.call(this, prev, tok);

    this.left = left;
    if (link == '++' || link == '--') {
        // simple postfix expression
        this.link = '';
        this.right = new LiteralExpression(this, tok, link);
    } else {
        this.link = link;
        this.right = Expression.read(this, tok);
    }
}
util.inherits(ChainExpression, BlockLike);

ChainExpression.prototype.dump = function(level) {
    var link = this.link
        ? " [" + this.link + "] "
        : '';
    return indent(level) + this.left.dump() + link + (this.right ? this.right.dump() : "<NULL>");
}


/** ex: a ? b : c */
function TernaryExpression(prev, tok, paren) {
    BlockLike.call(this, prev, tok);

    this.paren = paren;
    tok.expect(true, tok.readQuestion);
    this.left = Expression.read(this, tok);
    tok.expect(true, tok.readColon);
    this.right = Expression.read(this, tok);
}
util.inherits(TernaryExpression, BlockLike);

TernaryExpression.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    return indent(level) + this.paren.dump() 
        + "\n" + indent(nextLevel) + "[?]" + (this.left ? this.left.dump() : "<NULL>")
        + "\n" + indent(nextLevel) + "[:]" + (this.right ? this.right.dump() : "<NULL>");
}


function ForControl(prev, tok) {
    SimpleNode.call(this, prev, tok);

    tok.expect(true, tok.readParenOpen);
    var varDef = new VarDef(this, tok);

    if (tok.readColon()) {
        this.type = ForControl.ENHANCED;
        this.init = varDef;
        this.source = Expression.read(this, tok);
        tok.expect(true, tok.readParenClose);
    } else {
        this.type = ForControl.NORMAL;

        // NB: VarDef eats the trailing semicolon!
        this.inits = [varDef];
        if (tok.peekComma()) {
            do {
                inits.push(Expression.read(this, tok));
            } while (!tok.readSemicolon());
        }

        this.condition = null;
        if (!tok.readSemicolon()) {
            condition = Expression.read(this, tok);
        }

        this.updates = []
        while (!tok.readParenClose()) {
            this.updates.push(Expression.read(this, tok));

            tok.readComma();
        }

        console.log("inits=", this.inits.dumpEach());
        console.log("condition=", dump(this.condition));
        console.log("updates=", this.updates.dumpEach());
        //throw new Error("Normal for(;;) not supported yet");
    }
}
util.inherits(ForControl, SimpleNode);

ForControl.prototype.dump = function(level) {

    var buf = indent(level) + "(";

    if (this.type == ForControl.ENHANCED) {
        buf += this.init.dump() + " : " + this.source.dump()
    } else if (this.type == ForControl.NORMAL) {

        buf += this.inits.dumpEach().join(",")
            + ";" + dump(this.condition, "")
            + ";" + this.updates.dumpEach().join(",");
    }

    return buf + ")";
}

ForControl.ENHANCED = 1;
ForControl.NORMAL   = 2;

module.exports = Ast;
