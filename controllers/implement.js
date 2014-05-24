/**
 * Implement (method) HTTP handler
 */

var async = require('async');

module.exports = function(req, res) {
    
    // console.log(req.headers, req.body);

    console.log('Implement suggestions request @', 
        req.body.path, ':', req.line, req.ch);
    
    req.ast(function(err, ast) {
        if (err) return res.send(400, err.message);

        var node = ast.locate(req.line, req.ch);
        if (node.constructor.name != 'ClassBody')
            return res.send(400, "Must implement within a Class Body");

        var parent = node.getParent();
        if (!parent.extends)
            return res.send(200, {'methods': []});

        var classLoader = req.classLoader();
        parent.extends.resolve(classLoader, function(type) {
            if (!type) {
                console.log("Couldn't resolve type", parent.extends.name);
                return res.send(500);
            }

            classLoader.openClass(type, ['methods'], function(err, projection) {
                if (err) {
                    console.log(err);
                    return res.send(500, err.message);
                }

                node.project(classLoader, ['methods'], function(err, thisClass) {
                    if (err) {
                        res.results(projection);
                        console.log('Implementables', projection);
                    }

                    // filter projection by methods not already overridden
                    async.reject(projection.methods, function(method, cb) {
                        var len = thisClass.methods.length;
                        for (var i=0; i < len; i++) {
                            // TODO actual params comparison
                            var m = thisClass.methods[i];
                            if (m.name == method.name
                                    && m.params.length == method.params.length)
                                return cb(true);

                            // static methods cannot be overridden
                            if (~method.mods.indexOf('static'))
                                return cb(true);
                        }
                        cb();
                    }, function(filtered) {
                        res.results({'methods': filtered});
                        console.log('Filtered Implementables', filtered);
                    });
                });
            });
        });
    });

}

