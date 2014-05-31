/**
 * HTTP handler for fetching documentation
 *  of a thing. 
 */

function project(res, loader, type, node) {
    node.project(loader, function(err, projection) {
        if (err) return res.send(400, err.message);
        
        console.log(type, projection)
        res.json({
            type: type
          , result: projection
        });
    });
}

module.exports = function(req, res) {
    
    console.log("Document @", req.line, req.ch, "for", req.body.path);
    var loader = req.classLoader();
    req.ast(function(err, ast) {
        if (err) return res.send(400, err.message);

        var node = ast.locate(req.line, req.ch);
        if (!node) return res.json({error: "No object found"})
        node.resolveDeclaringType(loader, function(err, type) {
            if (err) return res.send(400, err.message);

            var declaring = ast.qualifieds[type];
            if (declaring) {
                // yes, it's local... search by scope
                var varDef = node.searchScope(node.name)
                if (varDef)
                    return project(res, loader, 'var', varDef);

                var method = node.searchMethodScope(node.name);
                if (method)
                    return project(res, loader, 'method', method);
            }

            // TODO parent types?
            res.json({error:"Not implemented; found: " + node.constructor.name + " in " + type});
        });
    });
};
