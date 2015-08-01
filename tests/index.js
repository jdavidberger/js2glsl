var js2glsl = require("../js2glsl.js");

var exampleShaders = require('../examples/example-shaders');

var TokenString = require('glsl-tokenizer/string')
var ParseTokens = require('glsl-parser/direct')
var test = {};

test.isValidShader = function(shaderSpec){        
var shader = shaderSpec.ShaderSource();            
    try {        
            {
                var tokens = TokenString(shader.vertex);
                var ast = ParseTokens(tokens);
            } 
            {
                var tokens = TokenString(shader.fragment);
                var ast = ParseTokens(tokens)        
            }
    }catch(e) {
        throw new Error(e + "\n\nIn shaders: \n" + shader.vertex + "\n----\n" + shader.fragment); 
    }        
}


var shaders = exampleShaders;

function doTests() {
    describe('Shader tests', function() {
        function shaderTest(shaderName) {
            it(shaderName, function() {
                var shaderSpec = shaders[shaderName];            
                test.isValidShader(shaderSpec );
            });     
        };
        for(var shaderName in shaders) {
            shaderTest(shaderName);
        }    
    });
}

try {
    var createShader = require('gl-shader')
    var canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    var gl = canvas.getContext('webgl');
        
    test.isValidShader = function(shaderSpec){                
        var shader = shaderSpec.ShaderSource();            
        try {                           
                createShader(gl,
                    shader.vertex,
                    shader.fragment);
        }catch(e) {
            throw new Error(e + "\n\nIn shaders: \n" + shader.vertex + "\n----\n" + shader.fragment); 
        }        
    };

    doTests();
    
} catch(e) {
    console.log("Gl not available, only doing parse test"); 
    doTests();
}