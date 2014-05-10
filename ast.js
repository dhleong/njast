
var util = require('util')
    , events = require('events')
    , Tokenizer = require('./tokenizer');

var INDENT_LEVEL = 2;

var DEBUG = false;

var _log = DEBUG
    ? function() { console.log.apply(console.log, arguments); }
    : function() { }

function indent(level) {
    var buf = "";
    level = level ? level : 0;
    for (var i=0; i < level; i++)
        buf += ' ';

    return buf;
}

function _stringifyModifiers(modifiers) {
    return modifiers.filter(function(mod) {
        return typeof(mod) == 'string';
    }).join(' ');
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


Array.prototype._publishEach = function publishEach() {
    this.forEach(function(el) {
        el.publish();
    });
}

String.prototype.endsWith = function(value) {
    var N = this.length;
    if (value.length > N)
        return false;
    else if (value.length == N)
        return this == value;

    for (var i=N - value.length, j=0; i < N; i++, j++) {
        if (this[i] != value[j])
            return false;
    }

    return true;
}

/**
 * Constructs Ast root. 
 *
 * Events:
 *  method, interface, class - Emit'd when a
 *      type such a type is completely parsed
 *  vardef - Emit'd when a variable is defined
 *  toplevel - Emit'd as soon as the `extends`
 *      and `implements` information for a toplevel
 *      class (IE: one at the top level of the file)
 *      is parsed. The body of the class will NOT
 *      be available yet (wait for the `class` event
 *      if you need that)
 *
 * @param path FS path of the file to parse
 * @param buffer A Buffer with the contents of path
 */
function Ast(path, buffer) {
    this._path = path;
    this._fp = buffer;

    this.tok = new Tokenizer(this._fp);
    this._root = new JavaFile(this, this.tok);

    this.qualifieds = {};

    var self = this;
    var saveQualified = function(obj) {
        self.qualifieds[obj.qualifiedName] = obj;
    };

    // TODO listen to and save our own events,
    //  so we can replay them later without
    //  having to re-parse
    this.on('class', saveQualified)
        .on('method', saveQualified)
        .on('toplevel', function(toplevel) {
            saveQualified(toplevel);
            self.toplevel = toplevel;
        });
}
util.inherits(Ast, events.EventEmitter);

// wrap "emit" and record events
Ast.prototype._parentEmit = Ast.prototype.emit;
Ast.prototype.emit = function() {
    var args = Array.prototype.slice.apply(arguments);

    if (!this._parsed)
        this._replay.push(args);

    Ast.prototype._parentEmit.apply(this, args);
};

/**
 * Given a fully-qualified className, such as
 *  com.bar.Cool$Hot, extracts a nested class and
 *  returns a Class node just for that class. 
 *
 * This Ast MUST have already been parsed. It is
 *  an error to call this on a non-parsed Ast
 */
Ast.prototype.extractClass = function(className) {

    if (!this._parsed)
        throw new Error("Ast has not been parsed yet");

    if (className in this.qualifieds) {
        var node = this.qualifieds[className].extractInfo();
        return node;
    }

    return null;
};


Ast.prototype.parse = function(callback) {
    if (this._replay) {

        // if we're already parsed,
        //  just replay the events we emit'd
        var self = this;
        this._replay.forEach(function(args) {
            Ast.prototype._parentEmit.apply(self, args)
        });
    } else {

        // parse
        this._replay = [];
        this._root.parse();
        this._parsed = true;
        this.tok.reset(); // reset buffer
    }

    if (callback)
        callback(this);

    return this;
}

/**
 * File name of this Ast root
 */
Ast.prototype.getPath = function() {
    return this._path;
}

Ast.prototype.getParent = function() {
    return null; // Ast is the root node
};


/**
 * Return a string representing the AST
 */
Ast.prototype.dump = function() {
    return this._root.dump();
}

/**
 * Resolve the fully-qualified type path
 *  for the given type.
 *
 * Inner classes and classes within the
 *  same package cannot be confidently
 *  resolved until the AST is completely parsed
 *  (since the declaration of inner classes
 *  may be *after* a reference). In such
 *  a case, "null" will be returned, indicating
 *  that the resolve should be attempted again later
 */
Ast.prototype.resolveType = function(type) {
    
    if (Tokenizer.isPrimitive(type))
        return type;

    var full = this._root.namedImports[type];
    if (full)
        return full.path;

    if (type in this.qualifieds)
        return type; // already fully-qualified

    if (!this._parsed)
        return null;

    var path = this._root.package;

    function pathify(klass) {
        return [this, klass];
    }

    // Loop through nested classes
    var r = this._root.classes.map(pathify.bind(path));
    while (r.length > 0) {
        var obj = r.pop();
        var subpath = obj[0];
        var klass = obj[1];

        var connector = subpath == path ? '.' : '$';
        subpath = subpath + connector + klass.name;
        if (klass.name == type)
            return subpath; // gotcha!

        // nope... recurse
        if (klass.body.subclasses) {
            var kids = klass.body.subclasses.map(pathify.bind(subpath));
            r = r.concat(kids);
        }
    }

    // must be another class in this package (?)
    return path + '.' + type;
}


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
    this.line = tok.getLine(true);
}

