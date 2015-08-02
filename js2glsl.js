var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./libs/nodeUtils');
var knownFunctions = require('./libs/knownFunctions');
var rewrite = require('./libs/rewrite'); 
var typeInference = require('./libs/typeInference'); 
var ShaderSpecification = require('./libs/ShaderSpecification'); 

var js2glsl = require("./core");

js2glsl.ShaderSpecification = ShaderSpecification;

module.exports = js2glsl;