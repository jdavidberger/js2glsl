var example_setup = require('./example-setup');
var queryString = require('query-string');
var js2glsl = require ('../js2glsl');
var shaders = require('./example-shaders');

var parsed = queryString.parse(location.search);
if(parsed.n) {
    var idx = parseInt(parsed.n);
    var keys = Object.keys(shaders);
    if(idx >= 0 && idx < keys.length) { 
        console.log(keys[idx]);
        example_setup(shaders[keys[idx]]);
    }
    else 
        throw new Error("Valid examples are n=0.." + (examples.length-1) ); 
}