SimpleNode.prototype.contains = function(lineNo) {
    return this.line === lineNo;
}

SimpleNode.prototype.extractTypeInfo = function(/*word, line, col*/) {
    return undefined;
}

SimpleNode.prototype.getContainingClass = function() {
    var parent = this.getParent();
    while (parent && !(parent instanceof Class)) {
        parent = parent.getParent();
    }

    return parent;
}

SimpleNode.prototype.getLocalScope = function() {

    var parent = this.getParent();
    while (!(parent instanceof BlockLike)) {
        parent = parent.getParent();
    }

    return parent;
}

SimpleNode.prototype.getScope = function() {

    var parent = this.getParent();
    while (parent && !(parent instanceof ScopeLike)) {
        parent = parent.getParent();
    }

    return parent;
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
}

/**
 * Superclass for block-like things
 */
function BlockLike(prev, tok) {
    SimpleNode.call(this, prev, tok);

    this.line_end = this.line; // for now
}
util.inherits(BlockLike, SimpleNode);

BlockLike.prototype.contains = function(lineNo) {
    if (lineNo < this.line)
        return false; // definitely not

    if (!this._ended) {
        // haven't finished!
        // TODO doesn't *quite* work....
        return lineNo <= this.tok.getLine();
    }

    // finished parsing
    return lineNo <= this.line_end;
}

BlockLike.prototype.dumpLine = function() {
    if (!this._ended)
        return "(@" + this.line + " ~ " + this.tok.getLine() + ")";
    return "(@" + this.line + " ~ " + this.line_end + ")";
}

/** Call when done processing */
BlockLike.prototype.end = function() {
    if (this._ended)
        throw new Error("Already called end");
    this._ended = true;

    this.line_end = this.tok.getLine();

    this.publish();
}

/**
 * Superclass for things that might hold
 *  VarDefs. 
 */
function ScopeLike(prev, tok) {
    BlockLike.call(this, prev, tok);
}
util.inherits(ScopeLike, BlockLike);

/**
 * implement this method to return an array
 * of VarDefs to use the default functionality
 */
ScopeLike.prototype._getVars = undefined;

ScopeLike.prototype.getVar = function(varName) {
    if (!this._getVars)
        throw new Error(this.constructor.name 
            + " does not implement getVar! Cannot find " + varName);

    var varDefs = this._getVars();
    var len = varDefs.length;
    for (var i=0; i < len; i++) {
        var f = varDefs[i];
        if (f.name == varName)
            return f;
    }
};

/**
 * implement this method to return an array
 * of VarDefs to use the default functionality
 */
ScopeLike.prototype._getMethods = undefined;

ScopeLike.prototype.getMethod = function(methodName) {
    if (!this._getMethods)
        throw new Error(this.constructor.name 
            + " does not implement getMethod! Cannot find " + methodName);

    var methods = this._getMethods();
    var len = methods.length;
    for (var i=0; i < len; i++) {
        var m = methods[i];
        if (m.name == methodName)
            return m;
    }
};


/**
 * Root "Java File" obj; contains
 *  top-level classes, imports, and package
 */
function JavaFile(root, tok) {
    SimpleNode.call(this, root, tok);

    this.package = '<default>';
    this.imports = [];
    this.classes = [];
    this.namedImports = {};
}
util.inherits(JavaFile, SimpleNode);

/** 
 * JavaFile is explicitly parsed separately 
 *  from instantiation so it can be
 *  accessed from Ast root
 */
JavaFile.prototype.parse = function() {
    
    var tok = this.tok;

    // parse the file
    for (;;) {
        var type = tok.peekName();
        //_log('type = ' + type);
        if (type == 'package') {
            tok.readName();
            this.package = tok.readQualified();
            tok.readSemicolon();
        } else if (type == 'import') {
            var obj = new Import(this, tok);
            this.imports.push(obj);

            if (obj.name)
                this.namedImports[obj.name] = obj;
        } else {
            var klass = new Class(this, tok);
            this.classes.push(klass);

            // TODO save refs to all "tags" 
            break; // FIXME temporary, to prevent unwanted processing for now
        }
    }
}

JavaFile.prototype.dump = function() {
    var buf = "[JavaFile:package " + this.package + ";\n";

    buf += dumpArray("Imports", this.imports, 0);
    buf += dumpArray("Classes", this.classes, 0);

    return buf + "] // END " + this.getPath();
}


function Import(root, tok) {
    SimpleNode.call(this, root, tok);

    tok.readName();
    if (tok.peekName() == 'static') {
        this.isStatic = true;
        tok.readName();
    }

    this.path = tok.readQualified();
    
    if (tok.readStar()) {
        this.isStar = true;
        this.path = this.path.substr(0, this.path.length-1);
        this.name = null; // I guess?
    } else {
        var lastDot = this.path.lastIndexOf('.');
        this.name = this.path.substr(lastDot+1);
    }

    tok.readSemicolon();
}
util.inherits(Import, SimpleNode);

