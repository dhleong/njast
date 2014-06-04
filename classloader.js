
var async = require('async')
  , glob = require('glob')
  , util = require('util')
  , path = require('path')
  , fs = require('fs')
  
  , Ast = require('./ast')  
  , parseFile = Ast.parseFile
  , readFile = Ast.readFile;

/**
 * Base ClassLoader interface; mostly for the
 *  method definition, but also provides the
 *  _getPath util method
 */
function ClassLoader() {
}

/**
 * Given a qualified class name, such as com.bar.Cool$Hot,
 *  returns an array of path names to the file, ex:
 *  ['com', 'bar', 'Cool.java']
 */
ClassLoader.prototype._getPath = function(className) {
    var split = className.split('.');
    var fileName = split[split.length - 1];
    var nested = fileName.indexOf('$');
    if (~nested) {
        fileName = fileName.substr(0, nested);
    }
    fileName += '.java';
    split[split.length - 1] = fileName;

    return split;
};

/**
 * Attempt to read an Ast at the given path. 
 *  Mostly, this is for providing caching
 *
 * @param path (required) Path to the file
 * @param buf (required) Pre-read buffer to use;
 *  if none available, simply pass "null"
 * @param cb (required) Callback when ready
 */
ClassLoader.prototype.openAst = function(/* path, buf, options, cb */) {
    throw new Error("openAst not implemented");
};


/**
 * Attempts to locate the qualified class name within this
 *  loader and open a file handle to it. The callback should be:
 *      fn(err, projection)
 *  where the projection is a unified json format across 
 *  .class loaders and source loaders
 *
 * The projection can be provided in two modes: general and 
 *  specific. In general mode, you provide an array of keys
 *  to extract from the type:
 *      methods, fields
 *  The result will be a dict with those keys above as keys,
 *   and an array of matching items as the values
 *
 * In specific mode, you provide a dict such as:
 *      {method: "foo"}
 *  to search for a specific item in this type hierarchy.
 *  The result will be the projection for that item only,
 *  if found. 
 *  
 * @param qualifiedName Class name to load
 * @param projection The projection to retrieve from the type.
 * @param callback Callback function
 */
ClassLoader.prototype.openClass = function(/* qualifiedName, projection, callback */) {
    throw new Error("openClass not implemented");
};

/**
 * Attempts to located the qualified class name within this
 *  loader and extract the return type of the given method name
 * @param cb fn(err, resolved:dict)
 *  where resolved looks like: {
 *      type: <fully.qualified.name>
 *      from: Ast.FROM_METHOD
 *  }
 */
ClassLoader.prototype.resolveMethodReturnType = function(/* type, name, cb */) {
    throw new Error("resolveMethodReturnType not implemented");
};

/**
 * Update the cache for the given path with an object.
 *  This is mostly used to pre-cache the AST for
 *  a script file, as the cache for JarClassLoader is
 *  unlikely to need updating
 *
 * @return True if the cache was updated
 */
ClassLoader.prototype.putCache = function(/* path, object */) {
    throw new Error("putCache not implemented");
};

/**
 * Scan this ClassLoader for importable types with the given name
 */
ClassLoader.prototype.suggestImport = function(/* name, callback */) {
    throw new Error("suggestImport not implemented");
};



/**
 * The ComposedClassLoader doesn't do any loading itself; instead
 *  it composes multiple ClassLoader implementations and provides
 *  caching
 */
function ComposedClassLoader(loaders) {
    this._loaders = loaders;
    this._cached = {};
}

ComposedClassLoader.prototype.openAst = function(path, buf, options, callback) {

    if (!callback) {
        if (!options) {
            // no buf, no options
            callback = buf;
            buf = null;
            options = null;
        } else {
            callback = options;

            // either buf or options
            if (buf instanceof Buffer || buf.type)
                options = null;
            else {
                options = buf;
                buf = null;
            }
        }
    }

    var loaders = this._loaders.map(function(loader) {
        return function(resolve) {
            loader.openAst(path, buf, options, resolve);
        };
    });

    async.parallel(loaders, function(err, results) {
        if (err) return callback(err);

        // reduce results into the first successful one
        var result = results.reduce(function(last, item) {
            if (last) return last;
            return item;
        });

        // finally, call the actual callback
        callback(err, result);
    });
};


