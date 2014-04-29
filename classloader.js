
var util = require('util')
  , path = require('path');

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
 * Attempts to locate the qualified class name within this
 *  loader and open a file handle to it. The callback should be:
 *      fn(err, ast:Class)
 *  where Class will at least implement the same interface that 
 *  our source Ast Class implements (IE it could actually be from
 *  a .class file)
 *
 * @param qualifiedName Class name to load
 * @param callback Callback function
 */
ClassLoader.prototype.openClass = function(/* qualifiedName, callback */) {
    throw new Error("openClass not implemented");
};


/**
 * The SourceProjectClassLoader loads classes via
 *  our Ast implementation from source files located
 *  as expected from a 'src' directory in a project root
 */
function SourceProjectClassLoader(projectRoot) {
    this._root = projectRoot;
}
util.inherits(SourceProjectClassLoader, ClassLoader);




/**
 * The SourceDirectoryClassLoader loads classes via
 *  our Ast implementation from source files located
 *  in the given directory
 */
function SourceDirectoryClassLoader(dir) {
    this._root = dir;
}
util.inherits(SourceDirectoryClassLoader, ClassLoader);



/**
 * The JarClassLoader loads classes from their bytecode
 *  found in a jar file
 */
function JarClassLoader(jarPath) {
    this._jar = jarPath;
}
util.inherits(JarClassLoader, ClassLoader);

module.exports = {
    /**
     * Create a ClassLoader appropriate for the project
     *  holding "sourceFilePath"
     */
    fromSource: function(sourceFilePath) {
        // find the root dir of the project
        var dir = path.dirname(sourceFilePath).split(path.sep);
        var srcIndex = dir.indexOf('src');
        if (!~srcIndex)
            return new SourceDirectoryClassLoader(sourceFilePath); // no apparent project root

        // TODO actually, compose this with any JarClassLoaders there,
        //  source dir for Android, etc.
        // TODO ALSO, cache these guys
        return new SourceProjectClassLoader(path.join(dir.slice(0, srcIndex)));
    }
}
