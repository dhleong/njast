
var Ast = require('./ast')
  , parseFile = Ast.parseFile
  , ClassLoader = require('./classloader');

var CR = '\r'.charCodeAt(0);
var NL = '\n'.charCodeAt(0);

function Suggestor(path, buffer) {
    this._path = path;
    this._buffer = buffer;
    this._loader = ClassLoader.cachedFromSource(path);
}

Suggestor.prototype.at = function(line, col) {
    this._line = line;
    this._col = col;

    return this;
}

Suggestor.prototype.find = function(cb) {
    
    // extract the current line of text
    var line = this._extractLine();

    // locate the last . before the cursor
    var dot = line.substr(0, this._col).lastIndexOf('.');

    var lineNo = this._line;
    var colNo = this._col;
    var self = this;
    if (~dot) {
        colNo = dot - 1;
    }

    var loader = this._loader;
    parseFile(this._path, this._buffer, {
        strict: false
    }, function(err, ast) {
        if (err) return cb(err);

        var node = ast.locate(lineNo, colNo)
        console.log(node.constructor.name, node.name, node.start, node.end);
        node.evaluateType(loader, function(err, result) {
            if (err) return cb(err);

            // console.log(result);
            self._onTypeResolved(ast, result, cb);
        });
    });
};

Suggestor.prototype._extractLine = function() {
    var line = 1;
    var lineStart = -1;
    var off = 0;
    while (true) {

        var oldLine = line;

        var token = this._buffer[off];
        var nextToken = off + 1 < this._buffer.length
            ? this._buffer[off+1]
            : undefined;

        if (token == NL) {
            line++;

        } else if (token == CR ) {
            if (nextToken != NL) { // \r\n to end a line
                line++;            // just \r 
            } else {
                off++; // \r\n... skip next
            }
        }

        // advance
        off++;

        // check if we're done
        if (oldLine != line) {
            if (line == this._line)
                // found our line!
                lineStart = off;

            else if (line > this._line)
                // our line has ended!
                return this._buffer.toString("utf-8", lineStart, off);
        }
    }


};

Suggestor.prototype._onTypeResolved = function(ast, resolved, cb) {
    var className = resolved.type;
    var projection = ['methods', 'fields'];
    // FIXME check if this type is the return value
    //  of a method call
    // FIXME else, only STATIC methods, fields, subclasses

    // console.log("Resolved type:", className);
    if (ast.qualifieds[className]) {
        // shortcut the classloader
        ast.projectType(this._loader, className, projection, cb);
        return;
    }

    // let the class loader handle it
    this._loader.openClass(className, projection, function(err, result) {
        console.log("Projected", className, projection, err, result);
        cb(err, result);
    });
};



module.exports = {
    of: function(path, buffer) {
        return new Suggestor(path, buffer);
    }
};
