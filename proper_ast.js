
var events = require('events')
  , util = require('util')
  , Tokenizer = require('./proper_tokenizer');

function Ast(path, buffer) {
    // this._path = path;
    // this._fp = buffer;
    this.tok = new Tokenizer(path, buffer);
    this._root; // filled via parse()

    this.toplevel = [];
    this.qualifieds = {};

    var self = this;
    this.on('qualified', function(node) {
        self.qualifieds[node.qualifiedName] = node;
    })
    .on('toplevel', function(node) {
        self.toplevel.push(node);
    });
}
util.inherits(Ast, events.EventEmitter);

Ast.prototype.parse = function(startType) {

    this._root = startType.read(this, this.tok);
};

Ast.prototype.getPackage = function() {

    if (this._root instanceof CompilationUnit)
        return this._root.package;

};

/**
 * Superclass for simple things
 */
function SimpleNode(prev) {
    this._prev = prev;
    this._root = prev._root;
    if (!this._root) {
        this._root = prev;
    }
    if (!(this._root instanceof Ast))
        throw Error("Root is wrong!" + this._root.constructor.name);

    this.tok = prev.tok;
    this.start = prev.tok.getPos();
}

/** Call at the end of parsing */
SimpleNode.prototype._end = function() {
    this.end = this.tok.getPos();
    this.publish();
}

SimpleNode.prototype.getParent = function() {
    return this._prev;
}

SimpleNode.prototype.getPath = function() {
    return this._root.getPath();
}

SimpleNode.prototype.getRoot = function() {
    return this._root;
}

SimpleNode.prototype.publish = function(type) {
    var eventType = type
        ? type
        : this.constructor.name.toLowerCase();
    this._root.emit(eventType, this);

    if (this.qualifiedName)
        this._root.emit('qualified', this);
}

SimpleNode.prototype.start_from = function(state) {
    this.start = {
        line: state.line,
        ch: state.col
    };
};


SimpleNode.prototype._qualify = function(separator) {

    var parent = this.getParent();
    if (parent instanceof CompilationUnit) {
        this.qualifiedName = this.getParent().package + '.' + this.name;
        this.getRoot().emit('toplevel', this);
    } else if (parent instanceof Block) {
        // TODO
        // Apparently classes can be declared inside a block.
        // This is called a Local Class.
        // They are qualified as OuterClass$(declNumber?)ClassName.
        // Note the lack of $ between declNumber and ClassName.
        // declNumber is the 1-indexed appearance of ClassName
        // within OuterClass (since you could declare a class of
        // the same name in another block).
        this.tok.raiseUnsupported("qualified declarations in Blocks");
    } else {
        // parent is a ClassBody; grandparent is a Class/Interface
        this.qualifiedName = parent.getParent().qualifiedName
                           + separator + this.name;
    }
}

/**
 * The VariableDeclNode is a special type of
 *  Node that can handle variable declaration. 
 *  Implementors should handle 
 */
function VariableDeclNode(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];
}
util.inherits(VariableDeclNode, SimpleNode);

VariableDeclNode.prototype._readDeclarations = function(firstName) {
    if (firstName) {
        this.kids.push(new VarDef(this, this.mods, this.type, firstName));
    }

    var tok = this.tok;
    while (tok.readComma()) {
        var ident = tok.readIdentifier();
        if (ident)
            this.kids.push(new VarDef(this, this.mods, this.type, ident));
    }

    tok.expectSemicolon();
};


function VarDef(prev, mods, type, name, isInitable) {
    SimpleNode.call(this, prev);

    if (isInitable === undefined)
        isInitable = true;

    if (mods)
        this.start = mods.start;
    else
        this.start = type.start;
    this.mods = mods;
    this.type = type;
    this.name = name;

    // NB: Java grammar supports brackets
    //  here for array types, but convention
    //  discourages that and I don't want
    //  to deal with the complications.

    var tok = this.tok;
    if (tok.readEquals()) {
        if (isInitable)
            this.initializer = VarDef.readInitializer(this);
        else
            this.raise("no initialization");
    }

    this._end();
}
util.inherits(VarDef, SimpleNode);

