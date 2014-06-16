
var Ast = require('./ast')
  , parseFile = Ast.parseFile
  , ClassLoader = require('./classloader');

var CR = '\r'.charCodeAt(0);
var NL = '\n'.charCodeAt(0);

function Suggestor(path, buffer) {
    // NB the buffer may be a dict with a "type"
    this._path = path;
    this._buffer = buffer;
    this._start = buffer.start || 1;
    this._raw = buffer.text || buffer;
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
    if (!line) {
        return cb(new Error('Could not find line ' 
            + this._line 
            + ' (start:' + this._start + ')'));
    }

    // console.log("Found line!", line);

    // locate the last . before the cursor
    var dot = line.substr(0, this._col).lastIndexOf('.');

    var lineNo = this._line;
    var colNo = this._col;
    var self = this;
    if (~dot) {
        colNo = dot - 1;
    }

    // parseFile does the right thing 
    //  if our buffer is partial
    var loader = this._loader;
    parseFile(this._path, this._buffer, {
        strict: false
      // , debug: true
    }, function(err, ast) {
        if (err) return cb(err);

        // console.log("Locating...");
        var node = ast.locate(lineNo, colNo)
        if (!node) {
            console.log("... nothing :(");
            return cb(new Error("Unable to locate node at " + lineNo + "," + colNo));
        }
        // console.log("Found", require('util').inspect(node.toJSON(), {depth:5}));
        node.evaluateType(loader, function(err, result) {
            if (err) return cb(err);

            self._onTypeResolved(ast, result, cb);
        });
    });
};

Suggestor.prototype._extractLine = function() {
    var line = this._start;
    var lineStart = -1;
    var off = 0;
    while (true) {

        if (off > this._raw.length)
            return null;

        var oldLine = line;

        var token = this._raw[off];
        var nextToken = off + 1 < this._raw.length
            ? this._raw[off+1]
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
                return this._raw.toString("utf-8", lineStart, off);
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
        cb(err, result);
    });
};



module.exports = {
    of: function(path, buffer) {
        return new Suggestor(path, buffer);
    }
};
