
/** If true, we fail fast on parse trouble */
var DEBUG_FAIL = true; 

var NAME_RANGES = [];
var VALS = {
    _val: "\r\n/*09azAZ_$.,{}<>()[]=+-|&;:@\"?\\ ",
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
var BRACKET_OPEN = VALS.next();
var BRACKET_CLOSE = VALS.next();
var EQUALS = VALS.next();
var PLUS = VALS.next();
var MINUS = VALS.next();
var OR = VALS.next();
var AND = VALS.next();
var SEMICOLON = VALS.next();
var COLON = VALS.next();
var AT = VALS.next();
var QUOTE = VALS.next();
var QUESTION = VALS.next();

var ESCAPE = VALS.next();
var SPACE = VALS.next();


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
    COLON,
    AT,
    QUOTE,
    QUESTION,

    BRACKET_OPEN,
    BRACKET_CLOSE,
];

var MATH = [
    PLUS, MINUS, STAR, SLASH,
    EQUALS,
    OR, AND,
    GENERIC_OPEN, GENERIC_CLOSE
]

var MODIFIERS = ['public', 'protected', 'private', 'final', 'static', 'abstract',
                 'volatile', 'transient', 'native', 'strictfp'];
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

function isMath(charCode) {
    //console.log(String.fromCharCode(charCode));
    return MATH.indexOf(charCode) >= 0;
}

function isToken(charCode) {
    return isName(charCode)
        || isMath(charCode)
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
                // END block comment!!!
                this._endComment(tok, off + 2);
                return 1;
            }
            break;
        case NL:
            if (this.type == COMMENT_LINE)
                this._endComment(tok, off + 1);
            break;
        case CR:
            if (this.type == COMMENT_LINE && nextToken == NL) {
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

        //console.log("Read comment ~", start, end, ":", read);
    },

    _startComment: function(tok, type, off) {
        this.type = type;
        this.start = off;
        this.line = tok.getLine();

        //console.log("START comment @", this.line, ":", type, off);
    }
}


function Tokenizer(buffer) {
    this._fp = buffer;
    this._start = buffer.offset;
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

    //console.log("Count Blank @", this._lineno);
    
    var startLine = this._lineno;
    var base = this._fp.offset - this._start;
    var off = base;
    while (off < this._fp.length) { 
        var token = this._fp[off];
        var nextToken = off < this._fp.length + 1
            ? this._fp[off + 1]
            : -1;

        var skip = Commentor.read(this, off, token, nextToken);
        off += skip;

        // if we had a skip from Commentor, don't process this
        if (!skip && !Commentor.inComment() && isToken(token)) {
            // done!
            var skipped = off - base;
            this._fp.offset = off + this._start;
            this._lastComment = Commentor.value;
            this._lastSkipped = skipped; // save bytes skipped
            this._lastLine = startLine; // save last line (in case we rewind)
            //console.log("! Counted Blank @", this._lineno, "skipped=", skipped, "token=", String.fromCharCode(token));
            return skipped; // also return bytes skipped
        }

        if (token == NL) {
            this._lineno++;

        } else if (token == CR ) {
            if (nextToken != NL) { // \r\n to end a line
                this._lineno++;      // just \r 
            } else {
                off++; // \r\n... skip next
            }
        }

        off++;
    }

    return false;
}

Tokenizer.prototype._rewindLastSkip = function() {
    if (this._lastSkipped) {
        this._fp.offset -= this._lastSkipped;
        this._lineno = this._lastLine;
    }

    this._lastSkipped = 0;
}

