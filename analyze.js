
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
            callback(null, node.extractTypeInfo(self._word,
                self._line, self._col));
            found = true;

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
            self._resolve(found, callback);
        }
    });


    return this;
}

Analyzer.prototype._resolve = function(info, callback) {


    // TODO climb AST to figure out the containing
    //  type for the method call (if necessary)
    var current = info;
    while (!current.resolved) {
        if (!current.container)
            break;

        current = current.container;
    }
    
    var resolved = this._ast.resolveType(current.name);
    if (resolved) {
        current.name = resolved;
        current.resolved = true;

        // TODO climb back up
        callback(null, info);
        return;
    }

    console.log("Unresolved!", current, resolved);
    callback({message:"Unresolved"});
}

module.exports = {
    of: function(path, buffer) {
        return new Analyzer(path, buffer);
    }
};
