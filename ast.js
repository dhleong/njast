
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

    /* TODO restore; hidden for testing convenience
    this.imports.forEach(function(i) {
        buf += 'import ' + i + ";\n";
    });
    */

    buf += "\nClasses:\n";
    this.classes.forEach(function(cl) {
        buf += cl.dump(2) + "\n";
    });

    return buf + "] // END " + this._path;
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

    this.body = new ClassBody(path, tok);

    this.end();
    console.log("End ClassBody", this.dumpLine());
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
function Interface(path, tok, modifiers) {
    BlockLike.call(this, path, tok);

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

    this.body = new ClassBody(path, tok); // lazy

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
        if (tok.readBlockClose()) {
            console.log("!! Close ClassBody block @", tok.getLine());
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
        console.log("In ClassBody block @", tok.getLine(), "peek=", token);
    
        // check for static block
        if (token == 'static') {
            if (tok.readBlockOpen()) {
                _mods = [];
                _javadoc = null;

                // yep, static block
                this.blocks.push(new Block(path, tok));
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
                _mods.push(new Annotations(tok));
                continue;
            } 

            if (tok.readSemicolon())
                continue; // ; can be a ClassBodyStatement

            console.log("!!! WHAT! nextClose=", tok.peekBlockClose(), 
                'nextSemi=', tok.peekSemicolon(),
                tok.getLine());
            break; // TODO ?

        } else if ("class" == token) {
            this.subclasses.push(new Class(path, tok, _mods));
        } else if ("interface" == token) {
            this.subclasses.push(new Interface(path, tok, _mods));
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
    else if (tok.peekEquals())
        tok.expect(true, tok.readEquals);
    else {
        //console.log("!!! Unexpected end of VarDef (?) @", tok.getLine());
        throw new Error("Unexpected end of VarDef (?) @" + tok.getLine());        
        return; //
    }

    var value = tok.peekName();
    //console.log('vardef=', type, name, value);
    
    if ('new' == value) {
        this.creator = new Creator(path, tok);
        tok.expect(true, tok.readSemicolon);
    } else {
        // TODO constant value
        console.log("Read creator");
        this.creator = Expression.read(path, tok);
        tok.readSemicolon(); // the expression might've already read it
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

    console.log("Reading Arguments expressions @", tok.getLine());
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

Annotations.prototype.dump = function() {
    return "[ANNOT:@" + this.line + " [" +
        this.annotations.dumpEach().join("  ") + "]]";
}


function Annotation(tok) {
    this.line = tok.getLine();

    tok.expect(true, tok.readAt);
    this.name = '@' + tok.readQualified();
    this.args = new AnnotationArguments(tok);
}

Annotation.prototype.dump = function() {
    return this.name + this.args.dump();
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

AnnotationArguments.prototype.dump = function() {
    if (this.expressions.length) {
        return '(' + this.expressions.join(",") + ')';
    }

    return '';
}


/**
 * Code blocks!
 */
function Block(path, tok) {
    BlockLike.call(this, path, tok);

    tok.readBlockOpen();
    // console.log("Block=", tok.readName(), tok.getLastComment());
    
    // read statements
    this.statements = new BlockStatements(path, tok);
    tok.readBlockClose();

    this.end();
    console.log("\n\n!!!!End Block", this.dumpLine(), this.statements.dump(2));
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
function BlockStatements(path, tok) {
    BlockLike.call(this, path, tok);
    
    this.statements = [];

    while (!tok.peekBlockClose()) {

        var statement = Statement.read(path, tok);
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
function Statement(path, tok, type) {
    BlockLike.call(this, path, tok);

    this.type = type;

    this.kids = [];

    switch (type) {
    case "if":
        console.log(">> IF! @", tok.getLine());
        this.parens = Statement.read(path, tok);
        this.kids.push(Statement.read(path, tok));
        //console.log(this.kids.dumpEach());
        if (tok.peekName() == 'else') {
            tok.expect("else", tok.readName);
            this.kids.push(Statement.read(path, tok));
        }
        console.log("<< IF! @", tok.getLine(), this.kids.dumpEach());
        break;

    case "switch":
        // this is like switch-ception... parsing 
        //  "switch" inside a switch
        console.log("SWITCH! @", tok.getLine());
        this.parens = Statement.read(path, tok);
        tok.expect(true, tok.readBlockOpen);
        while (!tok.peekBlockClose()) {
            var type = tok.readName();
            if ('case' == type) {
                var expr = Expression.read(path, tok);
                tok.expect(true, tok.readColon);
                this.kids.push('case'); // TODO actually implement this type
                this.kids.push(expr);
            } else if ('default' == type) {
                tok.expect(true, tok.readColon);
                this.kids.push('default');
            } else 
                throw new Error("Unexpected statement within switch@", tok.getLine(), ":", type);

            if (tok.peekBlockOpen()) {
                this.kids.push(new Block(path, tok));
                continue;
            }

            var next = tok.peekName();
            if (!(next == 'case' || next == 'default'))
                this.kids.push(new BlockStatements(path, tok));
        }
        tok.expect(true, tok.readBlockClose);
        break;

    case "try":
        //console.log("*** TRY!");
        this.kids.push(new Block(path, tok));
        console.log("Next=", tok.peekName());
        while ("catch" == tok.peekName()) {
            //console.log("*** CATCH!");
            tok.expect("catch", tok.readName);
            this.kids.push("catch");

            tok.expect(true, tok.readParenOpen);
            this.kids.push(new VarDef(path, tok));
            tok.expect(true, tok.readParenClose);

            this.kids.push(new Block(path, tok));
        }

        if ("finally" == tok.peekName()) {
            //console.log("*** FINALLY!");
            tok.expect("finally", tok.readName);
            this.kids.push("finally");
            this.kids.push(new Block(path, tok));
        }
        break;

    case "for":
        tok.expect(true, tok.readParenOpen);
        var varDef = new VarDef(path, tok);

        if (tok.readColon()) {
            this.parens = new ChainExpression(path, tok, varDef, ":");
            tok.expect(true, tok.readParenClose);
            this.kids.push(Statement.read(path, tok));
        } else if (tok.readSemicolon()) {
            throw new Error("Normal for(;;) not supported yet");
        }
        break;

    case "return":
    case "continue":
    case "break":
        if (!tok.peekSemicolon())
            this.parens = Expression.read(path, tok);

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
Statement.read = function(path, tok) {
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
        var expr = Expression.read(path, tok);
        tok.readSemicolon(); // may or may not be, here
        console.log("Statement->expr", expr);
        return expr;
    }
}


/**
 * An expression 
 */
function Expression(path, tok, value) {
    this.line = tok.getLine();

    this.value = tok.readQualified();

    if (tok.peekParenOpen()) {
        console.log("METHOD CALL:", this.value);
        this.right = new Arguments(path, tok);
        return;
    }

    while (!tok.peekExpressionEnd()) {
        var read = tok.peekGeneric();
        if (read) {
            console.log("@", tok.getLine(), "value=", this.value, "read=", read);
            if (read == 'new') {
                this.right = new Creator(path, tok);
                break;
            } else if (tok.peekParenOpen(read.length))
                // method call!
                this.right = new Expression(path, tok);
            else
                this.value += tok.readGeneric();

            console.log('Expression Value=', this.value);
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

Expression.read = function(path, tok) {

    if (tok.peekParenOpen()) {
        return new CastExpression(path, tok);
    } else if (tok.peekQuote()) {
        console.log("Read string literal @", tok.getLine());
        return new LiteralExpression(tok, tok.readString());
    }

    var name = tok.peekName();
    if (!name) {
        console.log("Read expression missing name @", tok.getLine());
        return null;
    }

    if (name == 'new') {
        return new Creator(path, tok);
    } else {

        var expr = new Expression(path, tok);

        if (tok.readDot()) {
            // support chained method calls, eg: Foo.get().calculate().stuff();
            //console.log(">> CHAINED FROM", expr.dump());
            var chain = new ChainExpression(path, tok, expr, '.');
            //console.log("<< CHAINED INTO", chain.dump());
            return chain;
        }

        // FIXME: allow maths, etc.
        var math = tok.readMath();
        console.log("MATH!?", math);
        if (math) {
            var chain = new ChainExpression(path, tok, expr, math);
            return chain;
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
function LiteralExpression(tok, value) {
    this.line = tok.getLine();
    this.value = value;
}

LiteralExpression.prototype.dump = function() {
    return this.value;
}

/** Ex: (Bar) ((Foo) baz.getFoo()).getBar() */
function CastExpression(path, tok) {
    BlockLike.call(this, path, tok);

    //console.log("CAST EXPRESSION!!!!");
    tok.expect(true, tok.readParenOpen);
    this.cast = Expression.read(path, tok);
    tok.expect(true, tok.readParenClose);

    this.right = Expression.read(path, tok);
}
util.inherits(CastExpression, BlockLike);

CastExpression.prototype.dump = function() {
    return "(" + this.cast.dump() + ") " + this.right.dump();
}



/** Ex: Foo.getBar().getBaz(), or even a + b */
function ChainExpression(path, tok, left, link) {
    BlockLike.call(this, path, tok);

    this.left = left;
    this.link = link;
    this.right = Expression.read(path, tok);
}
util.inherits(ChainExpression, BlockLike);

ChainExpression.prototype.dump = function(level) {
    return indent(level) + this.left.dump() + " [" + this.link + "] " + this.right.dump();
}

module.exports = Ast;
