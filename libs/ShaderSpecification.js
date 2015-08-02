var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var rewrite = require('./rewrite'); 
var typeInference = require('./typeInference'); 

var js2glsl = require('../core');

function ShaderSpecification(vertex, fragmentColor) {
    vertex        && (this.VertexPosition = vertex); 
    fragmentColor && (this.FragmentColor  = fragmentColor);
};
ShaderSpecification.prototype.VertexPosition = function() {    
    return [0.0,0.0,0.0,1];
}
ShaderSpecification.prototype.FragmentColor = function() {
    return [0.5,0.5,0.5,1];
}
ShaderSpecification.prototype.KnownFunctionSources = knownFunctions.knownFunctionsSource; 

ShaderSpecification.prototype.ShaderSource = function() {    
    return js2glsl(this, this.KnownFunctionSources); 
}
ShaderSpecification.prototype.ShaderSource.exclude = true; 
module.exports = ShaderSpecification;
