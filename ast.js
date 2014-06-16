
var fs = require('fs')
  , events = require('events')
  , util = require('util')
  , async = require('async')
  , Tokenizer = require('./tokenizer')
  , autoimport = require('./util/autoimport');

function indent(level) {
    var buf = '';
    for (var i=0; i < level; i++) {
        buf += '  ';
    }
    return buf;
}

var _debugIndent = 0;
function _debugLogger() {
    var args = Array.prototype.slice.apply(arguments);

    if (args[0] == 'CREATED')
        args.unshift(indent(_debugIndent++));
    else if (args[0] == 'END')
        args.unshift(indent(--_debugIndent));

    console.log.apply(console, args);
}

function Ast(path, buffer, options) {
    // this._path = path;
    // this._fp = buffer;
    this.tok = new Tokenizer(path, buffer, options);
    this._root; // filled via parse()

    this.toplevel = [];
    this.qualifieds = {};

    if (options && options.debug) {
        this.log = _debugLogger;
    } else {
        this.log = function(){};
    }

    if (options)
        this.fromJavap = options.fromJavap;

    var self = this;
    this.on('qualified', function(node) {
        self.qualifieds[node.qualifiedName] = node;
    })
    .on('toplevel', function(node) {
        self.toplevel.push(node);
    })

    if (options && options.checkImports) {
        var loader = options.loader || 
            require('./classloader').cachedFromSource(path);

        var candidates = {};

        // FIXME: Lots of false positives, here.
        //  I suspect some nodes are being incorrectly
        //  parsed as Types when they should be Identifiers...
        this.on('referencetype', function(node) {
            var name = node.firstName;
            var first = name.charAt(0);
            var second = name.charAt(1);
            if (first == first.toUpperCase()
                    && second == second.toLowerCase()) {
                candidates[name] = node;
            }
        });
        this.on('identifierexpression', function(node) {
            var first = node.name.charAt(0);
            var second = node.name.charAt(1);
            if (first == first.toUpperCase()
                    && second == second.toLowerCase()) {
                // probably a Type
                candidates[node.name] = node;
            }
        });

        this.on('end', function() {
            // check candidates in parallel
            async.map(Object.keys(candidates), function(name, cb) {
                var node = candidates[name];
                if (node._chain) {
                    // don't need to worry; only _chain needs importing
                    return cb(null, null);
                }

                self.resolveType(loader, name, function(type) {
                    if (type) return cb(null, null);

                    cb(null, {
                        pos: node.start
                      , name: node.name
                      , chain: node._chain ? "CHAIN" : undefined
                    });
                });
            }, function(err, results) {

                // save and publish
                self.missing = results.filter(function(el) {
                    return el;
                });
                self.emit('missing', self.missing);
            });
        });
    }
}
util.inherits(Ast, events.EventEmitter);

Ast.FROM_OBJECT = 'obj';
Ast.FROM_METHOD = 'mth';
Ast.FROM_TYPE   = 'typ';
/** anonymous type */
Ast.FROM_ANON   = 'ann';
/** type body */
Ast.FROM_BODY   = 'bod';

/**
 * Convenience when you're not sure if "type" is a string
 *  or a node. The callback will always be fired
 *  as if from SimpleNode.evaluateType (IE: with an err
 *  value first, and a dict with {type:path} second)
 */
Ast.prototype._evaluateType = function(classLoader, type, cb) {
    if (type instanceof SimpleNode)
        return type.evaluateType(classLoader, cb);

    this.resolveType(classLoader, type, function(resolved) {
        cb(null, {type: resolved});
    });
};


Ast.prototype.locate = function(line, ch) {
    if (!this._root)
        throw new Error("Ast not parsed yet");

    if (this._part) {
        var located = this._part.locate(line, ch);
        return located;
    }

    return this._root.locate(line, ch);
};

/** Generally called for you... */
Ast.prototype.parse = function(startType) {

    if (startType == CompilationUnit) {
        this._root = CompilationUnit.prepare(this);
        this._root.read();
    } else {
        // clear it, in case our parse fails
        this._part = undefined;
        this._part = startType.read(this);
    }

    this.emit('end', this);
    return this._root;
};

Ast.prototype.getPackage = function() {

    if (this._root instanceof CompilationUnit)
        return this._root.package;

};

Ast.prototype.getParent = function() {
    return null; // never
};


Ast.prototype.getStaticImportType = function(methodName) {
    var path = this._root.namedImports[methodName];
    if (!path) return;

    return path.substr(0, path.indexOf('#'));
};

/**
 * Return a projection of the given type
 *
 * This is an interface method that should be shared with
 *  .class-file parsed objects.
 *
 * @param projection An array of things to project. This
 *  may change to a dict so detailed options can be 
 *  more easily specified (such as 'static only'). If
 *  not provided, we will simply return "true"
 */
Ast.prototype.projectType = function(classLoader, type, projection, cb) {
    var typeImpl = this.qualifieds[type];
    if (!typeImpl)
        return cb(new Error('No such type ' + type + ' in ' + this.tok._path));

    if (!projection)
        return cb(null, true);
    
    // laziness, basically
    if (typeImpl.body)
        typeImpl.body.project(classLoader, projection, cb);
    else
        typeImpl.project(classLoader, projection, cb);
};

/**
 * Search the parent types (if any) of the given type
 *  by resolving those types and applying the given
 *  searcher callback to them.
 *
 * @param type A Type node (Class, Interface, etc.),
 *  or the fully-qualified string path of such a type.
 * @param searcher A function which accepts two arguments:
 *  a resolved type path, and a callback method to call
 *  with the results of your searcher function. The callback
 *  is a standard node-style fn(err, result) callback.
 */
Ast.prototype.searchParents = function(classLoader, type, searcher, callback) {
    if (typeof(type) == 'string')
        type = this.qualifieds[type];
    if (!type)
        return callback(new Error('Could not resolve ' + type));

    var candidates = [];
    if (type.extends)
        candidates.push(type.extends);
    if (type.implements && Array.isArray(type.implements))
        candidates = candidates.concat(type.implements);
    
    // resolve the type and return tasks for searching it for the method
    var root = this;
    var resolver = function(type, onResolved) {
        root.resolveType(classLoader, type.name, function(resolved) {
            if (!resolved) return onResolved(null);

            onResolved(null, function(onMethodLocated) {
                searcher(resolved, onMethodLocated);
            });
        });
    }

    // resolve candidate type names into tasks to apply to your searcher
    async.map(candidates, resolver, function(err, resolverTasks) {
        if (err) return callback(err);

        // call tasks in parallel
        async.parallel(resolverTasks, function(err, results) {
            if (err) return callback(err);

            var result = results.reduce(function(last, item) {
                if (last) return last;
                return item;
            }, null);

            if (!result) return callback(new Error("Unable to find " + type.name));
            callback(null, result);
        });
    });
};


/**
 * Resolve the return type of the method called "name"
 *  in the given "type," and call through to "cb" when done.
 *
 * This is an interface method that should be shared with
 *  .class-file parsed objects.
 *
 * @param type Must be a fully-qualified type name
 * @param name Name of the method
 */
Ast.prototype.resolveMethodReturnType = function(classLoader, type, name, cb) {
    var typeImpl = this.qualifieds[type];
    if (!typeImpl) {
        // TODO prevent recursion loop?
        // return cb(new Error("No such type " + type + " in " + this.tok._path));
        return classLoader.resolveMethodReturnType(type, name, cb);
    }

    var m = typeImpl.body.getMethod(name);
    if (m) return _dispatchReturnType(classLoader, m, cb);

    // no method? search superclasses
    // FIXME
    cb(new Error("UNIMPLEMENTED: search superclasses for method return type"));
};



Ast.prototype.resolveType = function(classLoader, type, cb) {
    
    if (Tokenizer.isPrimitive(type))
        return cb(type);

    var full = this._root.namedImports[type];
    if (full)
        return cb(full);

    var auto = autoimport.findByName(type);
    if (auto)
        return cb(auto);

    if (type in this.qualifieds)
        return cb(type); // already fully-qualified

    var path = this._root.package;

    function pathify(klass) {
        return [this, klass];
    }

    // Loop through nested types
    var r = this._root.types.map(pathify.bind(path));
    while (r.length > 0) {
        var obj = r.pop();
        var subpath = obj[0];
        var klass = obj[1];

        var connector = subpath == path ? '.' : '$';
        subpath = subpath + connector + klass.name;
        if (klass.name == type)
            return cb(subpath); // gotcha!

        // nope... recurse
        if (klass.body.subclasses) {
            var kids = klass.body.subclasses.map(pathify.bind(subpath));
            r = r.concat(kids);
        }
    }

    // probably another class in this package 
    var self = this;
    var thisPackage = path + '.' + type;
    classLoader.openClass(thisPackage, function(err) {
        if (err) return cb(null); // couldn't resolve...

        // yep! cache it for future reference...
        self._root.namedImports[type] = thisPackage;

        // ...and notify
        cb(thisPackage);
    });
};


/**
 * Superclass for simple things
 */
function SimpleNode(prev) {
    this._prev = prev;
    if (prev instanceof Ast) {
        this._root = prev;
    } else {
        this._root = prev._root;
    }
    if (!(this._root instanceof Ast))
        throw Error("Root is wrong!" + this._root.constructor.name);

    this.tok = prev.tok;
    this.start = prev.tok.getPos();
    this._root.log("CREATED", this.constructor.name, this.start, this.name);
    this.log = this._root.log;
}

/** Call at the end of parsing */
SimpleNode.prototype._end = function() {
    this.end = this.tok.getPos();
    this.publish();
    this.log("END", this.constructor.name, this.end, this.name);
}

SimpleNode.prototype.contains = function(line, ch) {
    if (line < this.start.line || line > this.end.line)
        return false;
    else if (line == this.start.line && ch < this.start.ch)
        return false; // same start line, col too early
    else if (line == this.end.line && ch > this.end.ch)
        return false; // col too late

    return true;
};

/**
 * Evaluate what type would be returned if this node were
 *  executed. Takes a ClassLoader as its first arg in case
 *  we need to shop around for information
 * @param cb fn(err, result) where result looks like: 
 * {
 *  type: "full.qualified.path.to.ClassName",
 *  from: <constant indicating how the type is used>
 * }
 *
 * "from" constants:
 * - Ast.FROM_METHOD : return type of a method
 * - Ast.FROM_OBJECT : object instance
 * - Ast.FROM_TYPE  : static reference
 */