// IE: VariableInitializer
VarDef.readInitializer = function(prev) {
    if (prev.tok.peekBlockOpen())
        return VarDef.readArrayInitializer(prev);

    return Expression.read(prev);
};

VarDef.readArrayInitializer = function(prev) {
    var tok = prev.tok;
    tok.expectBlockOpen();

    var items = [];

    while (!tok.readBlockClose()) {
        var init = VarDef.readInitializer(prev);
        if (init)
            items.push(init);

        tok.readComma();
    }

    return items;
};


/**
 * Root AST node of a java file
 */
function CompilationUnit(ast, package) {
    SimpleNode.call(this, ast);

    this.package = package;

    this.imports = [];
    this.types = [];

    var tok = this.tok;
    tok.expectSemicolon();

    // imports
    while (tok.readString("import")) {
        var static = tok.readString("static");

        var path = tok.readQualified();
        var star = tok.readStar()

        if (path) {
            this.imports.push({
                static: static,
                path: path,
                star: star
            });
        }

        tok.expectSemicolon();
    }

    // TypeDeclarations
    var type;
    while ((type = TypeDeclaration.read(this))) {
        this.types.push(type);
    }

    this._end();
}
util.inherits(CompilationUnit, SimpleNode);

CompilationUnit.read = function(ast) {
    if (ast.tok.readString("package")) {
        return new CompilationUnit(ast, ast.tok.readQualified());
    } else {
        return new CompilationUnit(ast, "default");
    }
};

/**
 * Factory for TypeDeclarations
 */
var TypeDeclaration = {
    read: function(prev, modifiers) {
        var tok = prev.tok;

        // it can be just a semicolon
        while (tok.readSemicolon()) 
            continue;

        // class or interface decl
        var state = tok.save();
        var mods = modifiers
            ? modifiers // use ones we already found
            : Modifiers.read(prev);
        if (tok.readString("class")) {
            return new Class(prev, mods);
        } else if (tok.readString("enum")) {
            tok.raiseUnsupported("enum");
        } else if (tok.readString("interface")) {
            return new Interface(prev, mods);
        } else if (tok.readAt()) {
            // TODO annotation
            tok.expectAt();
            tok.raiseUnsupported("annotation declaration");
        }
        tok.restore(state); // could be something else with mods
    }
}

/**
 * A Java class declaration
 */
function Class(prev, mods) {
    SimpleNode.call(this, prev);
    
    this.mods = mods;

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this._qualify('$');

    this.typeParams = TypeParameters.read(this);

    if (tok.readString('extends')) {
        this.extends = Type.read(this);
    }
    if (tok.readString('implements')) {
        this.implements = [];
        do {
            this.implements.push(Type.read(this));
        } while(tok.readComma());
    }

    // body
    this.body = new ClassBody(this);

    this._end();
}
util.inherits(Class, SimpleNode);

/**
 * A Java class declaration
 */
function Interface(prev, mods) {
    SimpleNode.call(this, prev);

    this.mods = mods;

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this._qualify('$');

    this.typeParams = TypeParameters.read(this);
    
    if (tok.readString('extends')) {
        this.extends = [];
        do {
            this.extends.push(Type.read(this));
        } while(tok.readComma());
    }

    // TODO technically this should be InterfaceBody,
    //  since all methods should be declared as if abstract,
    //  but for now... this is sufficient
    this.body = new ClassBody(this);

    this._end();
}
util.inherits(Interface, SimpleNode);


/**
 * 
 */
