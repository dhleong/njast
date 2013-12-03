
var VALS = "\r\n09azAZ_$.,{}<>()=;@";
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
var COMMA = VALS.charCodeAt(_val++);
var BLOCK_OPEN = VALS.charCodeAt(_val++);
var BLOCK_CLOSE = VALS.charCodeAt(_val++);
var GENERIC_OPEN = VALS.charCodeAt(_val++);
var GENERIC_CLOSE = VALS.charCodeAt(_val++);
var PAREN_OPEN = VALS.charCodeAt(_val++);
var PAREN_CLOSE = VALS.charCodeAt(_val++);
var EQUALS = VALS.charCodeAt(_val++);
var SEMICOLON = VALS.charCodeAt(_val++);
var AT = VALS.charCodeAt(_val++);

var OTHER_TOKENS = [
    DOT,
    COMMA,
    BLOCK_OPEN,
    BLOCK_CLOSE,
    GENERIC_OPEN,
    GENERIC_CLOSE,
    PAREN_OPEN,
    PAREN_CLOSE,
    EQUALS,
    SEMICOLON,
    AT
];

var MODIFIERS = ['public', 'private', 'final', 'static', 'final', 'abstract'];

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

/** Static method */
Tokenizer.isModifier = function(token) {
    return MODIFIERS.indexOf(token) >= 0;
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
    this._fp.offset += length;
}

Tokenizer.prototype._read = function(length) {
    length = length 
        ? length
        : 1;
    if (length > this._fp.length)
        throw "_read " + length + "; length = " + this._fp.length;
    var value = this._fp.toString("UTF-8", 0, length);
    this._fp.offset += length;
    return value;
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

Tokenizer.prototype.isAnnotation = function() {
    return this.peekAt();
}

Tokenizer.prototype.isModifier = function() {
    var name = this.peekName();
    return Tokenizer.isModifier(name);
}

Tokenizer.prototype.peekName = function() {
    var read = this.readName();
    this._fp.offset -= read.length;
    return read;
}

// util methods to read specific tokens
var _doRead = function(token) { return function() { return this._readToken(token); } };
Tokenizer.prototype.readBlockOpen  = _doRead(BLOCK_OPEN);
Tokenizer.prototype.readBlockClose = _doRead(BLOCK_CLOSE);
Tokenizer.prototype.readAt         = _doRead(AT); // at symbol, for annotations
Tokenizer.prototype.readComma      = _doRead(COMMA);
Tokenizer.prototype.readEquals     = _doRead(EQUALS);
Tokenizer.prototype.readSemicolon  = _doRead(SEMICOLON);
Tokenizer.prototype.readParenOpen  = _doRead(PAREN_OPEN);
Tokenizer.prototype.readParenClose = _doRead(PAREN_CLOSE);

// just peek; return True if it matches
var _doPeek = function(token) { return function(offset) { this._countBlank(); return this._peek(offset) == token; } };
Tokenizer.prototype.peekAt         = _doPeek(AT); // at symbol, for annotations
Tokenizer.prototype.peekComma      = _doPeek(COMMA);
Tokenizer.prototype.peekEquals     = _doPeek(EQUALS);
Tokenizer.prototype.peekSemicolon  = _doPeek(SEMICOLON);
Tokenizer.prototype.peekParenOpen  = _doPeek(PAREN_OPEN);
Tokenizer.prototype.peekParenClose = _doPeek(PAREN_CLOSE);

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

Tokenizer.prototype.readGeneric = function() {
    name = this.readQualified();
    var genericLen = 0;
    if (this._readToken(GENERIC_OPEN)) {
        // read through generic stuff
        var generics = 1;
        name += "<";

        for (;;) {
            var tok = this._peek();
            switch (tok) {
            case GENERIC_OPEN:
                name += this._read();
                generics++;
                break;
            case GENERIC_CLOSE:
                name += this._read();
                if (--generics == 0)
                    return name;
                break;
                
            default:
                this._countBlank();

                if (tok == COMMA || isName(tok)) {
                    name += this._read();
                } else
                    throw new Error("Unexpected token ``" + tok + "'' in generic name ``" + name + "''");
            } 
        }
    }

    return name;
}

Tokenizer.prototype.expect = function(expected, methodOrValue) {
    var result = (typeof(methodOrValue) == 'function')
        ? methodOrValue.call(this)
        : methodOrValue;

    if (expected != result) {
        throw new Error("At line #" + this.getLine() 
            + "\nExpected ``" + expected + "'' but was ``" + result + "''");
    }
}

/*
 * JUST export the Tokenizer class
 */
module.exports = Tokenizer;
