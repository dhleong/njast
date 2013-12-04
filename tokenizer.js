
var NAME_RANGES = [];
var VALS = {
    _val: "\r\n/*09azAZ_$.,{}<>()=;@",
    _idx: 0,
    next: function() {
        return this._val.charCodeAt(this._idx++);
    }
}

var CR = VALS.next();
var NL = VALS.next();

var SLASH = VALS.next();
var STAR = VALS.next();

for (i = 0; i < 3; i++) {
    NAME_RANGES.push([VALS.next(), VALS.next()]);
}
var OTHER_NAME_CHARS = [ 
    VALS.next(),
    VALS.next()
];
var DOT = VALS.next();
var COMMA = VALS.next();
var BLOCK_OPEN = VALS.next();
var BLOCK_CLOSE = VALS.next();
var GENERIC_OPEN = VALS.next();
var GENERIC_CLOSE = VALS.next();
var PAREN_OPEN = VALS.next();
var PAREN_CLOSE = VALS.next();
var EQUALS = VALS.next();
var SEMICOLON = VALS.next();
var AT = VALS.next();

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

var MODIFIERS = ['public', 'protected', 'private', 'final', 'static', 'abstract'];
var CONTROLS = ['if', 'else', 'assert', 'switch', 'while', 'do', 'for', 
                'break', 'continue', 'return', 'throw', 'synchronized', 'try'];

var COMMENT_NONE = 0;
var COMMENT_LINE = 1;
var COMMENT_BLOCK= 2;

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

var Commentor = {
    type: COMMENT_NONE,
    start: -1,
    value: '',
    line: -1,

    inComment: function() {
        return this.type != COMMENT_NONE;
    },

    read: function(tok, off, token, nextToken) {

        switch(token) {
        case SLASH:
            // oh no, comment?
            if (this.inComment())
                break; // already in one

            if (nextToken == SLASH) {
                // line comment
                this._startComment(tok, COMMENT_LINE, off);
                return 1;

            } else if (nextToken == STAR) {
                // BLOCK commment!!!
                this._startComment(tok, COMMENT_BLOCK, off);
                return 1;
            }
            break;

        case STAR:
            if (this.type == COMMENT_BLOCK && nextToken == SLASH) {
                this._endComment(tok, off + 1);
                return 1;
            }
            break;
        case NL:
            if (this.inComment())
                this._endComment(tok, off + 1);
            break;
        case CR:
            if (this.inComment() && nextToken == NL) {
                this._endComment(tok, off + 2);
            }
            break;
        }

        return 0;
    },

    reset: function(tok) {
        this.type = COMMENT_NONE;
        this.begin = tok._fp.offset;
        this.start = -1;
        this.value = '';
        this.line = -1;
    },


    _endComment: function(tok, off) {
        this.type = COMMENT_NONE;

        var start = this.start - this.begin;
        var length = off - this.start;
        var end = start + length;
        var read = tok._fp.toString("UTF-8", start, end);
        this.value += read;

        console.log("Read comment ~", start, end, ":", read);
    },

    _startComment: function(tok, type, off) {
        this.type = type;
        this.start = off;
        this.line = tok.getLine();

        console.log("START comment @", this.line, ":", type, off);
    }
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

    this._lastComment = null;
    Commentor.reset(this);
    
    var off = this._fp.offset;
    while (off < this._fp.length) { 
        var token = this._fp[off];
        var nextToken = off < this._fp.length + 1
            ? this._fp[off + 1]
            : -1;

        off += Commentor.read(this, off, token, nextToken);

        if (!Commentor.inComment() && isToken(token)) {
            // done!
            this._fp.offset = off;
            this._lastComment = Commentor.value;
            return true;
        }

        if (token == NL) {
            this._lineno++;

        } else if (token == CR ) {
            if (nextToken != NL) { // \r\n to end a line
                this._lineno++;      // just \r 
            }
        }

        off++;
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

Tokenizer.prototype.getLastComment = function() {
    return this._lastComment;
}

Tokenizer.prototype.getLine = function() {
    return this._lineno;
}

Tokenizer.prototype.isAnnotation = function() {
    return this.peekAt();
}

Tokenizer.prototype.isControl = function() {
    var name = this.peekName();
    return CONTROLS.indexOf(name) >= 0; // binary search?
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
Tokenizer.prototype.peekBlockOpen  = _doPeek(BLOCK_OPEN);
Tokenizer.prototype.peekBlockClose = _doPeek(BLOCK_CLOSE);
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
