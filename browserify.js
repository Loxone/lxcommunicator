var browserify = require('browserify');
var UglifyJS = require("uglify-js");
var derequire = require('derequire');
var fs = require('fs');

console.info("Creating browserified module...");
var releaseBrowserify = browserify(["./LxCommunicator.js"], { standalone: "LxCommunicator"});
streamToString(releaseBrowserify.bundle(), function(code) {
    console.info("Creating debug module");
    var releaseCode = derequire(code);

    console.info("Creating release module");
    var debugCode = UglifyJS.minify(releaseCode).code;

    console.info("Saving debug module");
    fs.writeFileSync("LxCommunicator~Browser.min.js", debugCode);

    console.info("Saving release module");
    fs.writeFileSync("LxCommunicator~Browser.js", releaseCode);

    console.info("LxCommunicator~Browser.js and LxCommunicator~Browser.min.js has been created!");

});

function streamToString(stream, cb) {
    const chunks = [];
    stream.on("data", function(chunk) {
        chunks.push(chunk.toString());
    });
    stream.on("end", function() {
        cb(chunks.join(''));
    });
}
