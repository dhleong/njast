
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
        console.log('type = ' + type);
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
    var buf = "[JavaFile: package " + this.package + ";\n";
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

        if ("class" == token) {
            this.subclasses.push(new Class(path, tok, _mods));
        } else {
            var fom = this._parseFieldOrMethod(tok, _mods);
            if (!fom)
                break; // TODO ?

            if ('Field' == fom.constructor.name)
                this.fields.push(fom);
            else if ('Method' == fom.constructor.name)
                this.methods.push(fom);

            break;
        }

        _mods = [];
        console.log('peek=', _mods.join(' '), token);
    }
}

Class.prototype._parseFieldOrMethod = function(tok, modifiers) {

    var type = tok.readGeneric();
    var name = tok.readName();
    console.log('fom=', modifiers.join(' '), type, name);

    if (tok.readEquals()) {
        return this._parseFieldAssignment(tok, modifiers, type, name);
    } else if (tok.readSemicolon()) {
        return new Field(tok, modifiers, type, name);
    } else {
        // method
        return null;
    }
};

Class.prototype._parseFieldAssignment = function(tok, modifiers, type, name) {

    var field = new Field(tok, modifiers, type, name);
    var value = tok.peekName();
    console.log('field=', modifiers.join(' '), type, name);
    
    if ('new' == value) {
        // FIXME initialize value
    } else {
        // constant value
        
    }

    return field;
}

Class.prototype.dump = function(level) {
    var nextLevel = level + 2;
    var buf = indent(level);
    buf += "[Class:" + this.modifiers.join(' ') 
        + " ``" + this.name + "'' (@" + this.line + ")";

    if (this.superclass)
        buf += "\n" + indent(nextLevel) + "extends [" + this.superclass + "]";

    if (this.interfaces.length > 0) {
        buf += "\n" + indent(nextLevel) + "implements [" + this.interfaces.join(", ") + "]";
    }

    buf += dumpArray("Subclasses", this.subclasses, nextLevel);
    buf += dumpArray("Fields", this.fields, nextLevel);

    return buf + "\n" + indent(level) + "]";
}

function Field(tok, modifiers, type, name) {
    this.modifiers = modifiers ? modifiers : [];
    this.type = type;
    this.name = name;
    this.line = tok.getLine();
}

Field.prototype.dump = function(level) {
    var buf = indent(level);
    return buf + "[Field:" + this.modifiers.join(' ')
        + " [" + this.type + "] ``" + this.name + "'' (@" + this.line + ")";
}

module.exports = Ast;