Import.prototype.dump = function(level) {
    return indent(level) + 'import ' 
        + (this.isStatic ? 'static ' : '')
        + this.path 
        + (this.isStar ? '[.*]' : '');
}

/**
 * A java class
 * @param prev The previous (parent) node in the AST
 * @param tok A Tokenizer
 */
function Class(prev, tok, modifiers, javadoc) {
    BlockLike.call(this, prev, tok);

    this.modifiers = modifiers ? modifiers.slice() : [];
    this.superclass = null;
    this.interfaces = [];
    this.javadoc = javadoc;

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
    this.simpleName = generic == -1
        ? this.name
        : this.name.substr(0, generic);
    // generic name is resolved below

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

    if (this.getParent() instanceof JavaFile) {
        var generic = this.name.indexOf('<');
        this.qualifiedName = this.getParent().package + '.' + this.simpleName;

        this.getRoot().emit('toplevel', this);
    } else {
        // parent is a ClassBody; grandparent is a Class/Interface
        this.qualifiedName = this.getParent().getParent().qualifiedName
                           + '$' + this.simpleName;
    }

    this.body = new ClassBody(this, tok, this.qualifiedName);

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

Class.prototype.extractInfo = function() {
    var body = this.body ? this.body.extractInfo() : {};
    body.name = this.name;
    body.javadoc = this.javadoc;
    body.superclass = this.superclass;
    body.interfaces = this.interfaces;
    return body;
};


/**
 * A java interface
 */
function Interface(prev, tok, modifiers, javadoc) {
    BlockLike.call(this, prev, tok);

    this.modifiers = modifiers ? modifiers.slice() : [];
    this.interfaces = [];
    this.javadoc = javadoc;

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

Interface.prototype.extractInfo = function() {
    var body = this.body.extractInfo();
    body.name = this.name;
    body.javadoc = this.javadoc;
    body.interfaces = this.interfaces;
    return body;
};



/**
 * The body of a class (extracted for anonymous classes!)
 */
function ClassBody(prev, tok, qualifiedName) {
    ScopeLike.call(this, prev, tok);

    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];
    this.qualifiedName = qualifiedName; // if provided, the qn of our class

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
        var token = tok.peekName();
        _log("In ClassBody block @", tok.getLine(), "peek=", token);
    
        // check for static block
        if (token == 'static') {
            token = tok.readName();
            if (tok.readBlockOpen()) {
                _mods = [];
                _javadoc = null;

                // yep, static block
                _log("Read STATIC block!");
                this.blocks.push(new Block(this, tok));
            } else {

                _mods.push(token);
                token = tok.peekName();
            }
        }

        if (Tokenizer.isModifier(token)) {
            _mods.push(tok.readName());
            continue;
        }

        if ("" === token) {
            if (tok.isAnnotation()) {
                _mods.push(new Annotations(this, tok));
                continue;
            } 

            if (tok.readSemicolon())
                continue; // ; can be a ClassBodyStatement

            if (DEBUG) {
                _log("!!! WHAT! @", tok.getLine(),
                    'token=', token,
                    'nextClose=', tok.peekBlockClose(), 
                    'nextSemi=', tok.peekSemicolon());
            }

            tok._countBlank();
            //_log('crazy=', tok._read(10));
            // tok._rewindLastSkip();
            break; // TODO ?

        } else if ("class" == token) {
            this.subclasses.push(new Class(this, tok, _mods, _javadoc));
        } else if ("interface" == token) {
            this.subclasses.push(new Interface(this, tok, _mods, _javadoc));
        } else {
            var fom = this._parseFieldOrMethod(tok, _mods);
            if (!fom) {
                if (DEBUG) _log("Couldn't parse fom @", tok.getLine());
                break; // TODO ?
            }

            if ('VarDef' == fom.constructor.name)
                this.fields.push(fom);
            else if ('Method' == fom.constructor.name)
                this.methods.push(fom);

            _log("JAVADOC for", fom.constructor.name, fom.name, _javadoc);
            if (_javadoc)
                fom.javadoc = _javadoc;
        }

        _mods = [];
        _javadoc = null;
        if (DEBUG) _log('peek=', _mods.join(' '), token);
    }

    this.end();

    this.fields._publishEach();
    this.methods._publishEach();
}
util.inherits(ClassBody, ScopeLike);

ClassBody.prototype._parseFieldOrMethod = function(tok, modifiers) {

    var type = tok.readGeneric();
    while (tok.readBracketOpen()) {
        type += "[]"; // lazy!
        tok.expect(true, tok.readBracketClose);
    }
    var name = tok.readName();
    //_log('!!!fom=', modifiers.join(' '), type, name);

    if (tok.peekEquals() 
            || tok.peekSemicolon()) {
        //_log("vardef!", type, name);
        // TODO should this be VarDefs ?
        var field = new VarDef(this, tok, type, name);
        field.modifiers = modifiers;
        return field;
    } else {
        //_log("method! type=", type, 'name=', name, tok.getLine());
        //_log("mods:", modifiers);
        return new Method(this, tok, modifiers, type, name);
    }
};

