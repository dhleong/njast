/**
 * HTTP handler for locating the definition
 *  of a thing. Called "define" to distinguish
 *  from "locate" which locates the node given 
 *  a position.
 */

module.exports = function(req, res) {
    
    req.ast(function(err, ast) {
        if (err) return res.send(400, err.message);

        var node = ast.locate(req.line, req.ch);
        res.json({error:"Not implemented; found: " + node.constructor.name});
    });
};