// jshint ignore:start
SimpleNode.prototype.evaluateType = function(classLoader, cb) { 
    throw new Error(this.constructor.name + ' does not implement evaluateType');
};
// jshint ignore:end


/** 
 * Find all child nodes. Default implementation
 *  does some searching. If perf is an issue,
 *  we could override in subclasses to prevent
 *  unnecessary work
 */
SimpleNode.prototype.getKids = function() {
    var ret = [];

    var tryAdd = function(node) {
        if (node instanceof SimpleNode
                && !~ret.indexOf(node))
            ret.push(node);
    };

    var self = this;
    Object.keys(this).forEach(function(key) {
        if (key.charAt(0) == '_')
            return;

        var el = self[key];
        if (Array.isArray(el))
            el.forEach(tryAdd);
        else
            tryAdd(el);
    });

    return ret;
};


SimpleNode.prototype.locate = function(line, ch) {
    if (!this.contains(line, ch)) {
        console.log(this.constructor.name, this.name, this.start, this.end, "does not contain", line, ch);
        return false; // quick reject... WE don't contain, so kids can't
    }

    var kids = this.getKids()
    if (kids) {
        var matching = kids.filter(function(kid) {
            return kid.contains(line, ch);
        });

        if (matching.length == 1) {
            // recurse! Is stack overflow a concern?
            return matching[0].locate(line, ch);
        } else if (matching.length > 1) {
            matching.forEach(function(el) {
                console.log(el.toJSON());
            });
            throw new Error("Multiple("
                + matching.length 
                +") matching nodes @" + line + ',' + ch);
        }
    }

    // no matching kids... must just be us!
    return this;
};


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

SimpleNode.prototype.start_from = function(state) {
    this.start = {
        line: state.line,
        ch: state.col
    };
};

/** Convert a node into a readible JSON dict (AT LAST!) */
SimpleNode.prototype.toJSON = function() {
    var json = {__type__: this.constructor.name};
    var self = this;
    Object.keys(this).forEach(function(key) {
        if (key.charAt(0) == '_' || key == 'tok')
            return;

        json[key] = _toJson(self[key]);
    });

    return json;
};

function _toJson(obj) {
    if (obj instanceof SimpleNode)
        return obj.toJSON();
    else if (Array.isArray(obj))
        return obj.map(_toJson);
    else
        return obj;
}

SimpleNode.prototype.getDeclaringType = function() {
    var method;
    var scope = this.getScope();
    while (scope) {
        var parent = scope.getParent();
        if (parent instanceof Class 
                || parent instanceof Interface
                || parent instanceof AnnotationDecl
                || parent instanceof Enum) {
            return parent;
        }

        if (!method && parent instanceof Method) {
            method = parent;
        }

        scope = scope.getScope();
    }

    // Nope... are we a partial AST?
    var root = this._root._root;
    if (this._root._part && root instanceof CompilationUnit) {
        // yep. see if our method is somewhere in there

        // we were looking in the partial buffer;
        //  let's find our scope in the root!
        var closeEnough = root.locate(this.start.line, this.start.ch + 1)
        if (closeEnough) {
            return closeEnough.getDeclaringType();
        }

        // nope....
        console.log("Check root for ", method.qualifiedName);
    }
};

SimpleNode.prototype.getScope = function() {

    var parent = this.getParent();
    while (parent && !(parent instanceof ScopeNode)) {
        parent = parent.getParent();

        // are we at the root Ast?
        if (parent == this.getRoot())
            parent = null; // bail
    }

    return parent;
}

/**
 * Climb the scope to locate the given identifier
 */
SimpleNode.prototype.searchScope = function(identifier) {
    // console.log(this.name, this.start, "Search for", identifier);
    var scope = this.getScope();
    while (scope) {
        var found = scope.getVar(identifier);
        if (found)
            return found;

        scope = scope.getScope();
    }

    // all the hacks...
    var root = this._root._root;
    if (this._root._part && root instanceof CompilationUnit) {
        // console.log("Search root for", identifier);
        // we were looking in the partial buffer;
        //  let's find our scope in the root!
        var closeEnough = root.locate(this.start.line, this.start.ch + 1)
        if (closeEnough) {
            if (!(closeEnough.constructor.name == this.constructor.name
                        && closeEnough.start.line == this.start.line
                        && closeEnough.start.ch == this.start.ch)) {
                return closeEnough.searchScope(identifier);
            }
        }

        // no? Okay, well at least look for fields
        for (var i=0; i < root.types.length; i++) {
            var type = root.types[i];
            if (type.contains(this.start.line, this.start.ch+1))
                return type.body.getVar(identifier);
        }
    }
};

/**
 * Climb the scope to locate the given method
 */
SimpleNode.prototype.searchMethodScope = function(name) {
    var scope = this.getScope();
    while (scope) {
        var found = scope.getMethod(name);
        if (found)
            return found;

        scope = scope.getScope();
    }

    // all the hacks again...
    var root = this._root._root;
    if (this._root._part && root instanceof CompilationUnit) {
        // we were looking in the partial buffer;
        //  let's find our scope in the root!
        var closeEnough = root.locate(this.start.line, this.start.ch + 1)
        if (closeEnough) {
            return closeEnough.searchMethodScope(name);
        }
    }
};

SimpleNode.prototype._qualify = function(separator) {

    var parent = this.getParent();
    if (parent instanceof CompilationUnit) {
        this.qualifiedName = this.getParent().package + '.' + this.name;
        this.getRoot().emit('toplevel', this);
    } else {

        // parent is a ClassBody; grandparent is a Class/Interface
        var qualifiedParent = parent.getParent();
        while (qualifiedParent 
                && (!qualifiedParent.qualifiedName
                    || (qualifiedParent instanceof Method))) {
            qualifiedParent = qualifiedParent.getParent();
        }

        if (!qualifiedParent) {
            this.tok.raise("Qualified parent for " + this.name);
            return; // non-strict parsing
        }

        if (parent instanceof Block) {
            // Apparently classes can be declared inside a block.
            // This is called a Local Class.
            // They are qualified as OuterClass$(declNumber?)ClassName.
            // Note the lack of $ between declNumber and ClassName.
            // declNumber is the 1-indexed appearance of ClassName
            // within OuterClass (since you could declare a class of
            // the same name in another block).

            var root = this.getRoot();
            var index = 1;
            do {
                this.qualifiedName = qualifiedParent.qualifiedName
                                   + separator + index + this.name;
                index++;
            } while (root.qualifieds[this.qualifiedName]);

            var self = this;
            var exists = parent.kids.some(function(node) {
                return node.name == self.name;
            });

            if (exists) {
                this.tok.raise("No other " + self.name 
                    + " in " + parent.getParent().qualifiedName);
            }

        } else {
            this.qualifiedName = qualifiedParent.qualifiedName
                               + separator + this.name;
        }
    }
}

/**
 * Superclass for things that might hold
 *  VarDefs. 
 */
function ScopeNode(prev) {
    SimpleNode.call(this, prev);
}
util.inherits(ScopeNode, SimpleNode);

/**
 * implement this method to return an array
 * of VarDefs to use the default functionality
 */
ScopeNode.prototype._getVars = undefined;