ClassBody.prototype._getVars = function() {
    return this.fields;
};

ClassBody.prototype._getMethods = function() {
    return this.methods;
};



ClassBody.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var buf = indent(level) + " {" + this.dumpLine();
    buf += dumpArray("Subclasses", this.subclasses, nextLevel);
    buf += dumpArray("Fields", this.fields, nextLevel);
    buf += dumpArray("Methods", this.methods, nextLevel);
    return buf + "\n" + indent(level) + "}";
}

ClassBody.prototype.extractInfo = function() {
    return {
        subclasses: this.subclasses.map(function(subclass) {
            return subclass.extractInfo();
        })
      , fields: this.fields.reduce(function(result, field) {
            var infos = field.extractInfo();
            if (Array.isArray(infos))
                result = result.concat(infos)
            else
                result.push(infos);
            return result;
        }, [])
      , methods: this.methods.map(function(method) {
            return method.extractInfo();
        })
    };
};


/**
 * Method in a class
 */
function Method(prev, tok, modifiers, returnType, name) {
    ScopeLike.call(this, prev, tok);

    this.modifiers = modifiers;
    
    if (name) {
        this.returnType = returnType;
        this.name = name;
    } else {
        this.returnType = '';
        this.name = '[constructor]'; // TODO proper name
    }

    // ClassBody -> Class
    this.qualifiedName = this.getParent().getParent().qualifiedName + '#' + this.name;

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
    _log("END Method ", this.name, this.dumpLine);

    this.args.publishEach();
    if (this.body) {
        this.body.publishEach();
    }
}
util.inherits(Method, ScopeLike);

Method.prototype.dump = function(level) {
    var nextLevel = level + INDENT_LEVEL;
    var type = this.body ? "Method" : "MethodDef";
    var isConstructor = this.isConstructor();
    var buf = indent(level);
    buf += "[" + type + ":" + this.modifiers.dumpEach().join(' ')
        + " ``" + this.name + "'' " + this.dumpLine()
        + "\n" + indent(nextLevel) + dump(this.args, "<>")
        + (!this.throws ? '' : "\n" + indent(nextLevel) + "throws " + this.throws.join(','));
    if (isConstructor)
        buf += "\n" + indent(nextLevel) + " -> " + this.returnType;

    if (this.body)
        buf += this.body.dump(nextLevel);

    return buf + "\n" + indent(level) + "] // END " + this.name + "@" + this.line_end;
}

Method.prototype._getMethods = function() {
    return [];
}

Method.prototype._getVars = function() {
    return this.args.args;
}

Method.prototype.extractInfo = function() {
    return {
        name: this.name
      , qualified: this.qualifiedName
      , javadoc: this.javadoc
      , mods: _stringifyModifiers(this.modifiers)
      , returns: this.returnType
      , args: this.args.extractInfo()
    }
};


Method.prototype.extractReturnTypeInfo = function() {
    return new TypeInfo(this, Ast.TYPE, this.returnType);
}

Method.prototype.isConstructor = function() {
    return this.name == '[constructor]';
}


/**
 * A list of VarDefs (seriously)
 */
function VarDefs(prev, tok, type, name) {
    SimpleNode.call(this, prev, tok);

    this.defs = [];
    this.defs.push(new VarDef(this, tok, type, name));

    this.type = this.defs[0].type;

    while (tok.readComma()) {
        var newName = tok.readName();
        this.defs.push(new VarDef(this, tok, this.type, newName));
    }

}
util.inherits(VarDefs, SimpleNode);

VarDefs.prototype.dump = function(level) {
    return indent(level) + '[Defs' + this.line
        + this.defs.dumpEach().join(',') + ']';
}

VarDefs.prototype.extractInfo = function() {
    return this.defs.map(VarDef.prototype.extractInfo);
};


VarDefs.prototype.publish = function() {
    this.defs._publishEach();
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

        // while because... r3d[][]
        while (tok.readBracketOpen()) {
            this.isArray = true;
            tok.expect(true, tok.readBracketClose);
        }

        this.name = tok.readName();
    }

    if (tok.peekExpressionEnd())
        return; // just defined; not initialized
    else if (tok.peekEquals())
        tok.expect(true, tok.readEquals);
    else {
        //_log("!!! Unexpected end of VarDef (?) @", tok.getLine());
        tok.error("Unexpected end of VarDef (?)"
                + ";\n mods=" + this.modifiers 
                + ";\n type=" + this.type 
                + ";\n arry=" + this.isArray
                + ";\n name=" + this.name
                + ";\n parent=" + this.getParent().dump()
                );
        return; //
    }

    this.creator = VariableInitializer.read(this, tok);
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

VarDef.prototype.extractInfo = function() {
    return {
        name: this.name
      , type: this.type + (this.isArray ? '[]' : '')
      , mods: _stringifyModifiers(this.modifiers)
      , javadoc: this.javadoc
    }
};


