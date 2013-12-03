
var fs = require('fs')
    , Tokenizer = require('./tokenizer');

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

    this._path = path;
    this.line = tok.getLine();
    this.modifiers = modifiers ? modifiers.slice() : [];
    this.superclass = null;
    this.interfaces = [];

    this.subclasses = [];
    this.fields = [];
    this.methods = [];

    if (!modifiers) {
        // only look if they weren't provided
        while (tok.isModifier())
            this.modifiers.push(tok.readName());
    }

    // should be a class!
    tok.expect("class", tok.peekName);

    tok.readName(); // read "class"
    this.name = tok.readGeneric(); // class name (of course)

    if (!tok.readBlockOpen()) { // opening block

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
        if (!tok.readBlockOpen())
            throw "Expected ``{'' but was ``" + tok.readName() + "''";
    }

    var _mods = []; // workspace

    // read in the body
    for (;;) {
        if (tok.readBlockClose())
            break;

        // what've we got here?
        token = tok.peekName();

        // check for static block
        if (token == 'static') {
            _mods.push(tok.readName());
            if (tok.readBlockOpen()) {
                _mods = [];
                // yep, static block
                throw "STATIC BLOCK"; // TODO static blocks
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
        }

        _mods = [];
        console.log('peek=', _mods.join(' '), token);
    }
}

Class.prototype._parseFieldOrMethod = function(path, tok, modifiers) {

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

Class.prototype.dump = function(level) {
    var nextLevel = level + 2;
    var parentsLevel = nextLevel + 2;
    var buf = indent(level);
    buf += "[Class:" + this.modifiers.join(' ') 
        + " ``" + this.name + "'' (@" + this.line + ")";

    if (this.superclass)
        buf += "\n" + indent(parentsLevel) + "extends [" + this.superclass + "]";

    if (this.interfaces.length > 0)         
        buf += "\n" + indent(parentsLevel) + "implements [" + this.interfaces.join(", ") + "]";

    buf += dumpArray("Subclasses", this.subclasses, nextLevel);
    buf += dumpArray("Fields", this.fields, nextLevel);
    buf += dumpArray("Methods", this.methods, nextLevel);

    return buf + "\n" + indent(level) + "]";
}


/**
 * Method in a class
 */
function Method(path, tok, modifiers, returnType, name) {
    this._path = path;
    this.line = tok.getLine();
    this.modifiers = modifiers;
    
    this.returnType = returnType;
    this.name = name;
}

Method.prototype.dump = function(level) {
    var nextLevel = level + 2;
    var buf = indent(level);
    buf += "[Method:" + this.modifiers.join(' ')
        + " ``" + this.name + "'' (@" + this.line + ")";
        + "\n" + indent(nextLevel) + " -> " + this.returnType;

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

    this.type = type;
    this.name = name;

    this.initializer = null;

    if (tok.readSemicolon() || tok.peekComma() || tok.peekParenClose())
        return; // just defined; not initialized
    else if (!tok.readEquals())
        tok.expect(true, tok.readEquals);

    var value = tok.peekName();
    console.log('vardef=', type, name, value);
    
    if ('new' == value) {
        this._parseInstantiation(tok);
    } else {
        // TODO constant value
        this.initializer = tok.readName(); // FIXME
    }
}

VarDef.prototype.dump = function(level) {
    var buf = indent(level);
    var mods = this.modifiers ? this.modifiers.join(' ') : "";
    var init = this.initializer ? "\n" + indent(level+2) + this.initializer : "";
    init += this.args ? this.args.dump() : "";
    return buf + "[VarDef:" + mods
        + " [" + this.type + "] ``" + this.name + "'' (@" + this.line + ")" 
        + init
        + "\n";
}

VarDef.prototype._parseInstantiation = function(tok) {

    tok.expect("new", tok.readName);
    var type = tok.readGeneric();
    this.initializer = '= [new] ' + type; // TODO fancier
    this.args = new Arguments(tok);
    
    tok.expect(true, tok.readSemicolon);
    //console.log("Instantiate!", type, this.args);
}


/**
 * Arguments list, ex: `(var1, 2, 3)`
 */
function Arguments(tok) {

    this.line = tok.getLine();
    this.expressions = [];

    tok.expect(true, tok.readParenOpen);

    do {
        // FIXME: allow instantiations, maths, etc.
        this.expressions.push(tok.readName());
    } while (tok.readComma());

    tok.expect(true, tok.readParenClose);
}

Arguments.prototype.dump = function(level) {
    return "[ARGS:@" + this.line + " [" + this.expressions.join("] , [") + "]]";
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


module.exports = Ast;
