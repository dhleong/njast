/**
 * Suggestions HTTP handler
 */

var Suggestor = require('../suggest');

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

        resolved.qualifiedName = undefined; // strip this field... unneeded
        res.results(resolved);
        // console.log('Suggested', require('util').inspect(resolved, {depth:5}));
    });
}