VarDef.prototype.extractTypeInfo = function(word/*, line, col*/) {
    if (this.name == word) {
        return new TypeInfo(this, Ast.VARIABLE, this.type);
    } else if (this.type == word) {
        return new TypeInfo(this, Ast.TYPE, this.type);
    }
}


/**
 * Return True if this VarDef is visible in the
 *  given scope
 */
VarDef.prototype.matchesScope = function(lineNo) {
    return this.getLocalScope().contains(lineNo);
}

/** @return True if this statement is a VarDef */
VarDef.isStatement = function(tok) {
    if (tok.isModifier()) 
        return true;

    var before = tok._save(); // all the hacks
    var type = tok.readGeneric();
    if (!type || Tokenizer.isControl(type)) {
        tok._restore(before);
        return false;
    }

    if (tok.peekBlockClose()) {
        tok._restore(before);
        return false;
    }

    if (tok.peekDot()) {
        tok._restore(before);
        return false;
    }

    if (tok.peekParenOpen()) {
        tok._restore(before);
        return false;
    }

    if (tok.peekBracketOpen()
            && tok.peekBracketClose(1)) {
        tok._restore(before);
        return true;
    }

    var peeked = tok.peekName();
    tok._restore(before);
    return peeked && !Tokenizer.isControl(peeked);
}

/**
 * VariableInitializer; this class is
 *  actually only used for Array initializers
 */
function VariableInitializer(prev, tok) {
    BlockLike.call(this, prev, tok);
    this.array = [];

    tok.expect(true, tok.readBlockOpen);
    do {
        this.array.push(VariableInitializer.read(this, tok));

        tok.readComma();
    } while (!tok.readBlockClose());

    this.end();
}
util.inherits(VariableInitializer, BlockLike);

VariableInitializer.read = function(prev, tok) {
    var creator;

    var value = tok.peekName();
    //_log('vardef=', type, name, value);
    
    if ('new' == value) {
        creator = new Creator(prev, tok);
        tok.expect(true, tok.readSemicolon);
    } else if (tok.peekBlockOpen()) {
        // array initializer
        _log("Read array init'r");
        creator = new VariableInitializer(prev, tok);
    } else if (tok.peekAt()) {

        // annotation init'r! Crazy
        creator = new Annotation(prev, tok);
            
    } else {
        _log("Read creator");
        creator = Expression.read(prev, tok);
        tok.readSemicolon(); // the expression might've already read it
    }

    return creator;
}

VariableInitializer.prototype.dump = function(/*level*/) {
    return "{" + this.array.dumpEach().join(",") + "}";
}


/**
 * "Creator" (Oracle's term)
 */
function Creator(prev, tok) {
    SimpleNode.call(this, prev, tok);

    tok.expect("new", tok.readName);
    this.type = tok.readGeneric();

    if (tok.readBracketOpen()) {
        // new Type[] {}
        if (!tok.readBracketClose()) {
            this.args = Expression.read(this, tok);
            tok.expect(true, tok.readBracketClose);
        }

        if (tok.peekBlockOpen()) {
            this.body = VariableInitializer.read(this, tok);
        }

    } else {

        this.args = new Arguments(this, tok);

        if (tok.peekBlockOpen()) {
            this.body = new ClassBody(this, tok);
        }
    }
}
util.inherits(Creator, SimpleNode);

Creator.prototype.dump = function(level) {

    var buf = "[new] " + this.type;
    buf += dump(this.args, "");
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

    if (DEBUG) _log(this.dump());
    tok.expect(true, tok.readParenClose);
}
util.inherits(Arguments, SimpleNode);

Arguments.prototype.dump = function(/*level*/) {
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

ArgumentsDef.prototype.extractInfo = function() {
    return this.args.map(function(arg) {
        return arg.extractInfo();
    });
};


ArgumentsDef.prototype.publishEach = function() {
    this.args._publishEach();
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
        var name = tok.peekName();
        if (DEBUG) {
            _log("!!Next=" + name 
                + "=" + tok.peekEquals(name.length+1));
        }
        if (name && tok.peekEquals(name.length+1)) {
            _log("Read var init'r!");
            tok.expect(name, tok.readName);
            tok.expect(true, tok.readEquals);

            // this could probably be done better
            this.expressions.push(
                new ChainExpression(this, tok, 
                    new LiteralExpression(this, tok, name), 
                    '=', 
                    VariableInitializer.read(this, tok)
                )
            );
        } else {
            this.expressions.push(VariableInitializer.read(this, tok));
        }
    } while (tok.readComma());

    if (DEBUG) _log(this.dump());
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
    //_log("\n\n!!!!End Block", this.dumpLine(), this.statements.dump(2));
}
util.inherits(Block, BlockLike);

Block.prototype.dump = function(level) {
    var buf = '\n' + indent(level) + '{' + this.dumpLine() + '\n';

    buf += this.statements.dump(level + INDENT_LEVEL);

    return buf + '\n' + indent(level) + '}';
}

