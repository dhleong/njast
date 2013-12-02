
var VALS = "\r\n09azAZ_$.{}";
var NAME_RANGES = [];

var _val = 0;
var CR = VALS.charCodeAt(_val++);
var NL = VALS.charCodeAt(_val++);
for (i = 0; i < 3; i++) {
    NAME_RANGES.push([VALS.charCodeAt(_val++), VALS.charCodeAt(_val++)]);
}
var OTHER_NAME_CHARS = [ 
    VALS.charCodeAt(_val++),
    VALS.charCodeAt(_val++)
];
var DOT = VALS.charCodeAt(_val++);
var BLOCK_OPEN = VALS.charCodeAt(_val++);
var BLOCK_CLOSE = VALS.charCodeAt(_val++);
var OTHER_TOKENS = [
    DOT,
    BLOCK_OPEN,
    BLOCK_CLOSE
];

function isName(charCode) {
    for (i = 0; i < NAME_RANGES.length; i++) {
        if (charCode >= NAME_RANGES[i][0] && charCode <= NAME_RANGES[i][1])
            return true;
    }

    return OTHER_NAME_CHARS.indexOf(charCode) >= 0;
}

function isToken(charCode) {
    return isName(charCode)
        || OTHER_TOKENS.indexOf(charCode) >= 0; // TODO sort + binary search?
}

function Tokenizer(buffer) {
    this._fp = buffer;
    this._lineno = 1;
    
    this._lastComment = null;
}

/** Skip non-tokens */
Tokenizer.prototype._countBlank = function() {
    while (this._fp.offset < this._fp.length) { 
        var token = this._fp[this._fp.offset];
        if (isToken(token)) {
            return true;
        }

        if (token == NL) {
            this._lineno++;
        } else if (token == CR ) {
            try {
                if (this._peek(1) != NL) // \r\n to end a line
                    this._lineno++;      // just \r 
            } catch (err) {
                // doesn't matter; end of file
            }
        }

        this._fp.offset++;
    }

    return false;
}

Tokenizer.prototype._peek = function(offset) {
    offset = offset 
        ? this._fp.offset + offset 
        : this._fp.offset;
    if (offset > this._fp.length)
        throw "Peeking at " + offset + "; length = " + this._fp.length;
    return this._fp[ offset ];
}

/** NB doesn't return anything! */
Tokenizer.prototype._skip = function(length) {
    length = length 
        ? length
        : 1;
    if (length > this._fp.length)
        throw "_skip " + length + "; length = " + this._fp.length;
    return this._fp.offset += length;
}

/** 
 * Skipping whitespace, attempt to read the token 
 * @return True if we read it, else false
 */
Tokenizer.prototype._readToken = function(token) {
    this._countBlank();
    if (this._peek() == token) {
        this._skip();
        return true;
    }

    return false;
}

Tokenizer.prototype.getLine = function() {
    return this._lineno;
}

Tokenizer.prototype.readName = function() {
    this._countBlank();
    var length = 0;
    while (isName(this._peek(length)))
        length++;

    var val = this._fp.toString("UTF-8", 0, length);
    this._fp.offset += length;
    return val;
}

/** Read qualified name, eg: com.package.Class */
Tokenizer.prototype.readQualified = function() {
    name = this.readName();
    while (this._readToken(DOT)) {
        name += '.' + this.readName();
    }

    return name;
}

/*
 * JUST export the Tokenizer class
 */
module.exports = Tokenizer;
