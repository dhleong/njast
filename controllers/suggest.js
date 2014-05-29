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
    
    console.log('Suggest request @', req.body.path, ':', req.line, req.ch);

    // console.log("START", req.buf.start, req.buf.text.toString('utf-8'));
    
    Suggestor.of(req.body.path, req.buf)
    .at(req.line, req.ch)
    .find(function(err, resolved)  {
        console.log("err?", err);

        // or... pretend it was okay and
        //  return empty set, but log?
        if (err) return res.send(500, err);

        // if (formatter)
        //     resolved = formatter(resolved);

        console.log(resolved);
        res.results(resolved);
        console.log('Suggested', resolved);
    });
}