Block.prototype.publishEach = function() {
    this.statements.publishEach();
}

/**
 * Body of a block
 */
function BlockStatements(prev, tok) {
    ScopeLike.call(this, prev, tok);
    
    this.statements = [];

    while (!tok.peekBlockClose()) {

        var statement = Statement.read(this, tok);
        if (!statement) {
            console.log("!!!!Failed to read statement @" + tok.getLine());
            break;
        }

        this.statements.push(statement);

        var next = tok.peekName();
        if (next == 'case' || next == 'default')
            break;
    }

    this.end();
}
util.inherits(BlockStatements, ScopeLike);

BlockStatements.prototype.dump = function(level) {
    return dumpArray("Statements", this.statements, level);
}

BlockStatements.prototype._getMethods = function() {
    return [];
}

BlockStatements.prototype._getVars = function() {
    return this.statements.filter(function(statement) {
        return statement instanceof VarDefs;
    }).map(function(defs) {
        return defs.defs;
    }).reduce(function(result, defs) {
        return result.concat(defs);
    }, []);
};


BlockStatements.prototype.publishEach = function() {
    this.statements.forEach(function(node) {
        if (node instanceof VarDefs
                || node instanceof VarDef) {
            node.publish();
        }
    });
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
        if (DEBUG) _log(">> IF! @", tok.getLine());
        this.parens = new ParenExpression(this, tok);
        this.kids.push(Statement.read(this, tok));
        if (this.kids[0] == null)
            tok.error("No statement read for if");

        //_log(this.kids.dumpEach());
        if (tok.peekName() == 'else') {
            tok.expect("else", tok.readName);
            this.kids.push(Statement.read(this, tok));
            if (this.kids[1] == null)
                tok.error("No statement read for else");
        }
        if (DEBUG) _log("<< IF! @", tok.getLine(), this.kids.dumpEach());
        break;

    case "switch":
        // this is like switch-ception... parsing 
        //  "switch" inside a switch
        _log(tok, "SWITCH! @", tok.getLine);
        this.parens = Statement.read(this, tok);
        tok.expect(true, tok.readBlockOpen);
        while (!tok.peekBlockClose()) {
            type = tok.readName();
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
        _log(tok, "Next=", tok.peekName);
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

    case "do":
        this.kids.push(Statement.read(this, tok));
        tok.expect("while", tok.readName);
        this.kids.push("while");
        this.parens = new ParenExpression(this, tok);
        tok.readSemicolon();
        break;

    case "while":
        this.parens = new ParenExpression(this, tok);
        this.kids.push(Statement.read(this, tok));
        break;

    case "throw":
        this.parens = Expression.read(this, tok);
        tok.expect(true, tok.readSemicolon);
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

    } else if (tok.peekParenOpen()) {

        // FIXME this should probably
        //  just be Expression.read()
        //  and peekParenOpen() above

        // should we wrap this so we know?
        var expr = Expression.read(prev, tok);
        if (DEBUG) _log("ParExpression", dump(expr, "<NULL>"));
        //tok.expect(true, tok.readParenClose);

        while (expr != null && tok.readDot()) {
            expr = new ChainExpression(prev, tok, expr, '.');
        }
        tok.readSemicolon();

        expr.publish('statement');
        return expr;
    } else if (tok.isControl()) {
        var control = tok.readName();
        return new Statement(prev, tok, control);
    } else if (VarDef.isStatement(tok)) {
        // definitely a vardef, I think
        return new VarDefs(prev, tok);
    } else {
        // some sort of expression
        var expr = Expression.read(prev, tok); // jshint ignore:line
        tok.readSemicolon(); // may or may not be, here
        if (expr) {
            _log("Statement->expr", expr.dump());
            expr.publish('statement');
        }
        return expr;
    }
}


Statement.prototype.extractTypeInfo = function(word, line, col) {
    if (this.parens.contains(line)) {
        return this.parens.extractTypeInfo(word, line, col);
    }
}


/**
 * An expression 
 */
function Expression(prev, tok/*, value*/) {
    BlockLike.call(this, prev, tok);

    this.value = tok.readQualified();

    if (tok.peekParenOpen()) {
        _log("METHOD CALL:", this.value);
        this.right = new Arguments(this, tok);
        this.end();
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
        } else if (tok.peekQuote() || tok.peekParenOpen()) {
            // perhaps just do this always?
            this.right = Expression.read(this, tok);
        } else {
            // FIXME what?
            if (DEBUG) _log("WHAT?", tok._peek());
            //tok.error("WHAT");
            break;
        }
    }

    this.end();
}
util.inherits(Expression, BlockLike);