function ClassBody(prev) {
    SimpleNode.call(this, prev);

    // shorcut indexes of declared things
    this.subclasses = [];
    this.blocks = [];
    this.fields = [];
    this.methods = [];

    // ALL child elements, in parse-order
    this.kids = [];

    var addToFields = function(el) { this.fields.push(el); }.bind(this);
    
    // read statements
    var tok = this.tok;
    tok.expectBlockOpen();
    while (!tok.readBlockClose()) {
        var el = this._readDeclaration();
        if (!el) continue;

        this.kids.push(el);

        // push onto index by type
        if (el instanceof FieldDecl) {
            el.kids.forEach(addToFields);
        } else if (el instanceof Method) {
            this.methods.push(el);
        } else if (el instanceof Class
                || el instanceof Interface) {
            this.subclasses.push(el);
        } else if (el instanceof Block) {
            this.blocks.push(el);
        }
    }

    this._end();
}
util.inherits(ClassBody, SimpleNode);

ClassBody.prototype._readDeclaration = function() {
    var tok = this.tok;
    if (tok.readSemicolon())
        return;

    var mods = Modifiers.read(this);
    if (tok.peekBlockOpen()) {
        var block = Block.read(this);
        if (block) {
            block.mods = mods;
            return block;
        }
    }

    return this._readMember(mods);
};

ClassBody.prototype._readMember = function(mods) {
    var tok = this.tok;

    var typeParams = TypeParameters.read(this);
    if (typeParams) {
        // TODO generic method or constructor
        tok.raiseUnsupported("generic method/constructor");
    }

    var type = Type.read(this);
    if (!type) {
        // class/interface decl
        return TypeDeclaration.read(this, mods);
    }

    if (tok.peekParenOpen()) {
        // TODO
        tok.raiseUnsupported("constructor");
    }

    typeParams = TypeParameters.read(this);
    var ident = tok.readIdentifier();

    if (tok.peekParenOpen()) {
        return new Method(this, mods, type, typeParams, ident);
    }

    return new FieldDecl(this, mods, type, typeParams, ident);
};

function Method(prev, mods, type, typeParams, name) {
    SimpleNode.call(this, prev);

    if (mods)
        this.start = mods.start;
    else
        this.start = type.start;
    this.mods = mods;
    this.returns = type;
    this.name = name;
    this._qualify('#');

    this.params = new FormalParameters(this);

    var tok = this.tok;
    if (tok.readString("throws")) {
        this.throws = []; // lazy init
        do {
            this.throws.push(Type.read(this));
        } while(tok.readComma());
    }

    this.body = Block.read(this);
    if (!this.body) {
        this.expectSemicolon();

        // TODO enforce abstract?
    }

    this._end();
}
util.inherits(Method, SimpleNode);


function FieldDecl(prev, mods, type, typeParams, name) {
    VariableDeclNode.call(this, prev);

    if (mods)
        this.start = mods.start;
    this.mods = mods;
    this.type = type;
    this.typeParams = typeParams;

    this._readDeclarations(name);

    this.kids.forEach(function(decl) {
        decl._qualify('#');
        decl.publish('field');
    });

    this._end();
}
util.inherits(FieldDecl, VariableDeclNode);


function Block(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
    tok.expectBlockOpen();
    while (!tok.readBlockClose()) {
        var stmt = BlockStatement.read(this);
        if (stmt)
            this.kids.push(stmt);
    }

    this._end();
}
util.inherits(Block, SimpleNode);

Block.read = function(prev) {
    if (!prev.tok.peekBlockOpen())
        return;

    return new Block(prev);
}

/**
 * Factory for BlockStatements
 */
var BlockStatement = {
    read: function(prev) {
        var mods = Modifiers.read(prev);
        var classOrInterface = TypeDeclaration.read(prev, mods);
        if (classOrInterface)
            return classOrInterface;

        var tok = prev.tok;
        var state = tok.save();
        var type = Type.read(prev);
        if (type) {
            var name = tok.readIdentifier();
            if (name && !Tokenizer.isReserved(name)) {
                // localvardefs can't have type params...?
                return new LocalVarDefs(prev, mods, type, null, name);
            }
        }

        // wasn't a variable decl; start over
        tok.restore(state);

        // must be some sort of statement
        return Statement.read(prev);
    }
}

