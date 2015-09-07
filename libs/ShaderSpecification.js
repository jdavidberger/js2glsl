var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var rewrite = require('./rewrite'); 
var typeInference = require('./typeInference'); 
var WeakMap = require('weakmap');

var js2glsl = require('../core');

function ShaderSpecification(vertex, fragmentColor) {
    if(vertex) this.VertexPosition = vertex; 
    if(fragmentColor) this.FragmentColor = fragmentColor;
    this.compiledPrograms = new WeakMap();
}
ShaderSpecification.prototype.VertexPosition = function() {    
    return [0.0,0.0,0.0,1];
};
ShaderSpecification.prototype.FragmentColor = function() {
    return [0.5,0.5,0.5,1];
};
ShaderSpecification.prototype.GetProgram = function (gl){
    var prog = this.compiledPrograms.get(gl);
    if(prog) return prog; 
    
    var shaders = this.ShaderSource();
    
    var shaderProgram = gl.createProgram();

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    vertexShader.src = shaders.vertex;
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    fragmentShader.src = shaders.fragment;
    
    [vertexShader, fragmentShader].forEach(function(shader) {
        gl.shaderSource(shader, shader.src);
        gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              throw new Error(gl.getShaderInfoLog(shader) + "\r\n\r\n" + shader.src);              
          }
        gl.attachShader(shaderProgram, shader);
    });
      
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(shaderProgram));
    }
    
    this.compiledPrograms.set(gl, shaderProgram);
    return shaderProgram;
};
ShaderSpecification.prototype.GetProgram.exclude = true; 
ShaderSpecification.prototype.ShaderSource = function() {    
    return js2glsl(this, this.KnownFunctionSources); 
};
ShaderSpecification.prototype.ShaderSource.exclude = true; 
module.exports = ShaderSpecification;
