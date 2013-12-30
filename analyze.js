
var Ast = require('./ast')
    util = require('util');

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
    var onVarDef, onMethod;
    onVarDef = function(node) {
        if (!node.matchesScope(self._line))
            return;

        //console.log(node.name);
        if (node.name == self._word) {
            self._ast.removeListener('vardef', onVarDef);
            found = true;
            callback(null, node);
            // TODO short-circuit stop parsing (?)
            // TODO confirm that the type is a vardef,
            //  and not a method!
            return;
        }
    };

    onMethod = function(node) {
        if (node.name == self._word) {
            console.log(node.dumpLine());
        }
    };

    onStatement = function(node) {
        if (!node.contains(self._line))
            return; 

        var info = node.extractTypeInfo(self._word, 
            self._line, self._col);
        if (!info) {
            console.log('no info!', node.constructor.name);
            console.log(' -->', node.dump());
            return;
        }

        console.log(util.inspect(info, {depth:null}));
        found = true;
        self._ast.removeListener('statement', onStatement);
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

        if (!found)
            callback(new Error("Couldn't find"));
    });


    return this;
}

module.exports = {
    of: function(path, buffer) {
        return new Analyzer(path, buffer);
    }
};