function LocalVarDefs(prev, mods, type, typeParams, name) {
    VariableDeclNode.call(this, prev);

    if (mods)
        this.start = mods.start;
    this.mods = mods;
    this.type = type;
    this.typeParams = typeParams;

    this._readDeclarations(name);

    this.kids.forEach(function(decl) {
        decl.publish('vardef');
    });

    this._end();
}
util.inherits(LocalVarDefs, VariableDeclNode);


/**
 * Statement factory
 */
var Statement = {
    read: function(prev) {
        var tok = prev.tok;

        // it can be just a semicolon
        while (tok.readSemicolon())
            continue;

        var block = Block.read(prev);
        if (block)
            return block;

        var state = tok.save();
        var ident = tok.readIdentifier();

        if (tok.readColon()) {
            prev.tok.raiseUnsupported("labels");
        }

        tok.restore(state);
        if (Tokenizer.isControl(ident))
            return Statement._readControl(prev, ident);

        var expr = Expression.read(prev);
        if (expr)
            tok.expectSemicolon();
        return expr;
    },

    _readControl: function(prev, name) {

        switch (name) {
        case "if":
            return new IfStatement(prev);
        case "return":
            return new ReturnStatement(prev);

        // TODO
        }
        
        prev.tok.raiseUnsupported("control statements: " 
            + prev.tok.peekIdentifier());
    }
};

function IfStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("if");
    this.condition = Expression.readParen(this);
    this.trueStatement = Statement.read(this);

    if (tok.readString("else")) {
        this.falseStatement = Statement.read(this);
    }

    this._end();
}
util.inherits(IfStatement, SimpleNode);


function ReturnStatement(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectString("return");
    this.value = Expression.read(this);
    tok.expectSemicolon();

    this._end();
}
util.inherits(ReturnStatement, SimpleNode);

/**
 * The Expression Class is used for anything
 *  "chained."
 */
function Expression(prev, left, op, exprFactory, opFactory) {
    SimpleNode.call(this, prev);

    this.start = left.start;

    this.left = left;
    this.chain = [];

    var right = exprFactory(this);
    do {
        if (!right)
            this.tok.raise("Incomplete assignment");

        this.chain.push([op, right]);

        op = opFactory.call(this.tok);
        right = null;
        if (op) 
            right = exprFactory(this);
    } while (op && right);

    this._end();
}
util.inherits(Expression, SimpleNode);

/**
 * Expression factory
 */
Expression.read = function(prev) {
    var exprFactory = Expression._expression1;
    var opFactory = prev.tok.readAssignment;

    var expr1 = exprFactory(prev);
    var op = opFactory.call(prev.tok);
    if (!op)
        return expr1; // just expr1

    return new Expression(prev, expr1, op, exprFactory, opFactory);
};

Expression.readParen = function(prev) {
    if (!prev.tok.readParenOpen())
        return;

    // paren expression
    var expr = Expression.read(prev);
    prev.tok.expectParenClose();
    return expr;
}


/** Expression1 factory */
Expression._expression1 = function(prev) {
    var expr2 = Expression._expression2(prev);
    if (!expr2)
        return;

    if (prev.tok.readQuestion()) {
        return new TernaryExpression(prev, expr2);
    }

    return expr2;
}

/** Expression2 factory */
Expression._expression2 = function(prev) {
    var exprFactory = Expression._expression3;
    var expr3 = exprFactory(prev);
    if (!expr3)
        return;

    if (prev.tok.readString("instanceof")) 
        return new InstanceOfExpression(prev, expr3);

    // infix op
    var opFactory = prev.tok.readInfixOp;
    var op = opFactory.call(prev.tok);
    if (op)
        return new Expression(prev, expr3, op, exprFactory, opFactory);
    
    return expr3;
}

