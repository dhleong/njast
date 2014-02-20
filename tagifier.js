
var Ast = require('./ast')
    , util = require('util')
    , events = require('events');

function buildTagPath(node) {
    return node.name; // TODO
}

function Tagifier(path, buffer) {
    this._path = path;
    this._buffer = buffer;
    this._tags = {};
}
util.inherits(Tagifier, events.EventEmitter);

Tagifier.prototype.wordAt = function(word, line, col) {
    this._word = word;
    this._line = line;
    this._col = col;

    return this;
}

Tagifier.prototype.start = function() {
    if (!this._ast) {
        this._ast = new Ast(this._path, this._buffer);
    }

    var self = this;
    this._ast
    .on('vardef', function(node) {

        // TODO node path...
        self._tags[buildTagPath(node)] = node;

        if (!node.matchesScope(self._line))
            return;

        if (node.name == self._word) {
            self.emit('word', node);
        }
    })
    .on('method', function(node) {
        // TODO node path...
        self._tags[buildTagPath(node)] = node;

        if (node.name == self._word) {
            self.emit('word', node);
        }
    })
    .parse(this.__onParsed.bind(this));
}

Tagifier.prototype.__onParsed = function(err, ast) {
    this._ast = ast;
    this.emit('parsed', err, this._tags);
}

module.exports = {
    of: function(path, buffer) {
        return new Tagifier(path, buffer);
    }
};