ComposedClassLoader.prototype.openClass = function(qualifiedName, 
        projection, callback) {

    if (!callback) {
        callback = projection;
        projection = undefined;
    }

    // FIXME match projection
    if (qualifiedName in this._cached)
        return callback(null, this._cached[qualifiedName]);

    // create functions to call that are bound with
    // the qualifiedName arg, plus caching
    var self = this;
    var loaders = this._loaders.map(function(loader) {
        return function(cb) {
            loader.openClass(qualifiedName, projection, 
                    function(err, result) {
                // cache successful results
                // FIXME merge the projection types
                if (result && !err && Array.isArray(projection))
                    self._cached[qualifiedName] = result;

                // call through
                cb(err, result);
            });
        };
    });

    // evaluate wrapped loaders in parallel
    async.parallel(loaders, function(err, results) {
        // reduce results into the first successful one
        var result = results.reduce(function(last, item) {
            if (last) return last;
            return item;
        });

        // finally, call the actual callback
        callback(err, result);
    });
};

ComposedClassLoader.prototype.putCache = function(path, obj) {

    this._loaders.some(function(loader) {
        if (loader.putCache(path, obj))
            return true;

        return false;
    });
};


ComposedClassLoader.prototype.resolveMethodReturnType = function(type, name, cb) {
    var qualifiedName = type + '#' + name; // TODO args?
    if (qualifiedName in this._cached)
        return cb(null, this._cached[qualifiedName]);

    // create functions to call that are bound with
    // the qualifiedName arg, plus caching
    var self = this;
    var loaders = this._loaders.map(function(loader) {
        return function(onResolved) {
            loader.resolveMethodReturnType(type, name, function(err, result) {
                // cache successful results
                if (result && !err)
                    self._cached[qualifiedName] = result;

                // call through
                onResolved(err, result);
            });
        };
    });

    // evaluate wrapped loaders in parallel
    async.parallel(loaders, function(err, results) {
        if (err) return cb(err);

        // reduce results into the first successful one
        var result = results.reduce(function(last, item) {
            if (last) return last;
            return item;
        });

        // finally, call the actual callback
        cb(null, result);
    });
}

ComposedClassLoader.prototype.suggestImport = function(name, callback) {

    var loaders = this._loaders.map(function(loader) {
        return function(onSuggest) {
            loader.suggestImport(name, onSuggest);
        };
    });

    async.parallel(loaders, function(err, results) {
        if (err) return callback(err);

        var result = results.reduce(function(last, items) {
            for (var i = 0, len = items.length; i < len; i++) {
                var item = items[i];
                if (!~last.indexOf(item))
                    last.push(item);
            }
            return last;
        }, []);

        callback(null, result);
    });
};


/**
 * Base class for ClassLoaders that read source files
 */
function SourceClassLoader() {
    this._astCache = {};
    this._allCachedTypes = undefined; // not cached, yet
    this._fileToTypes = undefined; // not cached, yet
}
util.inherits(SourceClassLoader, ClassLoader);

SourceClassLoader.prototype.openAst = function(path, buf, options, cb) {

    var cached = this._astCache[path];
    if (cached) return cb(null, cached);

    if (buf) {
        parseFile(path, buf, options, cb);
    } else {
        readFile(path, options, cb);
    }
};


SourceClassLoader.prototype.resolveMethodReturnType = function(type, name, cb) {
    var self = this;
    this._getPathForType(type, function(err, path) {
        if (err) return cb(err);

        var cached = self._astCache[path];
        if (cached)
            return cached.resolveMethodReturnType(self, type, name, cb);
        
        readFile(path, {
            strict: false
        }, function(err, ast) {
            if (err) return cb(err);

            ast.resolveMethodReturnType(self, type, name, cb);
        });
    });
};

SourceClassLoader.prototype.openClass = function(qualifiedName, 
        projection, callback) {

    if (!callback) {
        callback = projection;
        projection = undefined;
    }

    var self = this;
    this._getPathForType(qualifiedName, function(err, path) {
        if (err) return callback(err);

        fs.readFile(path, function(err, buf) {
            if (err) return callback(err);

            if (!projection) return callback(null); // we just care that it worked

            // we want a projection
            parseFile(path, buf, {
                strict: false
            }, function(err, ast) {
                if (err) return callback(err);

                ast.projectType(self, qualifiedName, projection, callback);
            });
        });
    });
};

