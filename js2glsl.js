var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./libs/nodeUtils');
var knownFunctions = require('./libs/knownFunctions');
var rewrite = require('./libs/rewrite'); 
var typeInference = require('./libs/typeInference'); 
var ShaderSpecification = require('./libs/ShaderSpecification'); 
var builtIns = require("./WebGL"); 
var js2glsl = require("./core");
var Sampler2D = require("./libs/sampler2D"); 

js2glsl.ShaderSpecification = ShaderSpecification;
js2glsl.builtIns = builtIns.Builtins; 
js2glsl.Sampler2D = Sampler2D; 

module.exports = js2glsl;