Expression.read = function(prev, tok) {
    _log("READ EXPR @", tok.getLine());
    _log("prev=", prev.constructor.name);

    if (tok.peekParenOpen()) {
        var paren = new ParenExpression(prev, tok);
        if (tok.peekExpressionEnd())
            return paren;

        if (DEBUG) _log("Paren=", paren.dump());
        if (tok.readDot())
            return new ChainExpression(prev, tok, paren, '.');
        else if (tok.peekQuestion())
            return new TernaryExpression(prev, tok, paren);
        else {
            var chain = new ChainExpression(prev, tok, paren, ' ');
            if (DEBUG) _log(chain.dump());

            //_log('closeParenNext=', tok.peekParenClose());
            return chain;
        }
    } else {
        var expr = LiteralExpression.read(prev, tok);
        if (expr)
            return expr;
        
    }

    var math = tok.readMath();
    if (math) {
        _log("!! Read Math", math);
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

        var expr = new Expression(prev, tok); // jshint ignore:line

        if (tok.readDot() && !tok.isReserved()) {

            // support chained method calls, eg: Foo.get().calculate().stuff();
            //_log(">> CHAINED FROM", expr.dump());
            //_log(">> CHAINED FROM", expr.dump());
            var chain = new ChainExpression(prev, tok, expr, '.'); // jshint ignore:line
            //_log("<< CHAINED INTO", chain.dump());
            return chain;
        } 

        if (tok.readBracketOpen()) {
            // array access expression?
            expr = new ChainExpression(prev, tok, expr, '-[R]-');
            tok.expect(true, tok.readBracketClose);
        }


        // allow maths, etc.
        math = tok.readMath();
        if (math) {
            _log("MATH!", math);
            expr = new ChainExpression(prev, tok, expr, math);
        }

        if (tok.peekQuestion()) {
            return new TernaryExpression(prev, tok, expr);
        }

        return expr
    }
}

/* util method for below */
var _extractMethodInfo = function(self, type, word) {

    if (!word) {
        // no word provided, so pick the last
        //  .word there
        var dot = self.value.lastIndexOf('.');

        // this correctly handles the -1 case!
        word = self.value.substr(dot + 1);
    }

    var container;
    if (word.length < self.value.length) {
        // we know about a container!
        var containerType = self.value.substr(0, 
            self.value.length - word.length - 1);
        container = new TypeInfo(self, Ast.EXPRESSION, containerType);
    }

    if (!container) {
        // climb scopes looking for method
        var scope = self.getScope();
        var def = null;
        while (scope && !(def = scope.getMethod(word))) {
            scope = scope.getScope();
        }
        
        if (def && scope.qualifiedName) {
            container = new TypeInfo(scope, Ast.TYPE, scope.qualifiedName);
            container.resolved = false; // forces us to resolve to return type
        }
    }

    return new TypeInfo(self, type, word, container); 
}

