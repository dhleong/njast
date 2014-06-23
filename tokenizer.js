
/**
 * New Tokenizer for the proper ast
 */

var NAME_RANGES = [];
var VALS = {
    _val: "\r\n/*09azAZ_$.,_{}<>()[]=+-|&!~^%;:@\"'?\\ ",
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
var NUMBERS = NAME_RANGES[0];
var OTHER_NAME_CHARS = [ 
    VALS.next(),
    VALS.next()
];
var DOT = VALS.next();
var COMMA = VALS.next();
var UNDERLINE = VALS.next();
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
var BANG = VALS.next();
var TILDE = VALS.next();
var XOR = VALS.next();
var MODULO = VALS.next();
var SEMICOLON = VALS.next();
var COLON = VALS.next();
var AT = VALS.next();
var QUOTE = VALS.next();
var APOSTROPHE = VALS.next();
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
    APOSTROPHE,
    QUESTION,

    BRACKET_OPEN,
    BRACKET_CLOSE,
];

var MATH = [
    PLUS, MINUS, STAR, SLASH,
    EQUALS,
    OR, AND, BANG, TILDE,
    GENERIC_OPEN, GENERIC_CLOSE,
    MODULO, XOR
]

// build up state machines
var ASSIGNMENT = {};
[PLUS, MINUS, STAR, SLASH, AND, OR, XOR, MODULO].forEach(function(simpleAssign) {
    ASSIGNMENT[simpleAssign] = {};
    ASSIGNMENT[simpleAssign][EQUALS] = true;
});
ASSIGNMENT[EQUALS] = true;
ASSIGNMENT[GENERIC_OPEN] = {};
ASSIGNMENT[GENERIC_OPEN][GENERIC_OPEN] = {};
ASSIGNMENT[GENERIC_OPEN][GENERIC_OPEN][EQUALS] = true;
ASSIGNMENT[GENERIC_CLOSE] = {};
ASSIGNMENT[GENERIC_CLOSE][GENERIC_CLOSE] = {};
ASSIGNMENT[GENERIC_CLOSE][GENERIC_CLOSE][EQUALS] = true;
ASSIGNMENT[GENERIC_CLOSE][GENERIC_CLOSE][GENERIC_CLOSE] = {};
ASSIGNMENT[GENERIC_CLOSE][GENERIC_CLOSE][GENERIC_CLOSE][EQUALS] = true;

var SIMPLE_INFIX_OP = [OR, XOR, AND, GENERIC_OPEN, GENERIC_CLOSE, 
 PLUS, MINUS, STAR, SLASH, MODULO].reduce(function(dict, token) {
    dict[token] = true;
    return dict;
}, {});

var SIMPLE_PREFIX_OP = [BANG, TILDE, PLUS, MINUS].reduce(function(dict, token) {
    dict[token] = true;
    return dict;
}, {});



var DIGIT_CODE_TO_VALUE = {};
var DIGITS = '0123456789abcdef';
for (var i=0; i < DIGITS.length; i++) {
    DIGIT_CODE_TO_VALUE[DIGITS.charCodeAt(i)] = i;

    // upper case hex
    if (i >= 10)
        DIGIT_CODE_TO_VALUE[DIGITS.charAt(i).toUpperCase().charCodeAt(0)] = i;
}

var MODIFIERS = ['public', 'protected', 'private', 'final', 'static', 'abstract',
                 'volatile', 'transient', 'native', 'strictfp', 'synchronized'];
var CONTROLS = ['if', 'else', 'assert', 'switch', 'while', 'do', 'for', 
                'break', 'continue', 'return', 'throw', 'synchronized', 'try',
                'catch', 'finally'];
var PRIMITIVES = ['boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'char'];
var OTHER_RESERVED = ['class', 'interface', 'const', 'goto', 'enum',
                        'extends', 'inherits', 'import', 'instanceof',
                        'new', 'package', 'super', 'this', 'throws',
                        'case', 'default', 'false', 'null', 'true'];

/**
 * Comment state machine
 */
var COMMENT_NONE = 0;
var COMMENT_LINE = 1;
var COMMENT_BLOCK= 2;

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
        this.start = tok._pos;
        this.pos;
    },

    clear: function() {
        var ret = this.value;
        this.value = '';
        return ret;
    },

    _endComment: function(tok, off) {

        var start = this.start;
        var length = off - start;
        var end = start + length;
        var read = tok._fp.toString("UTF-8", start, end);

        if (this.type == COMMENT_BLOCK)
            this.value += read;

        this.type = COMMENT_NONE;
        //console.log("Read comment ~", start, end, ":", read);
    },

    _startComment: function(tok, type, off) {
        this.type = type;
        this.start = off;
        this.pos = tok.getPos();

        //console.log("START comment @", this.line, ":", type, off);
    }
};


/**
 * Tokenizer constructor
 */
