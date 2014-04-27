
var Ast = require('./ast');
    //, util = require('util');

function Analyzer(path, buffer, ast) {
    
    this._path = path;
    this._buffer = buffer;
    this._ast = ast;
}

Analyzer.prototype.word = function(word) {
    this._word = word;

    return this;
}

Analyzer.prototype.at = function(line, col) {
    this._line = line;
    this._col = col;

    return this;
}

Analyzer.prototype.find = function(callback) {
    if (!this._ast) {
        this._ast = new Ast(this._path, this._buffer);
    }

    var found = false;

    var self = this;
    var onVarDef, onMethod, onStatement;
    onVarDef = function(node) {
        if (!node.matchesScope(self._line))
            return;

        //console.log(node.name);
        if (node.name == self._word) {
            self._ast.removeListener('vardef', onVarDef);

            var info = node.extractTypeInfo(self._word,
                self._line, self._col);
            if (info.resolved) {
                found = true;
                callback(null, info);
            } else {
                found = info;
            }

            // TODO short-circuit stop parsing (?)
            // TODO confirm that the type is a vardef,
            //  and not a method!
            return;
        }
    };

    onMethod = function(node) {
        if (node.name == self._word) {
            // TODO remove
            console.log("method on", node.dumpLine());
        }
    };

    onStatement = function(node) {
        if (!node.contains(self._line))
            return; 

        var info = node.extractTypeInfo(self._word, 
            self._line, self._col);
        if (!info) {
            //console.log('no info!', node.constructor.name);
            //console.log(' -->', node.dump());
            return;
        }

        self._ast.removeListener('statement', onStatement);

        if (!info.resolved) {
            // resolve after we've parsed everything
            found = info;
        } else {

            //console.log(util.inspect(info, {depth:null}));
            callback(null, info);
            found = true;
        }
    };

    self._ast
    .on('vardef', onVarDef)
    //.on('method', onMethod)
    .on('statement', onStatement)
    .parse(function() {
        // reached end!
        self._ast.removeListener('vardef', onVarDef);
        //self._ast.removeListener('method', onMethod);
        self._ast.removeListener('statement', onStatement);

        //console.log("end", self._word, found);
        if (!found) {
            callback({message:"Couldn't find"});
        } else if (found !== true) {
            // found, but it's unresolved
            self.resolve(found, callback);
        }
    });


    return this;
}

var _RESOLVERS = {};
_RESOLVERS[Ast.METHOD] = function(info, callback) {
    if (!info.container.resolved) {
        this._resolve(info.container, function(resolved) {
            // console.log("Resolved method container", resolved);
            info.owner = resolved;
            if (info.owner)
                info.resolved = true;

            // fill out the full, qualified name
            info.name = resolved.name + '#' + info.name;

            callback(info);
        });
    } else {
        callback(info);
    }
}

/** 
 * Method calls resolve such that its owner
 *  is set to a TYPE
 * @returns the TYPE returned by the method call
 */
_RESOLVERS[Ast.METHOD_CALL] = function(info, callback) {
    if (info.owner) {
        callback(info.owner); // we already know
        return;
    }

    var self = this;
    var onContainerResolved = function(resolved) {
        info.owner = resolved;
        if (info.owner)
            info.resolved = true;

        // find the method node and get the return type
        var qualifiedMethod = info.owner.name + '#' + info.name;
        var methodNode = self._ast.qualifieds[qualifiedMethod];
        var returnType = methodNode.extractReturnTypeInfo();
        callback(returnType);
    }

    var container = info.container;
    info.owner = container;
    if (!container.resolved) {
        this._resolve(info.container, onContainerResolved);
    } else {
        onContainerResolved(info.owner);
    }
}

/** 
 * Types simply resolve such that their name
 *  is filled out
 * @return The same object
 */
_RESOLVERS[Ast.TYPE] = function(info, callback) {
    var resolved = this._ast.resolveType(info.name);
    info.name = resolved;
    info.resolved = true;
    callback(info);
}

_RESOLVERS[Ast.VARIABLE] = _RESOLVERS[Ast.TYPE]; // same

/** internal delegate version */
Analyzer.prototype._resolve = function(info, callback) {
    _RESOLVERS[info.type].call(this, info, callback);
}

Analyzer.prototype.resolve = function(info, callback) {

    // console.log(JSON.stringify(info, null, '  '));

    // climb AST to figure out the containing
    //  type for the method call (if necessary)
    this._resolve(info, function(resolved) {

        // console.log("RESOLVED", resolved);

        if (resolved.resolved) {
            callback(null, resolved);
        } else {
            console.log("Unresolved!", info.name, resolved);
            callback({message:"Unresolved"});
        }
    });

}

module.exports = {
    of: function(path, buffer) {
        return new Analyzer(path, buffer);
    }
};
