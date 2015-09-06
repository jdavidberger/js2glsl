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
	nodeUtils.LOG(node.arguments[0]); 
	if(nodeUtils.isLHV(node.arguments[0]) == false) {
	    node.arguments.shift();
	    return makeInfix(infix)(node); 
	}

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


var makeUnary = function(op) {
    return function(node) {
        node.type = "UnaryExpression";
        node.operator = op;
        node.argument  = node.arguments[0]; 
    };
};

var makeEqualAndUnary = function(op) {
    return function(node) {
	if(nodeUtils.isLHV(node.arguments[0]) == false) {
	    node.arguments.shift();
	    return makeUnary(infix)(node); 
	}

        node.type = "AssignmentExpression";
        node.operator = "=";
        node.left  = node.arguments[0]; 
        node.right = { 
	    type: "UnaryExpression",
	    operator: op,
	    argument: node.arguments[1]
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
	    return new KnownFunction(ns + "." + name, [ns, ns, ns], ns, makeEqualAndInfix("*") ); 
	}
    }
}


function makeDiv(name) {
    return function(ns) {
	return new KnownFunction(ns + "." + name, [ns, ns, ns], ns, makeEqualAndInfix("/") ); 
    }
}

function makeSub(name) {
    return function(ns) {
	return new KnownFunction(ns + "." + name, [ns, ns, ns], ns, makeEqualAndInfix("-") ); 
    }
}

function makeAdd(ns) { 
    return new KnownFunction(ns + ".add", [ns, ns, ns], ns, makeEqualAndInfix("+") ); 
}

function makeNegate(ns) { 
    return new KnownFunction(ns + ".negate", [ns, ns], ns, makeEqualAndUnary("-") ); 
}

function makeScale(ns) {
    return new KnownFunction(ns + ".scale", [ns, ns, 'float'], ns, makeEqualAndInfix("*") ); 
}

function makeFromValues(ns, i) {
    var args = [];
    for(var j = 0;j < i;j++)
	args.push('float');
    return new KnownFunction(ns + ".fromValues", args, ns, renameFunction(ns) ); 
}

function makeDist(name) {
    return function (ns) { 
	return new KnownFunction(ns + "." + name, [ns, ns], 'float', renameFunction('distance') ); 
    }
}

var renameFunction = function(newName) {
    return function(node) {
        node.callee = {
            "type": "Identifier",
            "name": newName,
            parent: node
        };
    };
};


var makeEqualAndRenameFunction = function(to) {
    return function(node) {
	if(nodeUtils.isLHV(node.arguments[0]) == false) {
	    node.arguments.shift();
	    return renameFunction(to)(node); 
	}

        node.type = "AssignmentExpression";
        node.operator = "=";
        node.left  = node.arguments.shift();
        node.right = { 
	    type: "CallExpression",
	    callee: node.callee,
	    arguments:  node.arguments, 
	}
	renameFunction(to)(node.right);
    };
};

function renameWithFirstOut(from, args, rtn, to) {
    to = to || from; 
    args = args || ['T', 'T', 'T'];
    rtn  = rtn || 'T'; 
    return function(ns) { 
	var rtnT = rtn == 'T' ? ns : rtn; 
	var argsT = []; 
	for(var i = 0;i < args.length;i++)
	    argsT[i] = args[i] == 'T' ? ns : rtn; 
	return new KnownFunction(ns + "." + from, argsT, rtnT, makeEqualAndRenameFunction(to) ); 
    }
}

function rename(from, args, rtn, to) {
    to = to || from; 
    args = args || ['T', 'T', 'T'];
    rtn  = rtn || 'T'; 
    return function(ns) { 
	var rtnT = rtn == 'T' ? ns : rtn; 
	var argsT = []; 
	for(var i = 0;i < args.length;i++)
	    argsT[i] = args[i] == 'T' ? ns : rtn; 
	return new KnownFunction(ns + "." + from, argsT, rtnT, renameFunction(to) ); 
    }
}

var vectorAndMatrixFunctions = [
    makeClone,
    makeCopy, 
    makeCreate,
    makeMul('mul'),
    makeMul('multiply')
];

var vectorFunctions = [
    makeAdd,
    makeNegate,
    makeDiv('div'),
    makeDiv('divide'),
    renameWithFirstOut('cross'),
    renameWithFirstOut('normalize', ['T', 'T']),
    makeDist('distance'),
    makeDist('dist'),
    makeSub('sub'),
    makeSub('subtract'),
    makeScale,
    rename('dot', ['T', 'T'], 'float'),
    rename('length', ['T'], 'float'),
    rename('len', ['T'], 'float', 'length'),
    makeFromValues,
    renameWithFirstOut('max', ['T', 'T', 'T'], 'T'),
    renameWithFirstOut('min', ['T', 'T', 'T'], 'T')
];

var matrixFunctions = {
    
};

var functions = [];
for(var fn in vectorAndMatrixFunctions) {
    var fun = vectorAndMatrixFunctions[fn]; 
    for(var d = 1;d < 4;d++) {
	functions.push( fun('mat')(d+1) ); 
	functions.push( fun('vec')(d+1) ); 
    }
}

for(var fn in vectorFunctions) {
    var fun = vectorFunctions[fn]; 
    for(var d = 1;d < 4;d++) {
	var ns = 'vec' + (d+1);
	functions.push( fun(ns, (d+1) ) ); 
    }
}
module.exports = functions;
