/**
 * "init" controller, used to precache
 */

module.exports = function(req, res) {
    res.send(204);

    // TODO
    console.log("Received init @", req.body.path);
}

module.exports.usesBuffers = false;