function Tokenizer(path, buffer, options) {
    this._path = path;
    this._strict = true;
    this._level = Tokenizer.Level.DEFAULT;

    if (buffer.text) {
        this._type = buffer.type;
        this._fp = buffer.text;
    } else {
        this._type = 'full';
        this._fp = buffer;
    }
    this._start = buffer.offset;

    this._line = buffer.start || 1;
    this._col = 1;
    this._pos = 0;

    if (options) {
        if (options.strict !== undefined)
            this._strict = options.strict;
        if (options.level !== undefined)
            this._level = options.level;

        if (options.line)
            this._line = options.line;
        if (options.ch)
            this._col = options.ch;
    }

    this.errors = [];
}

/**
 * Constants for compiler level compatibility checking
 */
Tokenizer.Level = {
    DEFAULT: 7,  // default to JDK7 compat

    JDK6: 6,
    JDK7: 7, 
};

/**
 * Fetches all Javadoc read since the last call,
 *  clearing the buffer behind us
 */
Tokenizer.prototype.getJavadoc = function() {
    return Commentor.clear();
};

Tokenizer.prototype.isPartialBuffer = function() {
    return this._type == 'part';
};


/** 
 * Prepare to do some reading; skips whitespace, consumes comments.
 *  Unlike save(), this returns the position AFTER the whitespace
 *  to prevent redundant parsing. 
 */
Tokenizer.prototype.prepare = function() {
    this._skipBlank();
    return this.save();
};

Tokenizer.prototype._skipBlank = function() {
    this._preSkip = this.save();
    var off = this._pos;
    while (off < this._fp.length) {
        var token = this._fp[off];
        var nextToken = off < this._fp.length + 1
            ? this._fp[off + 1]
            : -1;

        // comments
        var skip = Commentor.read(this, off, token, nextToken);
        off += skip;
        this._col += skip; // I guess?

        // if we had a skip from Commentor, don't process this
        if (!skip && !Commentor.inComment() && isToken(token)) {
            this._pos = off;
            return;
        }

        if (token == NL) {

            this._line++;
            this._col = 0; // ++ below fixes

        } else if (token == CR ) {
            if (nextToken != NL) { // \r\n to end a line
                this._recordLine(off);
                this._line++;      // just \r 
                this._col = 0; // ++ below fixes
            } else {
                off++; // \r\n... skip next
                this._col++;
            }
        }

        this._col++;
        off++;
    }

};