SourceClassLoader.prototype.putCache = function(path, ast) {
    if (~path.indexOf(this._root)) {
        this._astCache[path] = ast;

        // invalidate types cache for this obj.
        if (!this._fileToTypes)
            return;

        var existing = this._fileToTypes[path];
        var newtypes = Object.keys(ast.qualifieds);
        var self = this;

        // first, check for deleted types
        var gone = existing.filter(function(type) {
            return !~newtypes.indexOf(type);
        });
        gone.forEach(function(type) {
            var idx = existing.indexOf(type);
            existing.splice(idx, 1);

            idx = self._allCachedTypes.indexOf(type);
            if (idx >= 0) // should be
                self._allCachedTypes.splice(idx, 1);
        });

        // now, check for new types
        newtypes.forEach(function(qualified) {
            if (!isType(qualified))
                return;

            if (!~existing.indexOf(qualified)) {
                // new type
                existing.push(qualified);
                self._allCachedTypes.push(qualified);
            }
        });
    }

};

SourceClassLoader.prototype.suggestImport = function(name, callback) {

    var suggestions = [];

    // basically, we have to scan each file looking for "name."
    var len = name.length;
    this.walkTypes(function(type) {
        // console.log(type.indexOf(name), type.length - len);
        if (type.indexOf(name) == type.length - len)
            suggestions.push(type);
    }, function(err) {

        callback(err, suggestions);
    });
};

/**
 * Walk across all Type names known to this ClassLoader with
 *  the given iterator. The iterator is a function that takes
 *  a `name`, which is the fully-qualified Type name, and a `callback`,
 *  which should be called when you're done. If called with
 *  a truth-y value (including an Error), the iteration will stop.
 *
 * onComplete will be called when walking is done with any error
 *  that was passed from iterator
 *
 * The iterator can optionally not accept a callback, in which
 *  case every single type will be walked
 */
SourceClassLoader.prototype.walkTypes = function(iterator, onComplete) {
    
    // wraps the iterator and does the right thing
    function iterate(type, onEach) {
        if (iterator.length <= 1) {
            iterator(type);
            onEach();
        } else {
            iterator(type, onEach);
        }
    }

    // use cached types
    if (this._allCachedTypes) {
        async.each(this._allCachedTypes, iterate, onComplete);
        return;
    }

    var allTypes = [];
    var fileTypes = {};
    var self = this;
    this._getSearchPaths().forEach(function(dir) {
        var search = dir + path.sep + '**' + path.sep + '*.java';
        glob(search, function(err, files) {
            if (err) return onComplete(err);

            async.each(files, function(file, onEach) {
                // load the AST and iterate
                //  over the qualifieds array
                readFile(file, {
                    strict: false
                }, function(err, ast) {
                    if (err) return onEach(err);

                    var thisTypes = [];
                    async.each(Object.keys(ast.qualifieds), function(qualified, cb) {
                        if (!isType(qualified))
                            return cb(); // method or field

                        thisTypes.push(qualified);
                        allTypes.push(qualified);
                        iterate(qualified, cb);
                    }, function(err) {
                        onEach(err);

                        fileTypes[file] = thisTypes;
                    });
                });
            }, function(err) {

                if (!err) {
                    self._allCachedTypes = allTypes;
                    self._fileToTypes = fileTypes;
                }
                    
                onComplete(err);
            });
        });
    });
};


SourceClassLoader.prototype._getPathForType = function(/* type, cb */) {
    throw new Error(this.constructor.name + " must implement _getPathForType");
};

/**
 * @return An [] of possible root search paths. They don't have to exist
 */
SourceClassLoader.prototype._getSearchPaths = function() {
    throw new Error(this.constructor.name + " must implement _getSearchPaths");
};



/**
 * The SourceProjectClassLoader loads classes via
 *  our Ast implementation from source files located
 *  as expected from a 'src' directory in a project root
 */
function SourceProjectClassLoader(projectRoot) {
    SourceClassLoader.call(this);

    this._root = projectRoot;
    this._paths = {};
}
util.inherits(SourceProjectClassLoader, SourceClassLoader);