ScopeNode.prototype.getVar = function(varName) {
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
ScopeNode.prototype._getMethods = undefined;

ScopeNode.prototype.getMethod = function(methodName) {
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
 * The VariableDeclNode is a special type of
 *  Node that can handle variable declaration. 
 *  Implementors should handle 
 */
function VariableDeclNode(prev, hasJavadoc) {
    SimpleNode.call(this, prev);

    this.kids = [];

    if (hasJavadoc)
        this.javadoc = this.tok.getJavadoc();
}
util.inherits(VariableDeclNode, SimpleNode);

VariableDeclNode.prototype._readDeclarations = function(firstName) {
    if (firstName) {
        this.kids.push(new VarDef(this, this.mods, this.type, firstName, true));
    }

    var tok = this.tok;
    while (tok.readComma()) {
        var ident = tok.readIdentifier();
        if (ident)
            this.kids.push(new VarDef(this, this.mods, this.type, ident, true));
    }

    tok.expectSemicolon();
};

VariableDeclNode.prototype.getKids = function() {
    // parent may dup the type node, etc.
    return this.kids;
};


/**
 * JavadocNode is a drop-in replacement for SimpleNode
 *  for those nodes that may have Javadoc attached 
 *  to them
 */
function JavadocNode(prev) {
    SimpleNode.call(this, prev);
    
    this.javadoc = this.tok.getJavadoc();
}
util.inherits(JavadocNode, SimpleNode);

JavadocNode.prototype.readTypeName = function() {
    var tok = this.tok;
    if (this.getRoot().fromJavap) {
        this.qualifiedName = tok.readQualified();

        var lastDollar = this.qualifiedName.indexOf('$');
        this.name = (~lastDollar)
            ? this.qualifiedName.substr(lastDollar+1)
            : this.qualifiedName.substr(this.qualifiedName.lastIndexOf('.') + 1);

        // if javap, this will always be a toplevle
        this.getRoot().emit('toplevel', this);
    } else {
        this.name = tok.readIdentifier();
        this._qualify('$');
    }
};



function VarDef(prev, mods, type, name, isInitable) {
    SimpleNode.call(this, prev);

    if (isInitable === undefined)
        isInitable = true;

    if (mods)
        this.start = mods.start;
    else
        this.start = type.start;
    this.mods = mods;
    this.type = type;
    this.name = name;

    // NB: Java grammar supports brackets
    //  here for array types, but convention
    //  discourages that and I don't want
    //  to deal with the complications.

    var tok = this.tok;
    if (tok.readEquals()) {
        if (isInitable)
            this.initializer = VarDef.readInitializer(this);
        else
            this.raise("no initialization");
    }

    this._end();
}
util.inherits(VarDef, SimpleNode);

VarDef.prototype.evaluateType = function(classLoader, cb) {
    this.type.evaluateType(classLoader, function(err, evaluated) {
        if (err) return cb(err);

        cb(null, {
            type: evaluated.type
          , from: Ast.FROM_OBJECT
        });
    });
};

VarDef.prototype.project = function(classLoader, cb) {
    var base = {
        name: this.name
      , javadoc: this.javadoc
    };

    var self = this;
    async.parallel([
        function(done) {
            self.type.project(classLoader, function(err, type) {
                if (err) return done(err);

                base.type = type || self.type.name;
                for (var i=0; i < self.type.array; i++)
                    base.type += '[]';
                done();
            });
        },
        function(done) {
            if (!this.mods) return done();
            this.mods.project(classLoader, function(err, res) {
                if (err) return done(err);

                base.mods = res;
                done();
            });
        }
    ], function(err) {
        cb(err, base);
    });
};


// IE: VariableInitializer
VarDef.readInitializer = function(prev) {
    if (prev.tok.peekBlockOpen())
        return VarDef.readArrayInitializer(prev);

    return Expression.read(prev);
};

VarDef.readArrayInitializer = function(prev) {
    var tok = prev.tok;
    tok.expectBlockOpen();

    var items = [];

    while (!(tok.readBlockClose() || tok.isEof())) {
        var init = VarDef.readInitializer(prev);
        if (init)
            items.push(init);

        tok.readComma();
    }

    return items;
};


/**
 * Root AST node of a java file. To facilitate
 *  proper observers accessing namedImports, etc.,
 *  CompilationUnit has slightly different instantiation
 *  semantics. First, use CompilationUnit.prepare()
 *  to get the node, then call unit.read() on the instance
 */
function CompilationUnit(ast, mods, package) {
    SimpleNode.call(this, ast);

    this.mods = mods;
    this.package = package;

    this.imports = [];
    this.types = [];
    this.namedImports = {};
}
util.inherits(CompilationUnit, SimpleNode);

CompilationUnit.prototype.read = function() {

    var tok = this.tok;

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

            if (!star) {
                var lastDot = path.lastIndexOf('.');
                var name = ~lastDot
                    ? path.substr(lastDot + 1)
                    : path;

                // now, was this import an inner class?
                // A bit gross, but only idiots would have
                //  capital letters in a package, or lower
                //  case to start a class.
                var parts = path.split('.');
                var cleanPath;
                if (parts.length > 1) {
                    // len-1 is the name again
                    cleanPath = name;
                    var divider = static ? '#' : '$'
                    for (var i=parts.length-2; i >= 0; i--) {
                        var part = parts[i];
                        var first = part.charAt(0);
                        if (first == first.toUpperCase()) {
                            cleanPath = part + divider + cleanPath;
                        } else {
                            cleanPath = part + '.' + cleanPath;
                        }

                        divider = '$'; // after the first, this always
                    }
                } else {
                    // default package. yuck.
                    cleanPath = path;
                }

                this.namedImports[name] = cleanPath;
            }
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

CompilationUnit.prepare = function(ast) {
    var tok = ast.tok;
    var state = tok.save();
    var mods = Modifiers.read(ast);
    if (tok.readString("package")) {
        var package = tok.readQualified();
        tok.expectSemicolon();
        return new CompilationUnit(ast, mods, package);
    } else {
        tok.restore(state);
        return new CompilationUnit(ast, null, "default");
    }
};

/**
 * Factory for TypeDeclarations
 */
var TypeDeclaration = {
    read: function(prev, modifiers) {
        var tok = prev.tok;

        // it can be just a semicolon
        while (tok.readSemicolon()) 
            continue;

        // class or interface decl
        var state = tok.save();
        var mods = modifiers
            ? modifiers // use ones we already found
            : Modifiers.read(prev);
        if (tok.readString("class")) {
            return new Class(prev, mods);
        } else if (tok.readString("enum")) {
            return new Enum(prev, mods);
        } else if (tok.readString("interface")) {
            return new Interface(prev, mods);
        } else if (tok.readString("@interface")) {
            return new AnnotationDecl(prev, mods);
        }

        tok.restore(state); // could be something else with mods
    }
}

/**
 * A Java class declaration
 */
function Class(prev, mods) {
    JavadocNode.call(this, prev);
    
    this.mods = mods;
    if (mods)
        this.start = mods.start;

    var tok = this.tok;
    this.readTypeName();

    this.typeParams = TypeParameters.read(this);

    if (tok.readString('extends')) {
        this.extends = Type.read(this);
    }
    if (tok.readString('implements')) {
        this.implements = [];
        do {
            this.implements.push(Type.read(this));
        } while(tok.readComma());
    }

    // body
    this.body = new ClassBody(this);

    this._end();
}
util.inherits(Class, JavadocNode);

Class.prototype.project = function(classLoader, cb) {
    var base = {
        name: this.name
      , qualified: this.qualifiedName
      , javadoc: this.javadoc
      , mods: ''
    };

    // TODO others (extends, implements, etc)
    cb(null, base);
};


function Enum(prev, mods) {
    JavadocNode.call(this, prev);

    this.mods = mods;
    if (mods)
        this.start = mods.start;

    var tok = this.tok;
    this.readTypeName();

    if (tok.readString('implements')) {
        this.implements = [];
        do {
            this.implements.push(Type.read(this));
        } while(tok.readComma());
    }

    // body
    this.body = new EnumBody(this);

    this._end();
}
util.inherits(Enum, JavadocNode);

function EnumBody(prev) {
    SimpleNode.call(this, prev);

    this.constants = [];

    this.tok.expectBlockOpen();
    var last;
    do {
        last = this._readConstant();
        if (last)
            this.constants.push(last);
    } while (this.tok.readComma() && last);

    if (this.tok.readSemicolon()) {

        // read any class body-type stuff
        this.classBody = new ClassBody(this, true);
    } else {

        // above, ClassBody reads closer;
        //  since we're not using that, we
        //  need to read it ourselves
        this.tok.expectBlockClose();
    }

    this._end();
}
util.inherits(EnumBody, SimpleNode);

EnumBody.prototype._readConstant = function() {
    var state = this.tok.prepare();

    var mods = Modifiers.read(this);
    var ident = this.tok.readIdentifier();
    if (!ident || Tokenizer.isReserved(ident)) {
        this.tok.restore(state);
        return;
    }

    return new EnumConstant(this, state, mods, ident);
};

function EnumConstant(prev, state, mods, ident) {
    JavadocNode.call(this, prev);

    this.start_from(state);
    this.mods = mods;
    this.name = ident;

    this.args = Arguments.read(this);
    if (this.tok.peekBlockOpen())
        this.body = new ClassBody(this);

    this._end();
}
util.inherits(EnumConstant, JavadocNode);


/**
 * A Java class declaration
 */
function Interface(prev, mods) {
    JavadocNode.call(this, prev);

    this.mods = mods;
    if (mods)
        this.start = mods.start;

    var tok = this.tok;
    this.readTypeName();

    this.typeParams = TypeParameters.read(this);
    
    if (tok.readString('extends')) {
        // *should* be "extends," but this
        //  gives us better parity with Class
        this.implements = [];
        do {
            this.implements.push(Type.read(this));
        } while(tok.readComma());
    }

    // NB technically this should be InterfaceBody,
    //  since all methods should be declared as if abstract,
    //  but for now... this is sufficient
    this.body = new ClassBody(this);

    this._end();
}
util.inherits(Interface, JavadocNode);

function AnnotationDecl(prev, mods) {
    JavadocNode.call(this, prev);

    this.mods = mods;
    if (mods)
        this.start = mods.start;

    this.readTypeName();

    this.body = new AnnotationBody(this);

    this._end();
}
util.inherits(AnnotationDecl, JavadocNode);

function AnnotationBody(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    this.tok.expectBlockOpen();
    var last;
    while (!(this.tok.readBlockClose() || this.tok.isEof())) {
        last = this._readDeclaration();
        if (last)
            this.kids.push(last);
    }

    this._end();
}
util.inherits(AnnotationBody, SimpleNode);

AnnotationBody.prototype._readDeclaration = function() {
    var typeDecl = TypeDeclaration.read(this);
    if (typeDecl)
        return typeDecl;

    var mods = Modifiers.read(this);
    var type = Type.read(this);
    var ident = this.tok.readIdentifier();
    if (Tokenizer.isReserved(ident))
        this.tok.raise("Identifier");

    if (this.tok.peekParenOpen()) {
        return new AnnotationMethod(this, mods, type, ident);
    }

    // should be ConstantDeclarators, but this is close enough
    return new FieldDecl(this, mods, type, null, ident);
};

function AnnotationMethod(prev, mods, type, ident) {
    JavadocNode.call(this, prev);

    this.mods = mods;
    this.returns = type;
    this.name = ident;
    this._qualify('#');

    var tok = this.tok;
    tok.expectParenOpen();
    tok.expectParenClose();

    if (tok.readString("default")) {
        this.defaultValue = Annotation._readElementValue(this);
    }

    tok.expectSemicolon();

    this._end();
}
util.inherits(AnnotationMethod, JavadocNode);


/**
 * 
 */
function ClassBody(prev, skipBlockOpen, autoRead) {
    ScopeNode.call(this, prev);

    // shortcut indexes of declared things
    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];
    this.constructors = [];

    // ALL child elements, in parse-order
    this.kids = [];

    var addToFields = function(el) { this.fields.push(el); }.bind(this);
    
    // read statements
    var tok = this.tok;

    if (autoRead === false) {
        // this is basically used by Method as a quick
        //  way to parse *one* thing for partial buffers
        this._end(); // I guess? Probably doesn't matter
        return;
    }

    if (!skipBlockOpen)
        tok.expectBlockOpen();

    while (!(tok.readBlockClose() || tok.isEof())) {
        var el = this._readDeclaration();
        if (!el) break; // probably end of a partial buffer

        this.kids.push(el);

        // push onto index by type
        if (el instanceof FieldDecl) {
            el.kids.forEach(addToFields);
        } else if (el instanceof Method) {
            if (el.isConstructor())
                this.constructors.push(el);
            else
                this.methods.push(el);
        } else if (el instanceof Class
                || el instanceof Interface) {
            this.subclasses.push(el);
        } else if (el instanceof Block) {
            this.blocks.push(el);
        }
    }

    this._end();
}
util.inherits(ClassBody, ScopeNode);

ClassBody.prototype.evaluateType = function(classLoader, cb) {
    var parent = this.getParent();
    var type, from;
    if (parent instanceof Creator) {
        type = parent.type.name;
        from = Ast.FROM_ANON;
    } else {
        type = parent.qualifiedName;
        from = Ast.FROM_BODY;
    }
    
    this.getRoot().resolveType(classLoader, type, function(resolved) {
        cb(null, {
            type: resolved,
            from: from
        });
    });
};

ClassBody.prototype.getKids = function() {
    // the default implementation would do lots of
    //  duplicate work, looking at our typed arrays
    return this.kids;
};


ClassBody.prototype.project = function(classLoader, projection, callback) {
    var self = this;
    if (Array.isArray(projection)) {
        var tasks = projection.reduce(function(res, type) {
            if (!self[type])
                return res;

            res[type] = function(cb) {
                if (Array.isArray(self[type])) {
                    async.map(self[type], function(item, mapped) {
                        item.project(classLoader, mapped);
                    }, cb);
                } else {
                    self[type].project(classLoader, cb);
                }
            };

            return res;
        }, {
            // always include the parent's qualifiedName
            qualifiedName: function(callback) {
                callback(null, self.getParent().qualifiedName);
            }
        });

        async.parallel(tasks, callback);
    } else {
        // ex: {method: "foo"} or {field: "bar"}
        var mode = Object.keys(projection)[0];
        var target = projection[mode];

        // TODO param types?
        var key = mode + 's';
        if (!this[key])
            return callback(new Error("Invalid mode " + mode));

        var filtered = this[key].filter(function(item) {
            return item.name == target;
        });

        if (!(filtered && filtered.length)) {
            // search parent types for it
            return this.getRoot().searchParents(classLoader, this.getParent(),
                function(parent, resolve) {
                    classLoader.openClass(parent, projection, resolve);
                }, callback);
        }

        // found it!
        filtered[0].project(classLoader, callback);
    }
};


ClassBody.prototype._getVars = function() {
    return this.fields;
};

ClassBody.prototype._getMethods = function() {
    return this.methods;
};



ClassBody.prototype._readDeclaration = function() {
    var tok = this.tok;

    // never return from boring semicolons
    while (tok.readSemicolon())
        continue;

    var mods = Modifiers.read(this);
    if (tok.peekBlockOpen()) {
        var block = Block.read(this);
        if (block) {
            block.mods = mods;
            return block;
        }
    }

    return this._readMember(mods);
};

ClassBody.prototype._readMember = function(mods) {
    var tok = this.tok;

    var typeParams = TypeParameters.read(this);
    var type = Type.read(this);
    if (!type) {
        // class/interface decl
        return TypeDeclaration.read(this, mods);
    }

    if (tok.peekParenOpen()) {
        // special incantation for constructors.
        // we could add a factory, but this is the only
        // usage, I think...
        return new Method(this, mods, null, typeParams, type);
    }

    var ident = tok.readIdentifier();

    if (tok.peekParenOpen()) {
        return new Method(this, mods, type, typeParams, ident);
    }

    return new FieldDecl(this, mods, type, typeParams, ident);
};

/**
 * NB strictly for reading partial buffers
 */
ClassBody.read = function(ast) {
    return new ClassBody(ast, true);
}


function Method(prev, mods, type, typeParams, name) {
    ScopeNode.call(this, prev);

    this.javadoc = this.tok.getJavadoc();

    if (mods)
        this.start = mods.start;
    else if (type)
        this.start = type.start;
    else if (name.start)
        this.start = name.start;
    this.mods = mods;
    this.returns = type;
    this.typeParams = typeParams;
    this.name = typeof(name) == 'string'
        ? name
        : name.name; // it was a type, for constructors
    this._qualify('#');

    this.params = new FormalParameters(this);

    var tok = this.tok;
    if (tok.readString("throws")) {
        this.throws = []; // lazy init
        do {
            this.throws.push(Type.read(this));
        } while(tok.readComma());
    }

    this.body = Block.read(this);
    if (!this.body) {
        this.tok.expectSemicolon();

        // TODO enforce abstract?
    }

    this._end();
}
util.inherits(Method, ScopeNode);

Method.prototype.project = function(classLoader, cb) {
    var base = {
        name: this.name
      , qualified: this.qualifiedName
      , javadoc: this.javadoc
      , mods: ''
    };

    var self = this;
    async.parallel([
        function(done) {
            if (!self.mods) return done();
            self.mods.project(classLoader, function(err, proj) {
                if (err) return done(err);

                base.mods = proj;
                done();
            });
        },
        function(done) {
            self.returns.project(classLoader, function(err, proj) {
                if (err) return done(err);

                base.returns = proj;
                done();
            });
        },
        function(done) {
            self.params.project(classLoader, function(err, proj) {
                if (err) return done(err);

                base.params = proj;
                done();
            });
        }
    ], function(err) {
        cb(err, base);
    });
};


Method.prototype._getVars = function() {
    return this.params._getVars();
};

Method.prototype.getMethod = function() {
    // Methods can't do this!
    return null;
};

Method.prototype.isConstructor = function() {
    return this.returns == null;
};

/** NB For partial buffers ONLY */
Method.read = function(ast) {
    var cb = new ClassBody(ast, true, false);

    // just in case, kill all upcoming semicolons
    for (;;) {
        if (!ast.tok.readSemicolon())
            break;
    } 

    // read a decl
    var decl = cb._readDeclaration();

    if (!(decl instanceof Method))
        return;

    return decl;
}


function FieldDecl(prev, mods, type, typeParams, name) {
    VariableDeclNode.call(this, prev, true);

    if (mods)
        this.start = mods.start;
    else if (type)
        this.start = type.start;
    this.mods = mods;
    this.type = type;
    this.typeParams = typeParams;

    this._readDeclarations(name);

    var self = this;
    this.kids.forEach(function(decl) {
        // just copy the javadoc to each?
        decl.javadoc = self.javadoc;
        decl._qualify('#');
        decl.publish('field');
    });

    this._end();
}
util.inherits(FieldDecl, VariableDeclNode);


function Block(prev) {
    ScopeNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
    tok.expectBlockOpen();
    while (!(tok.readBlockClose() || tok.isEof())) {
        var stmt = BlockStatement.read(this);
        if (stmt)
            this.kids.push(stmt);
        else
            break;
    }

    this._end();
}
util.inherits(Block, ScopeNode);

Block.prototype._getVars = function() {
    return this.kids.filter(function(statement) {
        return statement instanceof LocalVarDefs;
    }).map(function(defs) {
        return defs.kids;
    }).reduce(function(result, defs) {
        return result.concat(defs);
    }, []);
};

Block.prototype.getMethod = function() {
    // blocks can't do this!
    return null;
};


Block.read = function(prev) {
    if (!prev.tok.peekBlockOpen())
        return;

    return new Block(prev);
}

/**
 * Factory for BlockStatements
 */
var BlockStatement = {
    read: function(prev) {
        var mods = Modifiers.read(prev);
        var classOrInterface = TypeDeclaration.read(prev, mods);
        if (classOrInterface)
            return classOrInterface;

        var tok = prev.tok;
        var state = tok.save();
        var type = Type.read(prev);
        if (type) {
            var name = tok.readIdentifier();
            if (name && !Tokenizer.isReserved(name)) {
                // localvardefs can't have type params...?
                return new LocalVarDefs(prev, mods, type, null, name);
            }
        }

        // wasn't a variable decl; start over
        tok.restore(state);

        // must be some sort of statement
        return Statement.read(prev);
    }
}

function LocalVarDefs(prev, mods, type, typeParams, name) {
    VariableDeclNode.call(this, prev);

    if (mods)
        this.start = mods.start;
    this.mods = mods;
    this.type = type;
    this.typeParams = typeParams;

    this._readDeclarations(name);

    this.kids.forEach(function(decl) {
        decl.publish('vardef');
    });

    this._end();
}
util.inherits(LocalVarDefs, VariableDeclNode);


/**
 * Statement factory
 */
var Statement = {
    read: function(prev) {
        var tok = prev.tok;

        // it can be just a semicolon
        while (tok.readSemicolon())
            continue;

        var block = Block.read(prev);
        if (block)
            return block;

        var state = tok.prepare();
        var ident = tok.readIdentifier();

        // label?
        if (tok.readColon()) 
            return new LabelStatement(prev, state, ident);

        tok.restore(state);
        if (Tokenizer.isControl(ident))
            return Statement._readControl(prev, ident);

        var expr = Expression.read(prev);
        if (expr)
            tok.expectSemicolon();
        return expr;
    },

    _readControl: function(prev, name) {

        switch (name) {
        case "assert":
            return new AssertStatement(prev);
        case "switch":
            return new SwitchStatement(prev);
        case "if":
            return new IfStatement(prev);
        case "while":
        case "do":
            return new WhileStatement(prev, name == "do");
        case "for":
            return new ForStatement(prev);
        case "break":
            return new BreakStatement(prev);
        case "continue":
            return new ContinueStatement(prev);
        case "return":
            return new ReturnStatement(prev);
        case "throw":
            return new ThrowStatement(prev);
        case "synchronized":
            return new SynchronizedStatement(prev);
        case "try":
            return new TryStatement(prev);
        }
        
        prev.tok.raiseUnsupported("unexpected control statements: " 
            + prev.tok.peekIdentifier());
    }
};

function LabelStatement(prev, state, label) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.name = label;

    this._end();
}
util.inherits(LabelStatement, SimpleNode);

function AssertStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("assert");
    this.condition = Expression.read(this);

    if (tok.readColon())
        this.description = Expression.read(this);

    tok.expectSemicolon();

    this._end();
}
util.inherits(AssertStatement, SimpleNode);

function SwitchStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("switch");
    this.condition = Expression.readParen(this);
    this.kids = [];

    tok.expectBlockOpen();
    while (!(tok.readBlockClose() || tok.isEof())) {
        var current = new SwitchGroup(prev, this._readLabels());

        if (!current.labels)
            tok.raise("switch labels");

        while (!(tok.peekBlockClose()
                || tok.readString('break')
                || tok.peekString('case')
                || tok.peekString('default')
                || tok.isEof())) {
            var stmt = BlockStatement.read(this);
            if (!stmt)
                break;

            current.kids.push(stmt);
        } 
        tok.readSemicolon();

        if (!current.labels && !current.kids)
            break; // safety net

        // got it!
        this.kids.push(current);
    }

    this._end();
}
util.inherits(SwitchStatement, SimpleNode);

SwitchStatement.prototype._readLabels = function() {
    var labels = [];
    var tok = this.tok;
    for (;;) {
        if (tok.readString("default")) {
            labels.push('default');
        } else if (tok.readString("case")) {
            var expr = Expression.read(this);
            if (expr)
                labels.push(expr);
        } else {
            // no more
            return labels;
        }

        tok.expectColon();
    }
};

function SwitchGroup(prev, labels) {
    SimpleNode.call(this, prev);

    this.labels = labels;
    this.kids = [];

    this._end();
}
util.inherits(SwitchGroup, SimpleNode);


function IfStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("if");
    this.condition = Expression.readParen(this);
    this.trueStatement = Statement.read(this);

    if (tok.readString("else")) {
        this.falseStatement = Statement.read(this);
    }

    this._end();
}
util.inherits(IfStatement, SimpleNode);