/** Expression3 factory */
Expression._expression3 = function(prev) {

    var tok = prev.tok;
    var state = tok.save();
    var prefixOp = tok.readPrefixOp();
    if (prefixOp) {
        return new PrefixExpression(prev, state, prefixOp);
    }

    if (tok.peekParenOpen()) {
        // TODO
        tok.raiseUnsupported("Cast expressions");
    }

    var primary = Primary.read(prev);
    var result = primary;

    // selectors
    var selectors = SelectorExpression.read(primary);
    if (selectors)
        result = selectors;

    // NB We don't record the postfix ops,
    //  because they don't affect type, there's
    //  no need to look them up, and we're not
    //  trying to execute the code. If anyone ever 
    //  needs this, they're free to submit a PR
    tok.readPostfixOp();

    return primary;
}

function PrefixExpression(prev, state, prefixOp) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.op = prefixOp;
    this.expression = Expression._expression3(this);

    this._end();
}
util.inherits(PrefixExpression, SimpleNode);

/** SelectorExpression wraps the previous primary */
function SelectorExpression(primary, connector) {
    SimpleNode.call(this, primary.getParent());

    this.start = primary.start;
    this.left = primary;
    this.chain = [];

    var tok = this.tok;
    while (connector) {
        switch(connector) {
        case '.':
            tok.raiseUnsupported(".-selector");
            break;

        case '[':
            var expr = Expression.read(this);
            if (expr) {
                this.chain.push(expr);
                tok.expectBracketClose();
            }
        }

        connector = undefined; // clear
        if (tok.readDot())
            connector = '.';
        if (tok.readBracketOpen())
            connector = '[';
    }

    this._end();
}
util.inherits(SelectorExpression, SimpleNode);

SelectorExpression.read = function(primary) {
    if (primary.tok.readDot())
        return new SelectorExpression(primary, '.');
    if (primary.tok.readBracketOpen())
        return new SelectorExpression(primary, '[');
}

function TernaryExpression(prev, question) {
    SimpleNode.call(this, prev);

    this.start = question.start;
    this.question = question;

    // the spec says Expression.read, but
    //  that doesn't make sense... you can't
    //  do an assignment *only* in the "true" branch
    this.ifTrue = Expression._expression1(this);
    prev.tok.expectColon();
    this.ifFalse = Expression._expression1(this);

    this._end();
}
util.inherits(TernaryExpression, SimpleNode);

function InstanceOfExpression(prev, left) {
    SimpleNode.call(this, prev);

    this.start = left.start;
    this.left = left;
    this.right = Type.read(this);

    this._end();
}
util.inherits(InstanceOfExpression, SimpleNode);


function Primary(prev) {
    SimpleNode.call(this, prev);

    this._end();
}
util.inherits(Primary, SimpleNode);

Primary.read = function(prev) {
    var tok = prev.tok;

    var parens = Expression.readParen(prev);
    if (parens)
        return parens;

    if (tok.peekGenericOpen()) {
        // TODO
        tok.raiseUnsupported("NonWildcardTypeArguments");
    }

    var literal = Literal.read(prev);
    if (literal)
        return literal;

    var state = tok.save();
    var ident = tok.readIdentifier();
    switch (ident) {
    case "this":
        // TODO
        tok.raiseUnsupported("this ref");
        break;
    case "super":
        // TODO
        tok.raiseUnsupported("super ref");
        break;
    case "void":
        tok.raiseUnsupported("class literal");
        break;

    case "new":
        return Creator.read(prev);

    default:
        tok.restore(state);
        return IdentifierExpression.read(prev);
    }
}


