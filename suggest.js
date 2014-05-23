
var Ast = require('./ast')
  , parseFile = Ast.parseFile
  , ClassLoader = require('./classloader');

var CR = '\r'.charCodeAt(0);
var NL = '\n'.charCodeAt(0);

function Suggestor(path, buffer) {
    this._path = path;
    this._buffer = buffer;
    this._loader = ClassLoader.fromSource(path);
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

        ast.locate(lineNo, colNo)
        .evaluateType(loader, function(err, result) {
            if (err) return cb(err);

            // FIXME check if this type is the return value
            //  of a method call
            // console.log(result);
            self._fromClass(result.type, ['methods', 'fields'], cb);
            // FIXME else, only STATIC methods, fields, subclasses
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

Suggestor.prototype._fromClass = function(className, projection, cb) {
    this._loader.openClass(className, projection, function(err, klass) {
        if (err) return cb(err);

        var projected = projection.reduce(function(obj, field) {
            obj[field] = klass[field];
            return obj;
        }, {});

        // if ('methods' in projected) {
        //     projected.methods = projected.methods.filter(function(method) {
        //         return method.name != '[constructor]';
        //     });
        // }

        cb(undefined, projected);
    });
};



module.exports = {
    of: function(path, buffer) {
        return new Suggestor(path, buffer);
    }
};