function WhileStatement(prev, isDo) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.isDo = isDo;
    if (isDo) {
        tok.expectString("do");
        this.body = Statement.read(this);

        tok.expectString("while");
        this.condition = Expression.readParen(this);
        tok.expectSemicolon();
    } else {
        tok.expectString("while");
        this.condition = Expression.readParen(this);
        this.body = Statement.read(this);
    }

    this._end();
}
util.inherits(WhileStatement, SimpleNode);

function ForStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("for");
    tok.expectParenOpen();
    this.control = this._readControl();
    tok.expectParenClose();

    this.body = Statement.read(this);

    this._end();
}
util.inherits(ForStatement, SimpleNode);

ForStatement.prototype._readControl = function() {
    var tok = this.tok;
    var mods = Modifiers.read(this);
    var type = Type.read(this);
    if (type) {
        var name = tok.readIdentifier();
        if (name) {
            if (tok.readColon())
                return new EnhancedForControl(this, mods, type, name);
            else
                return new ClassicForControl(this, mods, type, name);
        }
    }

    return new ClassicForControl(this);
};

function ClassicForControl(prev, mods, type, name) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    if (name)
        this.init = new LocalVarDefs(this, mods, type, null, name);
    else if (!tok.readSemicolon()) {
        this.init = [];
        do {
            var expr = Expression.read(this);
            if (expr)
                this.init.push(expr);
        } while (tok.readComma());

        // LocalVarDefs above reads the semicolon
        tok.expectSemicolon();
    }

    this.condition = Expression.read(this);
    tok.expectSemicolon();
    
    this.update = [];
    do {
        var expr = Expression.read(this); // jshint ignore:line
        if (expr)
            this.update.push(expr);
    } while (tok.readComma());

    this._end();
}
util.inherits(ClassicForControl, SimpleNode);

function EnhancedForControl(prev, mods, type, name) {
    SimpleNode.call(this, prev);

    this.variable = new VarDef(this, mods, type, name);
    this.src = Expression.read(this);

    this._end();
}
util.inherits(EnhancedForControl, SimpleNode);


function BreakStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("break");
    if (!tok.readSemicolon()) {
        this.label = tok.readIdentifier();
        tok.expectSemicolon();
    }

    this._end();
}
util.inherits(BreakStatement, SimpleNode);

function ContinueStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("continue");
    if (!tok.readSemicolon()) {
        this.label = tok.readIdentifier();
        tok.expectSemicolon();
    }

    this._end();
}
util.inherits(ContinueStatement, SimpleNode);

function ReturnStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("return");
    this.value = Expression.read(this);
    tok.expectSemicolon();

    this._end();
}
util.inherits(ReturnStatement, SimpleNode);

function ThrowStatement(prev) {
    SimpleNode.call(this, prev);

    this.tok.expectString("throw");
    this.body = Expression.read(this);
    if (!this.body)
        this.raise("something to throw");
    this.tok.expectSemicolon();

    this._end();
}
util.inherits(ThrowStatement, SimpleNode);

function SynchronizedStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("synchronized");

    // condition is not exactly the right word,
    //  but it's consistent with other statements...
    this.condition = Expression.readParen(this);
    this.body = Block.read(this);

    this._end();
}
util.inherits(SynchronizedStatement, SimpleNode);

function TryStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString('try');

    if (tok.readParenOpen()) {
        tok.checkJdk7("Try-with-resources");
        this.resources = [];
        do {
            var mods = Modifiers.read(this);
            var type = Type.read(this);
            var name = tok.readIdentifier();
            if (type && name) {
                var def = new VarDef(this, mods, type, name, true);
                if (!def.initializer)
                    this.raise("initialized resource");

                this.resources.push(def);
            }
        } while (tok.readSemicolon());
        
        tok.expectParenClose();
    }

    this.body = Block.read(this);

    this.catches;
    while (tok.readString('catch')) {
        var clause = CatchClause.read(this);
        if (clause) {
            if (!this.catches) this.catches = [];
            this.catches.push(clause);
        }
    }

    if (tok.readString('finally')) {
        this.finallyBlock = Block.read(this);
    }

    this._end();
}
util.inherits(TryStatement, SimpleNode);

function CatchClause(prev, state, mods, types, name) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.mods = mods;
    this.types = types;
    this.name = name;

    this.body = Block.read(this);

    this._end();
}
util.inherits(CatchClause, SimpleNode);

CatchClause.read = function(prev) {
    var tok = prev.tok;
    tok.expectParenOpen();
    var state = tok.prepare();
    var mods = Modifiers.read(prev);
    var types = [tok.readQualified()];
    if (tok.readOr() && tok.checkJdk7("multi-catch")) {
        do {
            types.push(tok.readQualified());
        } while (tok.readOr());
    }
    var name = tok.readIdentifier();

    if (types && name) {
        tok.expectParenClose();
        return new CatchClause(prev, state, mods, types, name);
    }
}

/**
 * The Expression Class is used for anything
 *  "chained."
 */
function Expression(prev, left, op, exprFactory, opFactory) {
    SimpleNode.call(this, prev);

    this.start = left.start;

    this.left = left;
    this.chain = [];

    var right = exprFactory(this);
    do {
        if (!right)
            this.tok.raise("Incomplete assignment");

        this.chain.push([op, right]);

        op = opFactory.call(this.tok);
        right = null;
        if (op) 
            right = exprFactory(this);
    } while (op && right);

    this._end();
}
util.inherits(Expression, SimpleNode);

/**
 * Expression factory
 */
Expression.read = function(prev) {
    var exprFactory = Expression._expression1;
    var opFactory = prev.tok.readAssignment;

    var expr1 = exprFactory(prev);
    var op = opFactory.call(prev.tok);
    if (!op)
        return expr1; // just expr1

    return new Expression(prev, expr1, op, exprFactory, opFactory);
};

Expression.readParen = function(prev) {
    if (!prev.tok.readParenOpen())
        return;

    // paren expression
    var expr = Expression.read(prev);
    prev.tok.expectParenClose();
    return expr;
}


/** Expression1 factory */
Expression._expression1 = function(prev) {
    var expr2 = Expression._expression2(prev);
    if (!expr2)
        return;

    if (prev.tok.readQuestion()) {
        return new TernaryExpression(prev, expr2);
    }

    return expr2;
}

/** Expression2 factory */
Expression._expression2 = function(prev) {
    var exprFactory = Expression._expression3;
    var expr3 = exprFactory(prev);
    if (!expr3)
        return;

    if (prev.tok.readString("instanceof")) 
        expr3 = new InstanceOfExpression(prev, expr3);

    // infix op
    var opFactory = prev.tok.readInfixOp;
    var op = opFactory.call(prev.tok);
    if (op)
        return new Expression(prev, expr3, op, exprFactory, opFactory);
    
    return expr3;
}

/** Expression3 factory */
Expression._expression3 = function(prev) {

    var tok = prev.tok;
    var state = tok.save();
    var prefixOp = tok.readPrefixOp();
    if (prefixOp) {
        return new PrefixExpression(prev, state, prefixOp);
    }

    var result;
    if (tok.peekParenOpen()) {
        // try to read it as a CastExpression
        result = CastExpression.read(prev);
        
        // if it's not a cast, the factory
        //  will do the right thing
    } else {
        
        // must be a Primary
        result = Primary.read(prev);
    }

    // selectors
    var selectors = SelectorExpression.read(result);
    if (selectors)
        result = selectors;

    // NB We don't record the postfix ops,
    //  because they don't affect type, there's
    //  no need to look them up, and we're not
    //  trying to execute the code. If anyone ever 
    //  needs this, they're free to submit a PR
    tok.readPostfixOp();

    return result;
}

function CastExpression(prev, left, right) {
    SimpleNode.call(this, prev);

    this.start = left.start;
    this.left = left;
    this.right = right;

    this._end();
}
util.inherits(CastExpression, SimpleNode);

CastExpression.prototype.evaluateType = function(classLoader, cb) {
    // easy!
    this.left.evaluateType(classLoader, cb);
};



/** 
 * Try to read a CastExpression, but
 *  can return a Primary if it was just
 *  a paren expression
 */
CastExpression.read = function(prev) {
    var tok = prev.tok;

    tok.expectParenOpen();
    // var left = Expression.read(prev);
    // if (!left)
    //     left = Type.read(prev);
    var state = tok.prepare();
    var left = Type.read(prev);
    if (!(left && tok.peekParenClose())) {
        // can't have just been a type
        tok.restore(state);
        left = Expression.read(prev);
    }
    tok.expectParenClose();
    
    if (tok.peekDot() || tok.peekInfixOp()) {
        // this is kind of shitty, but necessary for sane parsing.
        // EX: ((Foo) obj).bar();
        // the stuff inside the paren is a nice CastExpression, 
        // but the outer paren ALSO becomes a CastExpression 
        // whose right is a SelectorExpression. Since we
        // expect SelectorExpression to be first, this minor
        // hack will make that happen
        //
        // Also, we don't want to confuse infix ops following
        //  parens with being something that they're not
        //  (esp: NonWildcardTypeArguments)
        return left; 
    }

    var right = Expression._expression3(prev);
    return right
        ? new CastExpression(prev, left, right)
        : left;
}


function PrefixExpression(prev, state, prefixOp) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.op = prefixOp;
    this.expression = Expression._expression3(this);

    this._end();
}
util.inherits(PrefixExpression, SimpleNode);

/** 
 * SelectorExpression wraps the previous primary.
 *  Chained expressions gain an extra property,
 *  '_chain', which is the expression preceeding
 *  it in the chain. EX: In `Foo.this`, the `this`
 *  IdentifierExpression gets _chain -> Foo. `Foo`
 *  is the head of the chain, and our `left` value,
 *  so it gets nothing.
 */
function SelectorExpression(primary, connector) {
    SimpleNode.call(this, primary.getParent());

    this.start = primary.start;
    this.left = primary;
    this.chain = [];

    var tok = this.tok;
    while (connector) {
        if ('.' == connector) {
            var state = tok.prepare();
            var next = tok.readIdentifier();

            switch(next) {
            case 'this':
                this._push(new IdentifierExpression(this, state, 'this'));
                break; // break out of switch (to "clear" comment below)
            case 'new':
                this._push(Creator.read(this));
                break;

            case 'super':
                this._push(new SuperExpression(this, state));
                break;

            default:
                var typeArgs = TypeArguments.readNonWildcard(this);
                if (typeArgs) {
                    next = tok.readIdentifier();

                    // NB The spec says YES, but the compiler says NO.
                    // if (next == 'super') {
                    //     t_is..push(new SuperExpression(this, typeArgs));
                    //     break;
                    // }

                    if (!tok.peekParenOpen())
                        tok.raise("arguments to explicit generic invocation");
                }

                if (!next) {
                    tok.raise("identifier");
                    connector = undefined;
                    break;
                }

                if (tok.peekParenOpen())
                    this._push(new MethodInvocation(this, state, next, typeArgs));
                else
                    this._push(new IdentifierExpression(this, state, next));
            }

        } else if ('[' == connector) {
            var expr = Expression.read(this);
            if (expr) {
                this._push(new ArrayAccessExpression(this, expr));
                tok.expectBracketClose();
            }
        }

        connector = undefined; // clear
        if (tok.readDot())
            connector = '.';
        if (tok.readBracketOpen())
            connector = '[';
    }

    this._end();
}
util.inherits(SelectorExpression, SimpleNode);

