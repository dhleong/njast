/**
 * Suggestions HTTP handler
 */

var Suggestor = require('../suggest');

/*
var Formatters = {
    flat: function(data) {
        var formatted = [];

        var _append = function(data) {
            if (data.name)
                formatted.push(data.name);
        }

        Object.keys(data).forEach(function(type) {
            var completions = data[type];
            completions.forEach(_append);
        });
        return formatted;
    }
}
*/

module.exports = function(req, res) {
    
    // console.log(req.headers, req.body);

    if (!req.body)
        return res.send(400, "Empty body");
    else if (!req.body.pos)
        return res.send(400, "No pos");

    var path = req.body.path;
    var line = req.body.pos[0];
    var ch   = req.body.pos[1];
    // var file = req.files.buffer;
    var file = req.body.buffer;

    // var formatter;
    // if (req.body.format && req.body.format in Formatters)
    //     formatter = Formatters[req.body.format];

    if (!(path && line && file !== undefined && ch !== undefined))
        return res.send(400);

    console.log('Suggest request @', path, ':', line, ch);
    
    var buf = new Buffer(file); // FIXME encoding?
    Suggestor.of(path, buf)
    .at(line, ch)
    .find(function(err, resolved)  {
        console.log("err?", err);

        // or... pretend it was okay and
        //  return empty set, but log?
        if (err) return res.send(500, err);

        // if (formatter)
        //     resolved = formatter(resolved);

        res.json({
            // TODO proper start/end locations?
            start: {ch: ch}
          , end: {ch: ch} 
          , results: resolved
        });
        console.log('Suggested', resolved);
    });
}