/** Restore to position state */
Tokenizer.prototype.restore = function(state) {
    this._preSkip = undefined;
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
    this.prepare();
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

// lazy
Tokenizer.prototype.peek = Tokenizer.prototype._peekChar;

/** 
 * Returns the string value of the digit (eg: a-f for hex 10-15),
 *  else undefined if not a number, or not valid for the radix
 */
Tokenizer.prototype.readDigit = function(radix) {
    if (!radix) radix = 10;

    var next = this.peek();
    if (!(next in DIGIT_CODE_TO_VALUE))
        return undefined;

    if (DIGIT_CODE_TO_VALUE[next] >= radix)
        return undefined;

    return String.fromCharCode(this.read());
};


Tokenizer.prototype.readString = function(expected) {
    var state = this.prepare();

    var len = expected.length;
    for (var i=0; i < len; i++) {
        var r = this.read();
        // if (r)
        //     console.log(String.fromCharCode(r), expected.charAt(i));
        if (r != expected.charCodeAt(i)) {
            this.restore(state);
            return false;
        }
    }

    return true;
};

/**
 * Like readString, but ensures that the value
 *  is not part of something else. Not quite
 *  as efficient as readString, since it has
 *  to read ahead
 */
Tokenizer.prototype.readLiteral = function(expected) {
    var state = this.prepare();
    var ident = this.readIdentifier();
    if (ident == expected)
        return true;

    this.restore(state);
    return false;
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
Tokenizer.prototype.readSlash      = _doRead(SLASH);
Tokenizer.prototype.readComma      = _doRead(COMMA);
Tokenizer.prototype.readUnderline  = _doRead(UNDERLINE);
Tokenizer.prototype.readColon      = _doRead(COLON);
Tokenizer.prototype.readEquals     = _doRead(EQUALS);
Tokenizer.prototype.readOr         = _doRead(OR);
Tokenizer.prototype.readAnd        = _doRead(AND);
Tokenizer.prototype.readSemicolon  = _doRead(SEMICOLON);
Tokenizer.prototype.readParenOpen  = _doRead(PAREN_OPEN);
Tokenizer.prototype.readParenClose = _doRead(PAREN_CLOSE);
Tokenizer.prototype.readPlus       = _doRead(PLUS);
Tokenizer.prototype.readStar       = _doRead(STAR);
Tokenizer.prototype.readQuote      = _doRead(QUOTE);
Tokenizer.prototype.readApostrophe = _doRead(APOSTROPHE);
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

            // actually, skipping CAUSES problems 
            // if (!this.peekBlockClose()) // never skip these!
            //     this.read(); // if we got here, we're relaxed; skip whatever it was
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
Tokenizer.prototype.expectGenericOpen  = _doExpect(GENERIC_OPEN);
Tokenizer.prototype.expectGenericClose = _doExpect(GENERIC_CLOSE);

Tokenizer.prototype.expectString = function(string) {
    if (!this.readString(string)) {
        this.raise(string);
        this.read(); // if we got here, we're relaxed; skip whatever was there
    }
};

Tokenizer.prototype.readIdentifier = function() {
    this.prepare();

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

Tokenizer.prototype.readAssignment = function() {
    var state = this.prepare();

    var strBuffer = '';
    var src = ASSIGNMENT;
    for (;;) {
        var token = this.read();
        if (!(token in src)) {
            this.restore(state);
            return;
        }

        strBuffer += String.fromCharCode(token);
        if (src[token] === true)
            return strBuffer; // done!

        // advance in the state machine
        src = src[token];
    }
}

Tokenizer.prototype.readInfixOp = function() {
    var state = this.prepare();

    if (this.readString('=='))
        return '==';
    if (this.readString('!='))
        return '!=';

    var token = this.read();
    if (!(token in SIMPLE_INFIX_OP)) {
        this.restore(state);
        return;
    }

    switch(token) {
    case GENERIC_OPEN:
        if (this.readEquals())
            return '<=';
        if (this.readGenericOpen()) {
            if (this.readEquals())
                return this.restore(state);
            return '<<';
        }
        break;
    case GENERIC_CLOSE:
        if (this.readEquals())
            return '>=';
        if (this.readGenericClose()) {
            if (this.readGenericClose()) {
                if (this.readEquals())
                    return this.restore(state);
                return '>>>';
            }

            if (this.readEquals())
                return this.restore(state);
            return '>>';
        }
        break;
    case OR:
        if (this._readToken(OR))
            return '||';
        break;
    case AND:
        if (this._readToken(AND))
            return '&&';
    }

    if (this.readEquals()) {
        this.restore(state);
        return;
    }

    return String.fromCharCode(token);
}

Tokenizer.prototype.readPrefixOp = function() {
    
    var state = this.prepare();

    var postfix = this.readPostfixOp();
    if (postfix)
        return postfix;

    var token = this.read();
    if (!(token in SIMPLE_PREFIX_OP)) {
        this.restore(state);
        return;
    }

    if (this.readEquals()) {
        this.restore(state);
        return;
    }

    return String.fromCharCode(token);
};

Tokenizer.prototype.readPostfixOp = function() {
    if (this.readString('++'))
        return '++';
    if (this.readString('--'))
        return '--';
};


var _peekMethod = function(readType) {
    var method = Tokenizer.prototype['read' + readType];
    return function() {
        var state = this.prepare();
        var ident = method.apply(this, arguments);
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
Tokenizer.prototype.peekGenericOpen  = _peekMethod('GenericOpen');
Tokenizer.prototype.peekGenericClose = _peekMethod('GenericClose');

Tokenizer.prototype.peekInfixOp = _peekMethod('InfixOp');
Tokenizer.prototype.peekString = _peekMethod('String');

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
    return this._pos + 1 >= this._fp.length;
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
        message += '; peek=`' + String.fromCharCode(this._peekChar())
                 + '`; Expecting=`' + expecting + '`';
    }

    var err = this._error(message);
    if (this._strict)
        throw err;

    return err;
};

var _jdkCheck = function(level) {
    return function(feature) {
        if (this._level >= level)
            return true;

        var err = this._error("Using JDK" + this._level 
            + " compat; encountered JDK" + level 
            + " feature `" + feature + "`", true);
        if (this._strict)
            throw err;
    };
};
Tokenizer.prototype.checkJdk7 = _jdkCheck(Tokenizer.Level.JDK7);

/** Always throws an error; it's not clear how to skip past an unsupported feature  */
Tokenizer.prototype.raiseUnsupported = function(feature) {
    throw this._error('Encountered unsupported feature "' + feature + '"', true);
}

Tokenizer.prototype._error = function(message, withPos) {

    if (withPos)
        message += ' @' + this._line + ',' + this._col;
    
    var err = new Error(message);
    err.line = this._line;
    err.col = this._col;
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
        || ~PRIMITIVES.indexOf(word)
        || ~OTHER_RESERVED.indexOf(word);
};

function isIdentifier(existing, charCode) {
    if (!charCode)
        charCode = existing;

    // first char is special
    if (existing === '' 
            && charCode >= NUMBERS[0]
            && charCode <= NUMBERS[1]) {
        // cannot be a number
        return false;
    }

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
        || ~OTHER_TOKENS.indexOf(charCode); // TODO sort + binary search?
}

module.exports = Tokenizer;