/** Factory for literals */
var Literal = {
    _Value: function(prev, value) {
        SimpleNode.call(this, prev);

        this.value = value;
    },
    
    read: function(prev) {
        
        var tok = prev.tok;
        var peeked = String.fromCharCode(tok.peek());

        var lit;
        switch (peeked) {
        case '"':
        case "'":
            lit = StringLiteral.read(prev);
            if (!lit)
                tok.raise("String literal");
            return lit;
        case 'f':
            if (!tok.readString("false"))
                return;
            return new Literal._Value(prev, false);
        case 'n':
            if (!tok.readString("null"))
                return;
            return new Literal._Value(prev, null);
        case 't':
            if (!tok.readString("true"))
                return;
            return new Literal._Value(prev, true);
        }

        return NumberLiteral.read(prev);
    }
};
util.inherits(Literal._Value, SimpleNode);


/**
 * Actually hosts both String and char literals
 */
function StringLiteral(prev, state, value, type) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.value = value;
    this.type = type;

    this._end();
}
util.inherits(StringLiteral, SimpleNode);

StringLiteral.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();
    var target;
    if (tok.readQuote())
        target = '"';
    else if (tok.readApostrophe())
        target = "'";
    else
        return;
    
    // read in the string
    var buffer = '';
    var last = null;
    var next;
    for (;;) {
        next = String.fromCharCode(tok.read());
        if (last != '\\' && next == target)
            break;

        buffer += next;
        last = next;
    }

    // special case
    if (target == "'") {
        if (buffer.length > 1)
            tok.raise("char literal should be only 1");
        return new StringLiteral(prev, state, buffer, 'char');
    }

    return new StringLiteral(prev, state, buffer, 'String');
}


function NumberLiteral(prev, state, value, type) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.value = value;
    this.type = type;

    this._end();
}
util.inherits(NumberLiteral, SimpleNode);

NumberLiteral.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();

    if (tok.readDot()) {
        // special case
        return NumberLiteral._readFloaty(prev, state, '.');
    }

    var buf;
    var digit = tok.readDigit(10);
    if (digit === undefined)
        return; // not a number

    if (digit == '0' && tok.readString('x')) {
        // hex number
        buf = '0x' + NumberLiteral._readNumber(tok, 16);
        return NumberLiteral._newInty(prev, state, buf);
    } else if (digit == '0' && tok.readString('b')) {
        // binary number
        buf = '0b' + NumberLiteral._readNumber(tok, 2);
        return NumberLiteral._newInty(prev, state, buf);
    }

    buf = digit;
    buf += NumberLiteral._readNumber(tok, 10);

    if (tok.readDot()) {
        buf += '.';
        return NumberLiteral._readFloaty(prev, state, buf);
    }

    // just an int
    return NumberLiteral._newInty(prev, state, buf);
}

NumberLiteral._newInty = function(prev, state, buf) {
    var type = 'int';
    var tok = prev.tok;
    if (tok.readString('L') || tok.readString('l')) {
        buf += 'L';
        type = 'long'
    }

    return new NumberLiteral(prev, state, buf, type);
}

NumberLiteral._readNumber = function(tok, radix) {

    var buffer = '';
    var read;
    while ((read = tok.readDigit(radix)) !== undefined
            || tok.readUnderline()) {
        if (read !== undefined)
            buffer += read;
    }

    return buffer;
};

NumberLiteral._readFloaty = function(prev, state, buffer) {
    if (buffer === undefined)
        buffer = '';

    var tok = prev.tok;
    buffer += NumberLiteral._readNumber(tok, 10);

    var type = 'double';
    if (tok.readString('e')) {
        // scientific notation
        buffer += 'e' + NumberLiteral._readNumber(tok, 10);
    } else {
        // normal
        var next = String.fromCharCode(tok.peek());
        if (next == 'f' || next == 'F')
            type = 'float';
    }

    return new NumberLiteral(prev, state, buffer, type);
};