Tokenizer.prototype._peek = function(offset) {
    offset = offset 
        ? this._fp.offset + offset 
        : this._fp.offset;
    offset -= this._start;
    if (offset > this._fp.length)
        throw new Error("Peeking at " + offset + "; length = " + this._fp.length);

    //console.log("peek @", offset, "=", this._fp[ offset ]);
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
        throw new Error("_read " + length + "; length = " + this._fp.length);
    //console.log(this._fp.length, this._fp.offset, length);
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

    this._rewindLastSkip();
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

// util methods to read specific tokens
var _doRead = function(token) { return function() { return this._readToken(token); } };
Tokenizer.prototype.readBlockOpen  = _doRead(BLOCK_OPEN);
Tokenizer.prototype.readBlockClose = _doRead(BLOCK_CLOSE);
Tokenizer.prototype.readAt         = _doRead(AT); // at symbol, for annotations
Tokenizer.prototype.readDot        = _doRead(DOT);
Tokenizer.prototype.readComma      = _doRead(COMMA);
Tokenizer.prototype.readColon      = _doRead(COLON);
Tokenizer.prototype.readEquals     = _doRead(EQUALS);
Tokenizer.prototype.readSemicolon  = _doRead(SEMICOLON);
Tokenizer.prototype.readParenOpen  = _doRead(PAREN_OPEN);
Tokenizer.prototype.readParenClose = _doRead(PAREN_CLOSE);
Tokenizer.prototype.readPlus       = _doRead(PLUS);
Tokenizer.prototype.readStar       = _doRead(STAR);
Tokenizer.prototype.readQuote      = _doRead(QUOTE);
Tokenizer.prototype.readQuestion   = _doRead(QUESTION);
Tokenizer.prototype.readBracketOpen  = _doRead(BRACKET_OPEN);
Tokenizer.prototype.readBracketClose = _doRead(BRACKET_CLOSE);

// just peek; return True if it matches
var _doPeek = function(token) { 
    return function(offset) { 
        this._countBlank(); 
        if (this._peek(offset) == token)
            return true;

        this._rewindLastSkip();
        return false;
    } 
};
Tokenizer.prototype.peekBlockOpen  = _doPeek(BLOCK_OPEN);
Tokenizer.prototype.peekBlockClose = _doPeek(BLOCK_CLOSE);
Tokenizer.prototype.peekAt         = _doPeek(AT); // at symbol, for annotations
Tokenizer.prototype.peekDot        = _doPeek(DOT);
Tokenizer.prototype.peekComma      = _doPeek(COMMA);
Tokenizer.prototype.peekColon      = _doPeek(COLON);
Tokenizer.prototype.peekEquals     = _doPeek(EQUALS);
Tokenizer.prototype.peekSemicolon  = _doPeek(SEMICOLON);
Tokenizer.prototype.peekParenOpen  = _doPeek(PAREN_OPEN);
Tokenizer.prototype.peekParenClose = _doPeek(PAREN_CLOSE);
Tokenizer.prototype.peekQuote      = _doPeek(QUOTE);
Tokenizer.prototype.peekQuestion   = _doPeek(QUESTION);
Tokenizer.prototype.peekBracketOpen  = _doPeek(BRACKET_OPEN);
Tokenizer.prototype.peekBracketClose = _doPeek(BRACKET_CLOSE);

/** Convenience */
Tokenizer.prototype.peekExpressionEnd = function(offset) {
    return this.readSemicolon(offset) 
        || this.peekComma(offset) 
        || this.peekParenClose(offset) 
        || this.peekColon(offset)
        || this.peekBracketClose(offset);
}

/** Read math operation */
Tokenizer.prototype.readMath = function() {
    this._countBlank();

    var length = 0;
    if (isMath(this._peek())) {
        length++;

        if (isMath(this._peek(1))) {
            length++;

            if (isMath(this._peek(2)))
                length++; // eg: >>=
        }
    }

    if (length == 0) {
        this._rewindLastSkip();
        return null;
    }

    var val = this._fp.toString("UTF-8", 0, length); 
    this._fp.offset += length;
    return val;
}

/** Read a string literal */
Tokenizer.prototype.readString = function() {
    this._countBlank();
    var length = 0;
    this.expect(true, this.readQuote);

    var prev = false;
    while (!(this._peek(length) == QUOTE && prev != ESCAPE)) {
        prev = this._peek(length);
        length++;
    }

    length++; // include the end quote
    var val = '"' + this._fp.toString("UTF-8", 0, length); 
    this._fp.offset += length;
    return val;
}

Tokenizer.prototype.readName = function() {

    this._countBlank();
    var length = 0;
    while (isName(this._peek(length)))
        length++;

    if (!length) {
        this._rewindLastSkip();
        return "";
    }

    return this._read(length);
}

/** Read qualified name, eg: com.package.Class */
Tokenizer.prototype.readQualified = function() {
    name = this.readName();
    while (this._readToken(DOT)) {
        name += '.' + this.readName();
    }

    if (!name)
        this._rewindLastSkip();

    return name;
}

Tokenizer.prototype.readGeneric = function() {
    var name = this.readQualified();
    if (!name) {
        this._rewindLastSkip();
        return name;
    }

    var genericLen = 0;
    var valid = [COMMA, DOT];
    if (this._readToken(GENERIC_OPEN)) {
        
        // make sure this isn't just math
        this._countBlank();
        if (!isName(this._peek())) {
            // yep, just math
            this._fp.offset--; // undo an extra _skip in _readToken
            this._rewindLastSkip();
            return name;
        }

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
                tok = this._peek();

                if (valid.indexOf(tok) > -1 || isName(tok)) {
                    name += this._read();
                } else if (DEBUG_FAIL) {
                    throw new Error("Unexpected token ``" + tok + "'' @" + this._lineno 
                        + "\n(" + 
                        + String.fromCharCode(tok)
                        + ") in generic name ``" 
                        + name + this._read() + "''; valid=" + valid
                        + "\nPreview: " + this._read(15));
                } else {
                    return name;
                }
            } 
        }
    } else {
        this._rewindLastSkip();
    }

    return name;
}

Tokenizer.prototype.error = function(message) {

        throw new Error("At line #" + this.getLine() 
            + "\n" + message
            + "\nPreview: " + this._read(15));
};

Tokenizer.prototype.expect = function(expected, methodOrValue) {
    var result = (typeof(methodOrValue) == 'function')
        ? methodOrValue.call(this)
        : methodOrValue;

    if (expected != result) {
            
        this.error("Expected ``" + expected 
            + "'' but was ``" + result + "''");
    }
}


// generate method to peek by calling a read method and rewinding
var _peekType = function(method) {
    return function(offset) {

        if (offset) {
            //console.log("Offset<", offset);
            this._fp.offset += offset;

            offset += this._countBlank();
            //console.log("Offset>", offset);
        }

        var read = method.call(this);
        this._fp.offset -= read.length;

        if (offset) {
            //console.log('Offset!', read);
            this._fp.offset -= offset;
            //throw new Exception();
        }

        return read;
    };
}

Tokenizer.prototype.peekName    = _peekType(Tokenizer.prototype.readName);
Tokenizer.prototype.peekGeneric = _peekType(Tokenizer.prototype.readGeneric);


/*
 * JUST export the Tokenizer class
 */
module.exports = Tokenizer;
