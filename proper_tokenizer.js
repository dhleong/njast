
/**
 * New Tokenizer for the proper ast
 */

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

for (var i = 0; i < 3; i++) {
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

// var ESCAPE = VALS.next();

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
var PRIMITIVES = ['boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'char'];

/**
 * Tokenizer constructor
 */
function Tokenizer(path, buffer) {
    this._path = path;
    this._fp = buffer;
    this._start = buffer.offset;
    this._strict = true;

    this._line = 1;
    this._col = 1;
    this._pos = 0;

    this.errors = [];
}

/** 
 * Prepare to do some reading; skips whitespace, consumes comments.
 *  Unlike save(), this returns the position AFTER the whitespace
 *  to prevent redundant parsing. 
 */
Tokenizer.prototype._prepare = function() {
    this._skipBlank();
    return this.save();
};

Tokenizer.prototype._skipBlank = function() {
    var off = this._pos;
    while (off < this._fp.length) {
        var token = this._fp[off];
        var nextToken = off < this._fp.length + 1
            ? this._fp[off + 1]
            : -1;

        // TODO comments

        if (isToken(token)) {
            this._pos = off;
            return;
        }

        if (token == NL) {

            this._line++;
            this._col = 1;

        } else if (token == CR ) {
            if (nextToken != NL) { // \r\n to end a line
                this._recordLine(off);
                this._line++;      // just \r 
                this._col = 1;
            } else {
                off++; // \r\n... skip next
            }
        }

        this._col++;
        off++;
    }

};


/** Restore to position state */
Tokenizer.prototype.restore = function(state) {
    this._pos = state.pos;
    this._col = state.col;
    this._line = state.line;
};

/** Save current state */
Tokenizer.prototype.save = function() {
    return {
        pos: this._pos
      , col: this._col
      , line: this._line
    }
};

Tokenizer.prototype._peekChar = function() {
    this._prepare();
    return this._fp[this._pos];
}

/** read a single character */
Tokenizer.prototype.read = function() {
    if (this._pos >= this._fp.length)
        return -1;

    var read = this._fp[this._pos++];
    // TODO should we handle newlines here?
    this._col++;
    return read;
}

Tokenizer.prototype.readString = function(expected) {
    var state = this._prepare();

    var len = expected.length;
    for (var i=0; i < len; i++) {
        var r = this.read();
        // if (r)
        //     console.log(r.charAt(i), expected.charAt(i));
        if (r != expected.charCodeAt(i)) {
            this.restore(state);
            return false;
        }
    }

    return true;
};

Tokenizer.prototype._readToken = function(token) {
    if (this._peekChar() == token) {
        this.read();
        return true;
    }

    return false;
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
Tokenizer.prototype.readGenericOpen  = _doRead(GENERIC_OPEN);
Tokenizer.prototype.readGenericClose = _doRead(GENERIC_CLOSE);

// util methods to expect specific tokens
var _doExpect = function(token) { 
    return function() { 
        if (!this._readToken(token)) {
            this.raise(String.fromCharCode(token));
            this.read(); // if we got here, we're relaxed; skip whatever it was
        }
    } 
};
Tokenizer.prototype.expectBlockOpen  = _doExpect(BLOCK_OPEN);
Tokenizer.prototype.expectBlockClose = _doExpect(BLOCK_CLOSE);
Tokenizer.prototype.expectAt         = _doExpect(AT); // at symbol, for annotations
Tokenizer.prototype.expectDot        = _doExpect(DOT);
Tokenizer.prototype.expectComma      = _doExpect(COMMA);
Tokenizer.prototype.expectColon      = _doExpect(COLON);
Tokenizer.prototype.expectEquals     = _doExpect(EQUALS);
Tokenizer.prototype.expectSemicolon  = _doExpect(SEMICOLON);
Tokenizer.prototype.expectParenOpen  = _doExpect(PAREN_OPEN);
Tokenizer.prototype.expectParenClose = _doExpect(PAREN_CLOSE);
Tokenizer.prototype.expectPlus       = _doExpect(PLUS);
Tokenizer.prototype.expectStar       = _doExpect(STAR);
Tokenizer.prototype.expectQuote      = _doExpect(QUOTE);
Tokenizer.prototype.expectQuestion   = _doExpect(QUESTION);
Tokenizer.prototype.expectBracketOpen  = _doExpect(BRACKET_OPEN);
Tokenizer.prototype.expectBracketClose = _doExpect(BRACKET_CLOSE);


Tokenizer.prototype.readIdentifier = function() {
    this._prepare();

    var ident = '';
    var read;
    for (;;) {
        read = this.read();
        if (read != -1 && isIdentifier(ident, read))
            ident += String.fromCharCode(read);
        else
            break;
    }

    // we read an extra char, even if it wasn't an identifier at all
    this._pos--;
    this._col--;

    return ident.length ? ident : undefined;
};

var _peekMethod = function(readType) {
    var method = Tokenizer.prototype['read' + readType];
    return function() {
        var state = this._prepare();
        var ident = method.call(this, arguments);
        this.restore(state);
        return ident;
    }
};
Tokenizer.prototype.peekIdentifier = _peekMethod('Identifier');
Tokenizer.prototype.peekBlockOpen  = _peekMethod('BlockOpen');
Tokenizer.prototype.peekBlockClose = _peekMethod('BlockClose');
Tokenizer.prototype.peekAt         = _peekMethod('At'); // at symbol, for annotations
Tokenizer.prototype.peekDot        = _peekMethod('Dot');
Tokenizer.prototype.peekComma      = _peekMethod('Comma');
Tokenizer.prototype.peekColon      = _peekMethod('Colon');
Tokenizer.prototype.peekEquals     = _peekMethod('Equals');
Tokenizer.prototype.peekSemicolon  = _peekMethod('Semicolon');
Tokenizer.prototype.peekParenOpen  = _peekMethod('ParenOpen');
Tokenizer.prototype.peekParenClose = _peekMethod('ParenClose');
Tokenizer.prototype.peekQuote      = _peekMethod('Quote');
Tokenizer.prototype.peekQuestion   = _peekMethod('Question');
Tokenizer.prototype.peekBracketOpen  = _peekMethod('BracketOpen');
Tokenizer.prototype.peekBracketClose = _peekMethod('BracketClose');

Tokenizer.prototype.readQualified = function() {
    var ident = this.readIdentifier();
    if (!ident)
        return ident;

    while (this.readDot()) {
        var next = this.readIdentifier();
        if (next) // could be incomplete
            ident += '.' + next;
    }

    return ident;
}

/*
 * Util methods
 */

/** Return TRUE if we've reached EOF */
Tokenizer.prototype.isEof = function() {
    return this._pos >= this._fp.length;
};


Tokenizer.prototype.getPos = function() {
    return {
        line: this._line
      , ch: this._col
    }
};


/** Raise a parse exception */
Tokenizer.prototype.raise = function(expecting) {
    var message = 'Error parsing input @' 
                 + this._line + ',' + this._col;
    
    if (expecting) {
        message += '; peek=' + String.fromCharCode(this._peekChar())
                 + '; Expecting=' + expecting;
    }

    var err = this._error(message);
    if (this._strict)
        throw err;
};

/** Always throws an error; it's not clear how to skip past an unsupported feature  */
Tokenizer.prototype.raiseUnsupported = function(feature) {
    throw this._error('Encountered unsupported feature ' + feature, true);
}

Tokenizer.prototype._error = function(message, withPos) {

    if (withPos)
        message += ' @' + this._line + ',' + this._col;
    
    var err = new Error(message);
    err.line = this._line;
    err.col = this._line;
    this.errors.push(err);

    return err;
};


/*
 * Util functions
 */

/** Static method */
Tokenizer.isControl = function(token) {
    return CONTROLS.indexOf(token) >= 0; // binary search?
}


/** Static method */
Tokenizer.isModifier = function(token) {
    return MODIFIERS.indexOf(token) >= 0;
}

/**
 * Check if the type name is a primitive type
 */
Tokenizer.isPrimitive = function(type) {
    return PRIMITIVES.indexOf(type) >= 0;
}

/** Static method */
Tokenizer.isReserved = function(word) {
    return Tokenizer.isModifier(word)
        || Tokenizer.isControl(word)
        || ~PRIMITIVES.indexOf(word);
};


function isIdentifier(existing, charCode) {
    if (!charCode)
        charCode = existing;

    // TODO first char is special
    for (var i = 0; i < NAME_RANGES.length; i++) {
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
    return isIdentifier(charCode)
        || isMath(charCode)
        || OTHER_TOKENS.indexOf(charCode) >= 0; // TODO sort + binary search?
}

module.exports = Tokenizer;