function Creator(prev, typeArgs, type) {
    SimpleNode.call(this, prev);

    this.start = typeArgs 
        ? typeArgs.start
        : type.start;
    var tok = this.tok;
    this.type = type;
    if (!typeArgs && tok.peekBracketOpen()) {
        // TODO
        tok.raiseUnsupported("ArrayCreatorRest");
    } else {
        this.args = new Arguments(this);

        if (tok.peekBlockOpen()) {
            this.body = new ClassBody(this);
        }
    }

    this._end();
}
util.inherits(Creator, SimpleNode);

Creator.read = function(prev) {
    var tok = prev.tok;
    var typeArgs;
    if (tok.peekGenericOpen())
        // TODO
        tok.raiseUnsupported("NonWildcardTypeArguments");

    var createdName = Type.readCreated(prev);
    if (!createdName)
        return;

    return new Creator(prev, typeArgs, createdName);
};


function Arguments(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectParenOpen();
    if (!tok.readParenClose()) {
        this.kids = [];

        do {
            this.kids.push(Expression.read(prev));
        } while (tok.readComma());

        tok.expectParenClose();
    }

    this._end();
}
util.inherits(Arguments, SimpleNode);


/**
 * Wraps an identifier ref
 */
function IdentifierExpression(prev, state, name) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.name = name;

    this._end();
}
util.inherits(IdentifierExpression, SimpleNode);

IdentifierExpression.read = function(prev) {
    var tok = prev.tok;
    var state = tok.save();
    var name = tok.readQualified();

    if (tok.peekParenOpen())
        return new MethodInvocation(prev, state, name);

    // FIXME other IdentifierSuffix stuff
    return new IdentifierExpression(prev, state, name);
}

function MethodInvocation(prev, state, name) {
    SimpleNode.call(this, prev);

    this.start_from(state);
    this.name = name;
    this.args = new Arguments(this);

    this._end();
}
util.inherits(MethodInvocation, SimpleNode);


/**
 * Params decl for methods
 */
function FormalParameters(prev) {
    SimpleNode.call(this, prev);

    this.tok.expectParenOpen();

    this.kids = [];

    var tok = this.tok;
    while (!tok.readParenClose()) {

        // simple way to capture final/Annotation
        var mods = Modifiers.read(this);
        var type = Type.read(this);

        // let's go out of our way for flexible parsing
        //  (allow incompleteness, if Tokenizer is non-strict)
        if (type) {
            var name = tok.readIdentifier();
            if (name) {
                this.kids.push(new VarDef(this, mods, type, name, false));
            } else {
                tok.raise("Name (for Params)");
            }
        } else {
            tok.raise("Type (for Params)");
        }

        tok.readComma();
    }

    this._end();
}
util.inherits(FormalParameters, SimpleNode);

/**
 * Modifiers list
 */
function Modifiers(prev) {
    SimpleNode.call(this, prev);

    this.kids = [];

    var tok = this.tok;
    while (!tok.isEof()) {
        var annotation = Annotation.read(this);
        if (annotation) {
            this.kids.push(annotation);
            continue;
        }

        var ident = tok.peekIdentifier();
        if (!Tokenizer.isModifier(ident)) 
            break;
        
        this.kids.push(tok.readIdentifier());
    }

    this._end();
}
util.inherits(Modifiers, SimpleNode);

Modifiers.read = function(prev) {
    var tok = prev.tok;
    if (!(tok.peekAt()
            || Tokenizer.isModifier(tok.peekIdentifier())))
        return;

    return new Modifiers(prev);
}


function Annotation(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectAt();

    this.name = tok.readQualified();
    if (tok.readParenOpen()) {
        this.args = [];

        var self = this;
        var addAll = function(array) {
            array.forEach(function(el) {
                self.args.push(el);
            });
        }

        do {
            var element = this._readElement();
            if (Array.isArray(element)) {
                addAll(element);
            } else {
                this.args.push(element);
            }
        } while (tok.readComma());

        tok.expectParenClose();
    }

    this._end();
}
util.inherits(Annotation, SimpleNode);

