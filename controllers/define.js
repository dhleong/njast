/**
 * HTTP handler for locating the definition
 *  of a thing. Called "define" to distinguish
 *  from "locate" which locates the node given 
 *  a position.
 */

module.exports = function(req, res) {
    
    // console.log("START", req.buf.start, req.buf.text.toString('utf-8'));
    // console.log("MODE", req.buf.mode);

    var loader = req.classLoader();
    req.ast(function(err, ast) {
        if (err) return res.send(400, err.message);

        var node = ast.locate(req.line, req.ch);
        node.resolveDeclaringType(loader, function(err, type) {
            if (err) return res.send(400, err.message);

            var declaring = ast.qualifieds[type];
            if (declaring) {
                // yes, it's local... search by scope
                var varDef = node.searchScope(node.name)
                if (varDef)
                    return res.json({line: varDef.start.line, path: req.body.path});

                var method = node.searchMethodScope(node.name);
                if (method)
                    return res.json({line: method.start.line, path: req.body.path});
            }

            // TODO parent types?
            res.json({error:"Not implemented; found: " + node.constructor.name + " in " + type});
        });
    });
};
