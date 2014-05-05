/**
 * Suggestions HTTP handler
 */

var fs = require('fs')
  , Suggestor = require('../suggest');

module.exports = function(req, res) {

    var path = req.body.path;
    var line = req.body.line;
    var ch   = req.body.ch;
    var file = req.files.buffer;

    if (!(path && line && ch && file))
        return res.send(400);
    
    fs.readFile(file.path, function(err, buf) {
        if (err) return res.send(500, err);

        Suggestor.of(path, buf)
        .at(line, ch)
        .find(function(err, resolved)  {

            // or... pretend it was okay and
            //  return empty set, but log?
            if (err) return res.send(500, err);

            res.json(resolved);
        });
    });
}