Expression.prototype.extractTypeInfo = function(word/*, line, col*/) {
    if (!word) {
        if (!this.right) {

            // TODO is this right...?
            var val = this.value.trim();
            if (val.endsWith('.')) 
                val = val.substr(0, val.length - 1);

            var type;
            if (val == 'this') {
                // ref to *this* class
                type = Ast.TYPE;
                val = this.getContainingClass().qualifiedName;
            } else if (val.endsWith('.this')) {
                // Ref to outer class
                type = Ast.TYPE;

                var expectedName = val.substr(0, val.lastIndexOf('.'));
                val = this.getContainingClass();
                while (val && val.name != expectedName)
                    val = val.getContainingClass();

                if (val)
                    val = val.qualifiedName;
            } else {

                if (val.indexOf('this.') === 0) {
                    // unnecessary this. ref
                    val = val.substr('this.'.length);
                }
            
                type = val.charAt(0) == val.charAt(0).toUpperCase()
                    ? Ast.TYPE
                    : Ast.EXPRESSION;
            }

            return new TypeInfo(this, type, val);
        } else if (this.right instanceof Arguments) {
            // TODO container?
            return _extractMethodInfo(this, Ast.METHOD_CALL);
        }

        if (DEBUG) console.log("!word!", this.dump());
        return;
    }

    if (this.value.endsWith(word)) {
        if (this.right instanceof Arguments) {
            // in a method call
            return _extractMethodInfo(this, Ast.METHOD, word);
        }
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

LiteralExpression.read = function(prev, tok) {

    if (tok.peekQuote()) {
        _log("Read string literal @", tok.getLine());
        var expr = new LiteralExpression(prev, tok, tok.readString());
        // eg: "foo" + var + "bar"
        while (tok.readPlus())
            expr = new ChainExpression(prev, tok, expr, '+');

        return expr;
    } else if (tok.peekDot()) {
        tok.readDot();
        var expr = new LiteralExpression(prev, tok, '.' + tok.readName()); // jshint ignore:line

        // TODO it's a number; could also be -, *, etc.
        while (tok.readPlus())
            expr = new ChainExpression(prev, tok, expr, '+');

        return expr;
    }
    // TODO  Character literals
}

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
        console.log(">>> Left=", this.left.dump());
    tok.expect(true, tok.readParenClose);

    //if (!tok.peekExpressionEnd())
    //    this.right = Expression.read(path, tok);
}
util.inherits(ParenExpression, BlockLike);

ParenExpression.prototype.dump = function() {
    return "(" + dump(this.left) + ")";// + dump(this.right, "");
}

ParenExpression.prototype.extractTypeInfo = function() {
    return this.left.extractTypeInfo();
}

/** Ex: Foo.getBar().getBaz(), or even a + b */
function ChainExpression(prev, tok, left, link, right) {
    BlockLike.call(this, prev, tok);

    this.left = left;
    if (right) {
        // simple constructor; we know what we want!
        this.link = link;
        this.right = right;
    } else if (link == '++' || link == '--') {
        // simple postfix expression
        this.link = '';
        this.right = new LiteralExpression(this, tok, link);
    } else {
        _log("BlockLike!");
        this.link = link;
        this.right = Expression.read(this, tok);
        if (DEBUG) _log("BlockLike! right=", dump(this.right));
    }

    this.end();
}
util.inherits(ChainExpression, BlockLike);

ChainExpression.prototype.dump = function(level) {
    var link = this.link
        ? " [" + this.link + "] "
        : '';
    return indent(level) + this.left.dump() + link + (this.right ? this.right.dump() : "<NULL>");
}

ChainExpression.prototype.extractTypeInfo = function(word, line, col) {
    if (!word && this.left instanceof ParenExpression) {
        return this.left.extractTypeInfo();
    }

    var rightInfo = this.right.extractTypeInfo(word, line, col);
    if (rightInfo) {
        if (!rightInfo.container) {
            rightInfo.setContainer(this.left.extractTypeInfo());
        } else { 
            // dive into the deepest
            var grandContainer = rightInfo.container;
            while (grandContainer.type == Ast.METHOD_CALL
                    && grandContainer.container) {
                grandContainer = grandContainer.container;
            }

            if (grandContainer.type == Ast.METHOD_CALL
                    && !grandContainer.container) {
                // ?
                grandContainer.setContainer(this.left.extractTypeInfo());
            }
        }
        
        return rightInfo;
    }
}


/** ex: a ? b : c */
function TernaryExpression(prev, tok, paren) {
    BlockLike.call(this, prev, tok);

    this.paren = paren;
    tok.expect(true, tok.readQuestion);
    this.left = Expression.read(this, tok);
    tok.expect(true, tok.readColon);
    this.right = Expression.read(this, tok);

    this.end();
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
                this.inits.push(Expression.read(this, tok));
            } while (!tok.readSemicolon());
        }

        this.condition = null;
        if (!tok.readSemicolon()) {
            this.condition = Expression.read(this, tok);
        }

        this.updates = []
        while (!tok.readParenClose()) {
            this.updates.push(Expression.read(this, tok));

            tok.readComma();
        }

        if (DEBUG) {
            _log("inits=", this.inits.dumpEach());
            _log("condition=", dump(this.condition));
            _log("updates=", this.updates.dumpEach());
        }
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



/**
 * TypeInfo, returned by the extractTypeInfo 
 *  methods. This is NOT publically constructable
 */
function TypeInfo(node, type, name, container) {
    this.type = type;
    this.name = name;
    this.setContainer(container);

    switch (type) {
    case Ast.TYPE:
    case Ast.VARIABLE:
        var resolved = node.getRoot().resolveType(name);
        if (resolved) {
            this.name = resolved;
            this.resolved = true;
        } else {
            this.name = name;
            this.resolved = false;
        }
        break;

    case Ast.EXPRESSION:
        this._node = node;
        this.resolved = false;
        this.resolveExpressionType();
    }
}

TypeInfo.prototype.setContainer = function(container) {
    this.container = container;
    if (container && container.resolved)
        this.resolved = container.resolved;
}

/**
 * If not resolved already, attempts to resolve the
 *  Type of the expression stored in "name." Currently
 *  assumes it's a var ref.
 * If already resolved, returns the previously-resolved
 *  value. 
 * Any resolved type info is stored in classInfo. Even
 *  if present, it may not be fully resolved. This info's
 *  "resolved" state will only be "true" if our classInfo's
 *  "resolved" state is also true
 */
TypeInfo.prototype.resolveExpressionType = function() {
    if (this.resolved)
        return this.classInfo;

    // climb the AST looking for a vardef
    var scope = this._node.getScope();
    var def = null;
    while (scope && !(def = scope.getVar(this.name))) {
        scope = scope.getScope();
    }
    
    if (def) {
        this.classInfo = def.extractTypeInfo(this.name);
        this.resolved = this.classInfo && this.classInfo.resolved;
        if (this.resolved)
            this._node = undefined; // no longer needed
    }

    return def;
};



/**
 * This is probably either a Type 
 *  (for static method calls/static vars)
 *  or a variable
 */
Ast.EXPRESSION    = 'e';
Ast.METHOD        = 'm';
/** 
 * We don't know the actual type, but it's whatever
 *  type is returned from the method call described here
 */
Ast.METHOD_CALL   = 'c';
Ast.TYPE          = 't';
Ast.VARIABLE      = 'v';

module.exports = Ast;
