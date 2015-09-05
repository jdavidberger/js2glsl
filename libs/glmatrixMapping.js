var _ = require('underscore');
var nodeUtils = require('./nodeUtils');
var rewrite = require ('./rewrite');
var WebGL = require('../WebGL'); 
var KnownFunction = require('./KnownFunction');

var renameFunction = function(newName) {
    return function(node) {
        node.callee = {
                        "type": "Identifier",
                        "name": newName,
                        parent: node
                      };
    };
};

var identity = function(node) {
    node.type = "SequenceExpression"; 
    node.expressions = [
	node.arguments[0]
    ];
};

var makeInfix = function(infix) {
    return function(node) {
        node.type = infix[0] = '=' ? 
	    "AssignmentExpression" :
	    "BinaryExpression"; 

        node.operator = infix;
        node.left  = node.arguments[0]; 
        node.right = node.arguments[1]; 
        node.callee = node.arguments = undefined;
    };
};

var makeEqualAndInfix = function(infix) {
    return function(node) {
        node.type = "AssignmentExpression";
        node.operator = "=";
        node.left  = node.arguments[0]; 
        node.right = { 
	    type: "BinaryExpression",
	    operator: infix,
	    left: node.arguments[1],
	    right: node.arguments[2]
	}
    };
};

var makeRawSrc = function(src) {
    return function(node) {
	node.type = 'rawSource';
	node.src = src;
    }
};

function makeClone(baseType) { 
    return function(i) {
	var ns = baseType + i; 
	return new KnownFunction(ns + ".clone", [ns], ns, identity); 
    }
}

function makeCopy(baseType) { 
    return function(i) {
	var ns = baseType + i; 
	return new KnownFunction(ns + ".copy", [ns, ns], ns, makeInfix("=")); 
    }
}

function makeCreate(baseType) { 
    return function(i) {
	var ns = baseType + i; 
	return new KnownFunction(ns + ".create", [], ns, makeRawSrc(ns + "(0)")); 
    }
}

function makeMul(name) {
    return function(baseType) { 
	return function(i) {
	    var ns = baseType + i; 
	    return new KnownFunction(ns + "." + name, [], ns, makeEqualAndInfix("*") ); 
	}
    }
}

var vectorAndMatrixFunctions = {
    clone: makeClone,
    copy: makeCopy, 
    create: makeCreate,
    mul: makeMul('mul'),
    multiply: makeMul('multiply'),
    scale: makeScale
};

var matrixFunctions = {
    identity: makeIdentity
};

var functions = [];
for(var f in vectorAndMatrixFunctions) {
    for(var d = 0;d < 4;d++) {
	functions.push( f('mat')(d+1) ); 
	functions.push( f('vec')(d+1) ); 
    }
}

module.exports = functions;
