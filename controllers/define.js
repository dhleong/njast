/**
 * HTTP handler for locating the definition
 *  of a thing. Called "define" to distinguish
 *  from "locate" which locates the node given 
 *  a position.
 */

module.exports = function(req, res) {
    
    // console.log("START", req.buf.start, req.buf.text.toString('utf-8'));
    // console.log("MODE", req.buf.mode);

    req.resolveDeclaringNode(function(type, node) {
        // easy peasy
        res.json({line: node.start.line, path: req.body.path});
    });
};