Annotation.prototype._readElement = function() {
    var tok = this.tok;
    var state = tok.save();

    // is this a pair?
    var ident = tok.readIdentifier();
    if (tok.peekEquals()) {
        return this._readElementPairs(state, ident);
    }

    // just a value. let's start over
    tok.restore(state);
    return Annotation._readElementValue(this);
};

Annotation.prototype._readElementPairs = function(state, ident) {
    var pairs = [
        new AnnotationElementValuePair(this, state, ident)
    ];
    while (this.tok.readComma()) {
        pairs.push(new AnnotationElementValuePair(this));
    }
    return pairs;
};

Annotation._readElementValue = function(prev) {

    var tok = prev.tok;
    if (tok.peekAt())
        return Annotation.read(prev);

    if (tok.peekBlockOpen()) {
        // ElementValueArrayInitializer
        return new AnnotationElementValueArray(prev);
    }

    return Expression._expression1(prev);
};

Annotation.read = function(prev) {
    if (!prev.tok.peekAt())
        return;

    return new Annotation(prev);
};

function AnnotationElementValuePair(prev, state, ident) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    if (state) {
        this.start_from(state);
        this.name = ident;
    } else {
        this.name = tok.readIdentifier();
    }

    tok.expectEquals();
    this.value = Annotation._readElementValue(this);

    this._end();
}
util.inherits(AnnotationElementValuePair, SimpleNode);

function AnnotationElementValueArray(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    tok.expectBlockOpen();

    this.kids = [];
    do {
        this.kids.push(Annotation._readElementValue(prev));
    } while (tok.readComma());

    tok.expectBlockClose();

    this._end();
}
util.inherits(AnnotationElementValueArray, SimpleNode);



/**
 * Factory for Types
 */
var Type = {
    read: function(prev) {
        var ident = prev.tok.peekIdentifier();
        if ('void' == ident || Tokenizer.isPrimitive(ident))
            return new BasicType(prev);
        else if (Tokenizer.isReserved(ident))
            return; // not a type

        return new ReferenceType(prev);
    },

    /** Read CreatedName */
    readCreated: function(prev) {
        // FIXME this should support TypeArgumentsOrDiamond
        return Type.read(prev);
    }
}

/**
 * Base class for nodes that host some sort of Type
 */
function TypeNode(prev) {
    SimpleNode.call(this, prev);

    var tok = this.tok;
    this.name = tok.readIdentifier();
    this.simpleName = this.name; // Simple name will drop all TypeArguments
    this.array = 0; // dimensions of array; zero means not an array
}
util.inherits(TypeNode, SimpleNode);

TypeNode.prototype._readArray = function() {
    var tok = this.tok;
    while (tok.readBracketOpen()) {
        tok.expectBracketClose();
        this.array++;
    }
};


function BasicType(prev) {
    TypeNode.call(this, prev);

    // easy
    this._readArray();
    this._end();
}
util.inherits(BasicType, TypeNode);

function ReferenceType(prev) {
    TypeNode.call(this, prev);

    var tok = this.tok;

    // TODO <TypeArgs> . etc.
    if (tok.readGenericOpen())
        tok.raiseUnsupported('type arguments');
    if (tok.readDot())
        tok.raiseUnsupported('Type.OtherType');

    this._readArray();
    this._end();
}
util.inherits(ReferenceType, TypeNode);


function TypeParameters(prev) {
    SimpleNode.call(this, prev);

    this._end();
}
util.inherits(Modifiers, SimpleNode);

TypeParameters.read = function(prev) {
    var tok = prev.tok;
    if (!tok.readGenericOpen())
        return;

    // TODO
    tok.raiseUnsupported("TypeParameters");
    return new TypeParameters(prev);
}


/**
 * Exports
 */
module.exports = {
    parseFile: function(path, buffer, callback) {
        var ast = new Ast(path, buffer);
        ast.parse(CompilationUnit);
        callback(null, ast);
    }
}