SelectorExpression.prototype.evaluateType = function(classLoader, cb) {
    if (!this.chain.length)
        return this.left.evaluateType(classLoader, cb);

    // pick the last element in the chain (I guess?)
    var last = this.chain[this.chain.length - 1];
    last.evaluateType(classLoader, cb);
};


SelectorExpression.prototype._push = function(expr) {
    var prev = this.chain.length 
        ? this.chain[this.chain.length - 1]
        : this.left;
    
    expr._chain = prev;
    this.chain.push(expr);
};


SelectorExpression.read = function(primary) {
    if (!primary)
        return;

    var tok = primary.tok;
    var state = tok.save();
    if (tok.readDot())
        return new SelectorExpression(primary, '.');
    if (tok.readBracketOpen()) {
        if (tok.readBracketClose())
            tok.raise("Array SelectorExpression");
        return new SelectorExpression(primary, '[');
    }

    // might have read bracket open prematurely
    primary.tok.restore(state);
}

function ArrayAccessExpression(prev, access) {
    SimpleNode.call(this, prev);

    this.start = access.start;
    this.value = access;

    this._end();
}
util.inherits(ArrayAccessExpression, SimpleNode);

function SuperExpression(prev, state) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    if (state) {
        this.start_from(state);
    } else {
        tok.expectString("super");
    }

    this.args = Arguments.read(this);
    if (!this.args) {
        this.method = tok.readIdentifier();
        this.args = Arguments.read(this);
    }

    this._end();
}
util.inherits(SuperExpression, SimpleNode);

SuperExpression.prototype.evaluateType = function(classLoader, cb) {
    if (this._chain) {
        this._chain.evaluateType(classLoader, function(err, resolved) {
            // ask the classloader to find it
            classLoader.openClass(resolved.type, ['extends'], 
            function(err, projection) {
                if (err) return cb(err);
                if (!projection.extends) 
                    return cb(new Error("No supertype of " + resolved.type));
                cb(null, projection.extends);
            });
        });
    } else {
        var type = this.getDeclaringType();
        if (!type) return cb(new Error("Could not get declaring type for super"));
        if (!type.extends) return cb(new Error("No supertype of " + type.name));
        type.extends.evaluateType(classLoader, cb);
    }
};


function TernaryExpression(prev, question) {
    SimpleNode.call(this, prev);

    this.start = question.start;
    this.question = question;

    // the spec says Expression.read, but
    //  that doesn't make sense... you can't
    //  do an assignment *only* in the "true" branch
    this.ifTrue = Expression._expression1(this);
    prev.tok.expectColon();
    this.ifFalse = Expression._expression1(this);

    this._end();
}
util.inherits(TernaryExpression, SimpleNode);

function InstanceOfExpression(prev, left) {
    SimpleNode.call(this, prev);

    this.start = left.start;
    this.left = left;
    this.right = Type.read(this);

    this._end();
}
util.inherits(InstanceOfExpression, SimpleNode);


function Primary(prev) {
    SimpleNode.call(this, prev);

    this._end();
}
util.inherits(Primary, SimpleNode);

Primary.read = function(prev) {
    var tok = prev.tok;

    var parens = Expression.readParen(prev);
    if (parens)
        return parens;

    if (tok.peekGenericOpen()) {
        // NB spec says Yes, theoretically, but
        //  I think it's handled by Selector
        tok.raiseUnsupported("NonWildcardTypeArguments");
    }

    var literal = Literal.read(prev);
    if (literal)
        return literal;

    var state = tok.prepare();
    var ident = tok.readIdentifier();
    switch (ident) {
    case "this":
        if (tok.peekParenOpen())
            return new MethodInvocation(prev, state, ident);
        return new IdentifierExpression(prev, state, ident);
    case "super":
        return new SuperExpression(prev, state);
    // case "void":
    //     tok.raiseUnsupported("class literal");
    //     break;

    case "new":
        return Creator.read(prev);

    default:
        tok.restore(state);

        // this factory will handle eg: BasicType{[]}.class
        return IdentifierExpression.read(prev);
    }
}


/** Factory for literals */
var Literal = {
    _Value: function(prev, state, value) {
        SimpleNode.call(this, prev);

        this.start_from(state);
        this.value = value;
        this._end();
    },
    
    read: function(prev) {
        
        var tok = prev.tok;
        var peeked = String.fromCharCode(tok.peek());

        var lit;
        var state = tok.prepare();
        switch (peeked) {
        case '"':
        case "'":
            lit = StringLiteral.read(prev);
            if (!lit)
                tok.raise("String literal");
            return lit;
        case 'f':
            if (!tok.readString("false"))
                return;
            return new Literal._Value(prev, state, false);
        case 'n':
            if (!tok.readString("null"))
                return;
            return new Literal._Value(prev, state, null);
        case 't':
            if (!tok.readString("true"))
                return;
            return new Literal._Value(prev, state, true);
        }

        return NumberLiteral.read(prev);
    }
};
util.inherits(Literal._Value, SimpleNode);


/**
 * Actually hosts both String and char literals
 */
function StringLiteral(prev, state, value, type) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.value = value;
    this.type = type;

    this._end();
}
util.inherits(StringLiteral, SimpleNode);

StringLiteral.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();
    var target;
    if (tok.readQuote())
        target = '"';
    else if (tok.readApostrophe())
        target = "'";
    else
        return;
    
    // read in the string
    var buffer = '';
    var last = null;
    var next;
    while (!tok.isEof()) {
        next = String.fromCharCode(tok.read());
        if (last != '\\' && next == target)
            break;

        buffer += next;
        last = next;
    }

    // special case
    if (target == "'") {
        if (buffer.length > 1)
            tok.raise("char literal should be only 1");
        return new StringLiteral(prev, state, buffer, 'char');
    }

    return new StringLiteral(prev, state, buffer, 'String');
}


function NumberLiteral(prev, state, value, type) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.value = value;
    this.type = type;

    this._end();
}
util.inherits(NumberLiteral, SimpleNode);

NumberLiteral.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();

    if (tok.readDot()) {
        // special case
        return NumberLiteral._readFloaty(prev, state, '.');
    }

    var buf;
    var digit = tok.readDigit(10);
    if (digit === undefined)
        return; // not a number

    if (digit == '0' && tok.readString('x')) {
        // hex number
        buf = '0x' + NumberLiteral._readNumber(tok, 16);
        return NumberLiteral._newInty(prev, state, buf);
    } else if (digit == '0' && tok.readString('b')) {
        // binary number
        buf = '0b' + NumberLiteral._readNumber(tok, 2);
        return NumberLiteral._newInty(prev, state, buf);
    }

    buf = digit;
    buf += NumberLiteral._readNumber(tok, 10);

    if (tok.readDot()) {
        buf += '.';
        return NumberLiteral._readFloaty(prev, state, buf);
    }

    // just an int
    return NumberLiteral._newInty(prev, state, buf);
}

NumberLiteral._newInty = function(prev, state, buf) {
    var type = 'int';
    var tok = prev.tok;
    if (tok.readString('L') || tok.readString('l')) {
        buf += 'L';
        type = 'long'
    }

    return new NumberLiteral(prev, state, buf, type);
}

NumberLiteral._readNumber = function(tok, radix) {

    var buffer = '';
    var read;
    while ((read = tok.readDigit(radix)) !== undefined
            || tok.readUnderline()) {
        if (read !== undefined)
            buffer += read;
    }

    return buffer;
};

NumberLiteral._readFloaty = function(prev, state, buffer) {
    if (buffer === undefined)
        buffer = '';

    var tok = prev.tok;
    buffer += NumberLiteral._readNumber(tok, 10);

    if (!buffer || buffer == '.') {
        // no number here :(
        tok.restore(state);
        return;
    }

    var type = 'double';
    if (tok.readString('e')) {
        // scientific notation
        buffer += 'e' + NumberLiteral._readNumber(tok, 10);
    } else {
        // normal
        var next = String.fromCharCode(tok.peek());
        if (next == 'f' || next == 'F') {
            tok.read(); // eat the char
            type = 'float';
        }
    }

    return new NumberLiteral(prev, state, buffer, type);
};


function Creator(prev, typeArgs, type) {
    SimpleNode.call(this, prev);

    this.start = typeArgs 
        ? typeArgs.start
        : type.start;
    var tok = this.tok;
    this.type = type;
    this.typeArgs = typeArgs;
    if (!typeArgs && tok.readBracketOpen()) {
        if (tok.readBracketClose()) {
            // eg: []..
            this.array = 1;
            this._readEmptyArrays();

            // eg: [] { .. }
            if (tok.peekBlockOpen())
                this.initializer = VarDef.readArrayInitializer(prev);
        } else {
            // eg: [2]..[]..
            this.array = 0;
            this.arraySizes = [];
            this._readSizedArrays();
            this._readEmptyArrays();
        }
    } else {
        this.args = new Arguments(this);

        if (tok.peekBlockOpen()) {
            this.body = new ClassBody(this);
        }
    }

    this._end();
}
util.inherits(Creator, SimpleNode);

Creator.prototype._readEmptyArrays = function() {
    var tok = this.tok;
    while (tok.readBracketOpen()) {
        tok.expectBracketClose();
        this.array++;
    }
};

Creator.prototype._readSizedArrays = function() {
    do {
        var expr = Expression.read(this);
        if (expr) {
            this.arraySizes.push(expr);
        }
        this.tok.expectBracketClose();
        this.array++;
    } while (this.tok.readBracketOpen());
};


Creator.read = function(prev) {
    var typeArgs = TypeArguments.readNonWildcard(prev);
    var createdName = Type.readCreated(prev);
    if (!createdName)
        return;

    return new Creator(prev, typeArgs, createdName);
};


