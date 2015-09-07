var rewrite = require('./rewrite'); 
var esprima = require('esprima'); 
var glMatrix = require('gl-matrix');
var nodeUtils = require('./nodeUtils');
var _ = require('underscore');
var stdlib = {}; 

var vec3_transformMat4_a = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2],
    w = m[3] * x + m[7] * y + m[11] * z + m[15];
    w = w === 0 ? 1.0 : w; 
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
};

var vec3_transformMat4_b = function(a, m) {
    var x = a[0], y = a[1], z = a[2],
        w = m[3] * x + m[7] * y + m[11] * z + m[15];
    w = w === 0 ? 1.0 : w; 
    return [ (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
	     (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
	     (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];

};

function addGlmatrixFunc(baseType, name, src) {	
    var fn = glMatrix[baseType][name]; 
    if(fn === undefined && src === undefined)
	return;
    src = src || fn.toString();
    var origName = baseType + "." + name;
    name = baseType + "_" + name; 
    var parseTree = esprima.parse(rewrite.normalizeFunctionDeclaration(src,name));	
    var funBody = parseTree.body[0];
    if(funBody.params[0] && funBody.params[0].name == 'out') {
	funBody.params[0].isOutParam = true;
	_.each(nodeUtils.getNodesWithIdInScope(parseTree, funBody.params[0]), function(node) {
	    node.name = "out_param"; 
	}); 
    }
    if(stdlib[origName] === undefined) stdlib[origName] = []; 
    stdlib[origName].push(parseTree);
}

function addMatFuncs(baseType, i) {
    function addMatFunc(name, src) {
	return addGlmatrixFunc(baseType, name, src); 
    }
    addMatFunc('determinant'); 
    addMatFunc('adjoint', glMatrix[baseType].adjoint ? 
	       glMatrix[baseType].adjoint :
	       glMatrix[baseType].scalar.adjoint.toString()); 
    addMatFunc('invert', glMatrix[baseType].invert ? 
	       glMatrix[baseType].invert :
	       glMatrix[baseType].scalar.invert.toString()); 
    addMatFunc('frob');
    addMatFunc('fromRotationTranslationScaleOrigin'); 
}

function addVecFuncs(baseType, i) {
    function addVecFunc(name, src) {
	return addGlmatrixFunc(baseType, name, src); 
    }
    addVecFunc('lerp'); 
    addVecFunc('scaleAndAdd'); 
    addVecFunc('squaredDistance');
    addVecFunc('sqrDist');
    addVecFunc('sqrLen');
    addVecFunc('squaredLength');

    function createTxMatFunc(matDim) {
	if(matDim == 4 && i == 3)
	    return [vec3_transformMat4_a.toString(), vec3_transformMat4_b.toString()];
	if(matDim <= i) return; 
	var vecline = "[" + 
	    _.range(0, i).map(function(idx) { return 't['+idx+']';}).concat(
		_.range(i, matDim-1).map(function(idx) { return '0'; })).join(",") +
	    ",1]";
	var swiz = _.range(0, i).map(function(idx) { return String.fromCharCode(idx + 'x'.charCodeAt(0)); }).join("");
	return ["function(out, t, m) { return out_param = vec"+matDim+".transformMat"+matDim+"(vec"+matDim+".create(), " + vecline + ", m)."+swiz+";}",
		"function(t, m) { return vec"+matDim+".transformMat"+matDim+"(vec"+matDim+".create(), " + vecline + ", m)."+swiz+";}"];
    }
    for(var matDim = 2;matDim <= 4;matDim++){
	var funcs = createTxMatFunc(matDim);
	if(funcs) {
	    addVecFunc('transformMat' + matDim, funcs[0]);
	    addVecFunc('transformMat' + matDim, funcs[1]);
	}
    }
}

for(var i = 2;i <= 4;i++) {
    addVecFuncs('vec' + i, i);    
    addMatFuncs('mat' + i, i); 
}

module.exports = stdlib; 
