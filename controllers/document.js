/**
 * HTTP handler for fetching documentation
 *  of a thing. 
 */

function project(res, loader, type, node) {
    if (!node.project) {
        console.error(node.constructor.name, "does NOT implement project()");
        res.json({
            type: 'var'
          , result: {
                name: node.name
              , type: '(project not implemented for ' + node.constructor.name + ')' 
              , javadoc: node.javadoc
            }
        });
    }

    // console.log("PROJECT", node.toJSON());
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
    req.resolveDeclaringNode(function(type, node) {
        project(res, loader, type, node);
    });
};
