
var Analyzer = require('./analyze');

var CR = '\r'.charCodeAt(0);
var NL = '\n'.charCodeAt(0);

function Suggestor(path, buffer) {
    this._path = path;
    this._buffer = buffer;
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

    if (~dot) {
        // TODO if found, analyze preceding item:
        //          - if object: that object's methods, fields
        //          - if class: static methods, subclasses
        //          - if nothing: recurse to previous line?
        //          - else: assume "this" object's methods, fields
        Analyzer.of(this._path, this._buffer)
        .at(this._line, dot-1)
        .find(function(err, result) {

            cb(undefined, result);
        });
    } else {
        // TODO else, suggest fields, local methods, classnames

        cb(2);
    }
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



module.exports = {
    of: function(path, buffer) {
        return new Suggestor(path, buffer);
    }
};