SourceProjectClassLoader.prototype._getPathForType = function(qualifiedName, cb) {

    // since src files could be in some subdirectory,
    //  we'd like to skip lookups if possible.
    var known = this._paths[qualifiedName];
    if (known)
        return cb(null, known);

    var dirs = this._getPath(qualifiedName);
    var qualifiedPath = path.join.apply(path, dirs);

    // construct array of candidate tasks to check in parallel
    var candidates = this._getSearchPaths()
    .map(function(basePath) {
        var fullPath = path.join(basePath, qualifiedPath);
        return function(callback) {
            fs.exists(fullPath, function(exists) {
                callback(null, {
                    path: fullPath, 
                    exists: exists
                });
            });
        };
    });

    var self = this;
    async.parallel(candidates, function(err, result) {
        if (err) return cb(err);

        var actualPath = result.reduce(function(last, res) {
            if (last) return last;
            if (res.exists) 
                return res.path;
        }, null);

        if (!actualPath)
            return cb(new Error("Could not locate " + qualifiedName));

        self._paths[qualifiedName] = actualPath;
        cb(null, actualPath);
    });
};

SourceProjectClassLoader.prototype._getSearchPaths = function() {
    return [
        path.join(this._root, 'src')
      , path.join(this._root, 'src', 'main', 'java')
      , path.join(this._root, 'src', 'debug', 'java')
    ];
};



/**
 * The SourceDirectoryClassLoader loads classes via
 *  our Ast implementation from source files located
 *  in the given directory
 */
function SourceDirectoryClassLoader(dir) {
    SourceClassLoader.call(this);

    this._root = dir;
}
util.inherits(SourceDirectoryClassLoader, SourceClassLoader);

SourceDirectoryClassLoader.prototype._getPathForType = function(qualifiedName, cb) {
    // derive the "base package dir" from the first-loaded file.
    // this is kinda crap and we should deprecate in favor of SourceProjectClassLoader
    var dirs = this._getPath(qualifiedName);
    if (!this.packageLen) 
        this.packageLen = dirs.length - 1;

    var fileName = path.join.apply(path, dirs.slice(this.packageLen));
    var filePath = path.join(this._root, fileName);
    cb(null, filePath);
};

SourceDirectoryClassLoader.prototype._getSearchPaths = function() {
    return [this._root];
};



/**
 * The JarClassLoader loads classes from their bytecode
 *  found in a jar file
 */
function JarClassLoader(jarPath) {
    this._jar = jarPath;
}
util.inherits(JarClassLoader, ClassLoader);

JarClassLoader.prototype.openAst = function(path, buf, options, callback) {
    // we can't open ast
    callback(null, null);
};


JarClassLoader.prototype.putCache = function() {
    // nop; we won't need to update cache
};


/** wrap any loader in a ComposedClassLoader for caching */
function _cached(loader) {
    return new ComposedClassLoader([loader]);
}

// root -> CL
var CLASS_LOADER_CACHE = {};

module.exports = {
    /**
     * Create a ClassLoader appropriate for the project
     *  holding "sourceFilePath"
     */
    fromSource: function(sourceFilePath, _allowCached) {
        if (_allowCached === undefined)
            _allowCached = false;

        // find the root dir of the project
        var sourceDir = path.dirname(sourceFilePath);
        var dir = sourceDir.split(path.sep);
        var srcIndex = dir.indexOf('src');
        if (!~srcIndex) {
            // no apparent project root
            // TODO climb tree until no more .java
            // TODO see if we have one cached
            return _cached(new SourceDirectoryClassLoader(sourceDir)); 
        }

        // find project dir, check cache
        var projectDir = path.join.apply(path, dir.slice(0, srcIndex));
        if (_allowCached && projectDir in CLASS_LOADER_CACHE)
            return CLASS_LOADER_CACHE[projectDir];

        // TODO actually, compose this with any JarClassLoaders there,
        //  source dir for Android, etc.

        if (dir[0] === '')
            projectDir = path.sep + projectDir;
        return _cached(new SourceProjectClassLoader(projectDir));
    },

    cachedFromSource: function(sourceFilePath) {
        return module.exports.fromSource(sourceFilePath, true);
    }
}

function isType(qualified) {
    // if '#,' this is a field or method
    return !~qualified.indexOf('#');
}