function Arguments(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectParenOpen();
    if (!tok.readParenClose()) {
        this.kids = [];

        do {
            this.kids.push(Expression.read(this));
        } while (tok.readComma());

        tok.expectParenClose();
    }

    this._end();
}
util.inherits(Arguments, SimpleNode);

Arguments.prototype.evaluateType = function(classLoader, cb) {
    this.getParent().evaluateType(classLoader, cb);
};


Arguments.read = function(prev) {
    if (prev.tok.peekParenOpen())
        return new Arguments(prev);
}


/**
 * Wraps an identifier ref
 */
function IdentifierExpression(prev, state, name) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.name = name;

    if (!name)
        this.tok.raiseUnsupported("No name for IdentifierExpression");

    this._end();
}
util.inherits(IdentifierExpression, SimpleNode);

IdentifierExpression.prototype.evaluateType = function(classLoader, cb) {
    var name = this.name;
    if (name == 'super')
        return cb(new Error('"super" should not be in an IdentifierExpression'));

    if (name == 'this') {
        if (this._chain) {
            // use the chain's value, but twiddle it to
            //  be "FROM_OBJECT" since "this" is referring
            //  to an instance
            return this._chain.evaluateType(classLoader, function(err, value) {
                if (value)
                    value.from = Ast.FROM_OBJECT;
                cb(err, value);
            });
        }

        // climb scope to find parent class
        var scope = this.getDeclaringType();
        if (!scope)
            return cb(new Error("Couldn't find containing scope"));

        // return scope.evaluateType(classLoader, cb);
        return cb(null, {
            type: scope.qualifiedName
          , from: Ast.FROM_OBJECT
        });
    }

    // FIXME chain

    var varDef = this.searchScope(name);
    if (varDef)
        return varDef.evaluateType(classLoader, cb);

    // possibly a class name of some kind?
    if (name.charAt(0) == name.charAt(0).toLowerCase()) {
        // nope, nevermind. don't bother.
        return cb(new Error("Unable to resolve variable " + name));
    }

    this.getRoot().resolveType(classLoader, name, function(resolved) {
        if (!resolved) return cb(new Error("Unable to resolve class " + name));

        cb(null, {
            type: resolved
          , from: Ast.FROM_TYPE
        });
    });

    // SimpleNode.prototype.evaluateType.call(this, classLoader, cb);
};

IdentifierExpression.prototype.resolveDeclaringType = function(classLoader, cb) {
    if (this._chain) {
        // is this sufficient?
        this._chain.resolveDeclaringType(classLoader, cb);
        return;
    }

    // am I actually a type?
    var self = this;
    this.getRoot().resolveType(classLoader, this.name, function(resolved) {
        if (resolved) return cb(null, resolved);

        // nope... I'm definitely a var. Did we declare it here?
        var varDef = self.searchScope(self.name);
        if (varDef) {
            var declaring = varDef.getDeclaringType();
            if (declaring && declaring.qualifiedName)
                cb(null, declaring.qualifiedName);
            else if (declaring)
                cb(new Error('Could not resolve type ' + declaring.name));
            else
                cb(new Error('Could not resolve declaring type of ' + varDef.name));
            return;

        }

        cb(new Error("UNIMPLEMENTED"));
    });

//     var parent = this.getParent();
//     console.log("I am", this.constructor.name, this.name);
//     console.log(this.name, 
//         this.start, this.end,
//         parent.constructor.name,
//         parent.start, parent.end,
//         parent.kids.length,
//         parent.kids[0].constructor.name,
//         parent.kids[0].left.name);
//     cb(new Error("UNIMPLEMENTED"));
};


IdentifierExpression.read = function(prev) {
    var tok = prev.tok;
    var state = tok.prepare();
    // NB the spec suggests qualified, here,
    //  but I'd rather be more consistent and use
    //  SelectorExpressions
    // var name = tok.readQualified();
    var name = tok.readIdentifier();

    if (Tokenizer.isPrimitive(name)) {
        // actually, a BasicType
        tok.restore(state); // BasicType reads the name
        return new BasicType(prev);
    }

    if (tok.peekParenOpen())
        return new MethodInvocation(prev, state, name);

    // is this a Class[]...class expression?
    var preBrackets = tok.save();
    if (tok.readBracketOpen()) {
        // read all brackets
        do {
            tok.readBracketClose();
        } while(tok.readBracketOpen());

        if (tok.readDot() && tok.readString("class")) {
            // actually a class array literal
            tok.restore(state);
            return new ReferenceType(prev);
        }

        // nope. back up
        tok.restore(preBrackets);
    }

    if (name)
        return new IdentifierExpression(prev, state, name);
}

function MethodInvocation(prev, state, name, typeArgs) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.name = name;
    this.args = new Arguments(this);
    this.typeArgs = typeArgs;

    this._end();
}
util.inherits(MethodInvocation, SimpleNode);

function _declaringFromQualified(method) {
    var declaring = method.qualified || method.qualifiedName;
    return declaring.substr(0, declaring.indexOf('#'));
}

MethodInvocation.prototype.resolveDeclaringType = function(classLoader, cb) {
    var self = this;
    if (!this._chain) {
        // statically imported?
        var root = this.getRoot();
        var staticImportParent = root.getStaticImportType(this.name);
        if (staticImportParent) 
            return cb(null, staticImportParent, null);

        // local...?
        var method = this.searchMethodScope(this.name);
        if (method) return cb(null, _declaringFromQualified(method), method);
        
        // superclass or interfaces
        var type = this.getDeclaringType();
        if (!type)
            return cb(new Error("Couldn't determine declaring type for " + this.name));

        root.searchParents(classLoader, type, function(parent, resolve) {
            classLoader.openClass(parent, {method: self.name}, resolve);
        }, function(err, method) {
            if (err) return cb(err);

            cb(null, _declaringFromQualified(method), method); 
        });
    } else {
        this._chain.evaluateType(classLoader, function(err, resolved) {
            if (err) {
                return cb(new Error("Could not resolve " 
                    + self.name + "(): " + err.message));
            }

            // ask the classloader to find it
            classLoader.openClass(resolved.type, {method:self.name}, 
            function(err, method) {
                if (err) return cb(err);

                cb(null, _declaringFromQualified(method), method); 
            });
            // cb(new Error("INCOMPLETE; " + resolved));
        });
    }
};

MethodInvocation.prototype.evaluateType = function(classLoader, cb) {
    // figure out where we live
    var self = this;
    this.resolveDeclaringType(classLoader, function(err, type, method) {
        if (err) return cb(err);

        if (method === null) {
            // static-imported
            return self._getReturnType(classLoader, type, cb);
        }
        
        // self._getReturnType(classLoader, method.returns, cb);
        _dispatchReturnType(classLoader, method, cb);
    });
};

/**
 * Given a type known to contain
 *  (or... at least extend/implement a type known
 *  to contain this method def), locate that type 
 *  and search it for the method def
 */
MethodInvocation.prototype._getReturnType = function(classLoader, type, cb) {
    this.getRoot().resolveMethodReturnType(classLoader, type, this.name, cb);
};

function _dispatchReturnType(classLoader, m, cb) {
    if (!m.returns) {
        return cb(null, {
            type: 'void'
          , from: Ast.FROM_METHOD
        });
    }

    if (!(m instanceof SimpleNode)) {
        // this is an object which should already be fully resolved
        return cb(null, {
            type: m.returns
          , from: Ast.FROM_METHOD
        });
    }

    // it's a SimpleNode... evaluate the type
    m.returns.evaluateType(classLoader, function(err, resolved) {
        if (err) return cb(err);
        cb(null, {
            type: resolved.type
          , from: Ast.FROM_METHOD
        });
    });
}



/**
 * Params decl for methods
 */
function FormalParameters(prev) {
    ScopeNode.call(this, prev);

    this.tok.expectParenOpen();

    this.kids = [];

    var tok = this.tok;
    while (!(tok.readParenClose() || tok.isEof())) {

        // simple way to capture final/Annotation
        var mods = Modifiers.read(this);
        var type = Type.read(this);

        // let's go out of our way for flexible parsing
        //  (allow incompleteness, if Tokenizer is non-strict)
        if (type) {
            var name = tok.readIdentifier();
            if (!name) {
                name = 'arg' + this.kids.length;
                if (!this.getRoot().fromJavap)
                    tok.raise("Name (for Params)");
            }

            this.kids.push(new VarDef(this, mods, type, name, false));
        } else {
            tok.raise("Type (for Params)");
        }

        tok.readComma();
    }

    this._end();
}
util.inherits(FormalParameters, ScopeNode);

FormalParameters.prototype.project = function(classLoader, cb) {
    async.map(this.kids, function(def, cb) {
        def.project(classLoader, cb);
    }, cb);
};


FormalParameters.prototype._getVars = function() {
    return this.kids;
};


/**
 * Modifiers list
 */
function Modifiers(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
    var end = tok.getPos();
    while (!tok.isEof()) {
        var annotation = Annotation.read(this);
        if (annotation) {
            this.kids.push(annotation);
            continue;
        }

        end = tok.getPos();
        var ident = tok.peekIdentifier();
        if (!Tokenizer.isModifier(ident)) 
            break;
        
        this.kids.push(tok.readIdentifier());
    }

    this._end();
    this.end = end;
}
util.inherits(Modifiers, SimpleNode);

Modifiers.prototype.project = function(classLoader, cb) {
    async.map(this.kids, function(el, cb) {
        if (typeof(el) == 'string')
            return cb(null, el);

        el.project(classLoader, cb);
    }, function(err, items) {
        if (err) return cb(err);
        cb(null, items.join(' '));
    })
};


Modifiers.read = function(prev) {
    var tok = prev.tok;
    if (!(tok.peekAt()
            || Tokenizer.isModifier(tok.peekIdentifier())))
        return;

    return new Modifiers(prev);
}


function Annotation(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectAt();

    this.name = tok.readQualified();
    if (tok.readParenOpen()) {
        this.args = [];

        var self = this;
        var addAll = function(array) {
            array.forEach(function(el) {
                self.args.push(el);
            });
        }

        do {
            var element = this._readElement();
            if (Array.isArray(element)) {
                addAll(element);
            } else {
                this.args.push(element);
            }
        } while (tok.readComma());

        tok.expectParenClose();
    }

    this._end();
}
util.inherits(Annotation, SimpleNode);

Annotation.prototype.project = function(classLoader, cb) {
    cb(null, '@' + this.name); // TODO args?
};


Annotation.prototype._readElement = function() {
    var tok = this.tok;
    var state = tok.save();

    // is this a pair?
    var ident = tok.readIdentifier();
    if (tok.peekEquals()) {
        return this._readElementPairs(state, ident);
    }

    // just a value. let's start over
    tok.restore(state);
    return Annotation._readElementValue(this);
};

Annotation.prototype._readElementPairs = function(state, ident) {
    var pairs = [
        new AnnotationElementValuePair(this, state, ident)
    ];
    while (this.tok.readComma()) {
        pairs.push(new AnnotationElementValuePair(this));
    }
    return pairs;
};

Annotation._readElementValue = function(prev) {

    var tok = prev.tok;
    if (tok.peekAt())
        return Annotation.read(prev);

    if (tok.peekBlockOpen()) {
        // ElementValueArrayInitializer
        return new AnnotationElementValueArray(prev);
    }

    return Expression._expression1(prev);
};

Annotation.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();
    if (!tok.readAt()) {
        tok.restore(state);
        return;
    }

    var ident = tok.readIdentifier();
    tok.restore(state);
    if (!ident || Tokenizer.isReserved(ident))
        return;

    return new Annotation(prev);
};

function AnnotationElementValuePair(prev, state, ident) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    if (state) {
        this.start_from(state);
        this.name = ident;
    } else {
        this.name = tok.readIdentifier();
    }

    tok.expectEquals();
    this.value = Annotation._readElementValue(this);

    this._end();
}
util.inherits(AnnotationElementValuePair, SimpleNode);

function AnnotationElementValueArray(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectBlockOpen();

    this.kids = [];
    do {
        this.kids.push(Annotation._readElementValue(prev));
    } while (tok.readComma());

    tok.expectBlockClose();

    this._end();
}
util.inherits(AnnotationElementValueArray, SimpleNode);



/**
 * Factory for Types
 */
var Type = {
    read: function(prev, skipArray, allowDiamond) {
        var ident = prev.tok.peekIdentifier();
        if (!ident)
            return; // no identifier
        else if ('void' == ident || Tokenizer.isPrimitive(ident))
            return new BasicType(prev, skipArray);
        else if (Tokenizer.isReserved(ident))
            return; // not a type

        return new ReferenceType(prev, skipArray, allowDiamond);
    },

    /** Read CreatedName */
    readCreated: function(prev) {
        return Type.read(prev, true, true);
    }
}

/**
 * Base class for nodes that host some sort of Type
 */
function TypeNode(prev, skipArray) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this.simpleName = this.name; // Simple name will drop all typearguments

    if (!this.name)
        tok.raiseUnsupported("Empty name for " + this.constructor.name);

    if (skipArray === undefined)
        this.array = 0; // dimensions of array; zero means not an array
}
util.inherits(TypeNode, SimpleNode);

TypeNode.prototype._readArray = function() {
    if (this.array === undefined)
        return; // nop

    var tok = this.tok;
    var state = tok.save();
    while (tok.readBracketOpen()) {
        if (!tok.readBracketClose()) {
            tok.restore(state);
            return;
        }

        this.array++;
    }
};

TypeNode.prototype.evaluateType = function(classLoader, cb) {
    var self = this;
    this.getRoot().resolveType(classLoader, this.name, function(type) {
        if (!type) return cb(new Error("Couldn't resolve type " + self.name));
    
        cb(null, {
            type: type
          , from: Ast.FROM_TYPE
          , array: self.array
        });
    });
};
    

function BasicType(prev, skipArray) {
    TypeNode.call(this, prev, skipArray);

    // easy
    this._readArray();
    this._end();
}
util.inherits(BasicType, TypeNode);

BasicType.prototype.project = function(classLoader, cb) {
    cb(null, this.name);
};


/**
 * NB: The name property will be the full
 *  path, minus type arguments. The simpleName
 *  property will always be the "actual" type,
 *  IE the last qualified identifier. typeArgs
 *  will always be those attached to simpleName.
 *
 * For the full path with TypeArguments, check
 *  namePath; it's an array of tuples, where the
 *  first item in the tuple is name part, and
 *  the second is the type args (if any) attached
 *  to that name.
 */
function ReferenceType(prev, skipArray, allowDiamond) {
    TypeNode.call(this, prev, skipArray);

    var tok = this.tok;

    // <TypeArguments> . etc.
    this.firstName = this.simpleName; // don't forget
    this.typeArgs = TypeArguments.read(this, allowDiamond);
    var state = tok.prepare();
    if (tok.readDot()) {
        this._readQualified(state, allowDiamond);
    } else if (this.getRoot().fromJavap && tok.readSlash()) {
        this._readQualified(state, allowDiamond, 'readSlash');
    }

    this._readArray();
    this._end();
}
util.inherits(ReferenceType, TypeNode);

ReferenceType.prototype.project = function(classLoader, callback) {
    this.getRoot().resolveType(classLoader, this.name, function(type) {
        callback(null, type);
    });
};

ReferenceType.prototype.resolve = function(classLoader, callback) {
    this.getRoot().resolveType(classLoader, this.name, callback);
};

ReferenceType.prototype.resolveDeclaringType = function(classLoader, cb) {
    var self = this;
    this.resolve(classLoader, function(type) {
        if (!type) return cb(new Error("Could not resolve " + self.name));
        cb(null, type);
    });
};


ReferenceType.prototype._readQualified = function(state, allowDiamond, reader) {

    if (!reader) 
        reader = 'readDot';

    var tok = this.tok;
    this.namePath = [[this.name, this.typeArgs]];
    do {
        var ident = tok.readIdentifier();
        if (Tokenizer.isReserved(ident)) {
            // else, eg: Type.this
            tok.restore(state);
            return;
        }
        
        this.name += '.' + ident;
        this.simpleName = ident;
        this.typeArgs = TypeArguments.read(this, allowDiamond);
        this.namePath.push([ident, this.typeArgs]);
    
    } while (tok[reader]());
};



function TypeParameters(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.kids = [];
    do {
        var state = tok.prepare();
        var ident = tok.readIdentifier();
        if (ident)
            this.kids.push(new TypeParameter(this, state, ident));
    } while (tok.readComma());
    tok.expectGenericClose();

    this._end();
}
util.inherits(TypeParameters, SimpleNode);

TypeParameters.read = function(prev) {
    var tok = prev.tok;
    if (!tok.readGenericOpen())
        return;

    return new TypeParameters(prev);
}

function TypeParameter(prev, state, ident) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.start_from(state);
    this.name = ident;
    if (tok.readString("extends")) {
        this.extends = [];
        do {
            this.extends.push(Type.read(this));
        } while (tok.readAnd());
    }

    this._end();
}
util.inherits(TypeParameter, SimpleNode);

function TypeArguments(prev, disallowWildcard) {
    SimpleNode.call(this, prev);

    this.isDiamond = false; // explicit
    this.kids = [];
    var tok = this.tok;
    do {
        if (tok.readQuestion()) {
            if (disallowWildcard)
                tok.raise("No wildcard type arguments here");
            this.kids.push(new WildcardTypeArgument(this));
        } else {
            this.kids.push(Type.read(this));
        }
    } while (tok.readComma());
    tok.expectGenericClose();

    this._end();
}
util.inherits(TypeArguments, SimpleNode);

/** Special version of TypeArguments for JDK7 Diamond syntax */
TypeArguments.Diamond = {
    isDiamond: true
};

TypeArguments.read = function(prev, allowDiamond, disallowWildcard) {
    var tok = prev.tok;
    if (!tok.readGenericOpen())
        return;
    if (allowDiamond 
            && tok.readGenericClose() 
            && tok.checkJdk7("diamonds"))
        return TypeArguments.Diamond;

    return new TypeArguments(prev, disallowWildcard);
};

TypeArguments.readNonWildcard = function(prev, allowDiamond) {
    return TypeArguments.read(prev, allowDiamond, true);
}

function WildcardTypeArgument(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    if (tok.readString("extends"))
        this.extends = Type.read(this);
    else if (tok.readString("super"))
        this.super = Type.read(this);

    this._end();
}
util.inherits(WildcardTypeArgument, SimpleNode);


/**
 * Exports
 */
module.exports = {
    FROM_METHOD: Ast.FROM_METHOD,
    FROM_OBJECT: Ast.FROM_OBJECT,
    FROM_ANON: Ast.FROM_ANON,
    FROM_BODY: Ast.FROM_BODY,
    FROM_TYPE: Ast.FROM_TYPE,

    /** projection that includes everything projectable */
    PROJECT_ALL: ['fields', 'methods'],

    /**
     * @param buffer Either a node Buffer, or a dict with:
     *  - type: 'full' or 'part'; if 'part,' 'start' is required
     *  - text: a Buffer
     *  - start: First line of the buffer
     * @param options (Optional) A dict with:
     *  - strict: (default: true) Whether to bail
     *      immediately on error
     *  - level: (default: 7) JDK compatibility level. See: Tokenizer.Level
     *  - line: (default: 1) Line on which input starts 
     *  - ch: (default: 1) Column/character on which input starts
     *  - checkImports: (default: false) Experimental; checks
     *      expressions and Types to make sure they're accesible
     *      (IE: imported, or in same package). If `true`, the results
     *      will be in the `missing` array on the Ast root, and an
     *      event `missing` will be emitted
     *  - fromJavap: True if we're parsing the output of javap. There are
     *      some differences, such as type names being fully qualified, etc.
     *  - loader: A ClassLoader to use when checking imports. If not
     *      provided, we will fetch a cached one if needed
     */
    parseFile: function(path, buffer, options, callback) {
        if (!callback) {
            callback = options;
            options = {};
        }

        if ('part' == buffer.type) {
            // partial buffer! We need the base ast
            // and then we'll parse on top. Generally,
            // the base Ast should already be cached
            require('./classloader').cachedFromSource(path)
            .openAst(path, options, function(err, ast) {
                if (err) return callback(err);

                try {
                    ast.tok = new Tokenizer(path, buffer, options);
                    ast.parse(ClassBody);
                } catch (e) {
                    callback(e);
                    return;
                }

                callback(null, ast);
            });
            return;
        }

        var ast = new Ast(path, buffer, options);
        try {
            ast.parse(CompilationUnit);

        } catch(e) {
            callback(e);
            return;
        }
        callback(null, ast);
    },

    /**
     * Convenience for when you don't already have a buffer
     */
    readFile: function(path, options, callback) {
        if (!callback) {
            callback = options;
            options = {};
        }

        fs.readFile(path, function(err, buf) {
            if (err) return callback(err);

            return module.exports.parseFile(path, buf, options, callback);
        });
    }
}
