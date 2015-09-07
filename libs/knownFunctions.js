var _ = require('underscore');
var nodeUtils = require('./nodeUtils');
var rewrite = require ('./rewrite');
var WebGL = require('../WebGL'); 
var KnownFunction = require('./KnownFunction');
var glMatrixMapping = require('./glmatrixMapping');

var renameFunction = function(newName) {
    return function(node) {
        node.callee = {
                        "type": "Identifier",
                        "name": newName,
                        parent: node
                      };
    };
};
var markType  = function(node) {
    var replacementNode = node.arguments[1];
    node.type = 'SequenceExpression';
    node.expressions = [ node.arguments[1] ];
    node.arguments = node.callee = undefined; 
};

var castTypeInference = function(node) {
    var dataType = node.arguments[0].value;
    return nodeUtils.setDataType(node, dataType).concat(nodeUtils.setDataType(node.arguments[1], dataType));
};

var makeInfix = function(infix) {
    return function(node) {
        node.type = "BinaryExpression"; 
        node.operator = infix;
        node.left  = node.arguments[0]; 
        node.right = node.arguments[1]; 
        node.callee = node.arguments = undefined;
    };
};

function MemberFunction( name, fn ) {
    this.name = name;
    this.fn = fn; 
}

function Shared(name, args, rtn) {
    KnownFunction.call(this, "Math."+name, args, rtn, renameFunction(name));
}

var knownFunctions = [
    { name: "builtIns.asType", inferTypes: castTypeInference, transform: markType, toString: function() { return 'builtIns.asType(<any>, string)';} },
    new KnownFunction("Math.atan2", ['float','float'], 'float', renameFunction("atan") ),
].concat(WebGL.MetaBuiltins.map( function(f) {
    return new KnownFunction( "builtIns." + f.name, f.argTypes, f.rtnType, renameFunction(f.name) );
})).concat(WebGL.MetaBuiltins.filter( function(f) {    
    return f.constructor.name == "Shared";
}).map(function(f) {
    return new KnownFunction( "Math." + f.name, f.argTypes, f.rtnType, renameFunction(f.name) );
})).concat( glMatrixMapping ).filter(function(n) { return n !== undefined; }); 

var knownFunctionLookup = {};
for(var i = 0;i < knownFunctions.length;i++) {
    if(knownFunctions[i] === undefined)
	continue; 

    if(knownFunctionLookup[knownFunctions[i].name] === undefined ) {
       knownFunctionLookup[knownFunctions[i].name] = []; 
    }
    
    knownFunctionLookup[knownFunctions[i].name].push(knownFunctions[i]);
}

function getKnownFunction(node) {
    var fName = rewrite(node.callee); 
    var candidates = knownFunctionLookup[fName];
    if(candidates === undefined)
        return;
    
    if(candidates.length === 1)
        return candidates[0];
    
    candidates = candidates.filter(function(f) { return f.argTypes.length == node.arguments.length; } );
    
    //if(candidates.length === 1)
        return candidates[0];
    
    //throw new Error("Overloaded functions by type are not yet implemented -- " + fName); 
}

function remapFunctions( ast, _this ) {
    
    _.chain(nodeUtils.getAllNodes(ast)).each(function(node) {
        if (node.type != 'CallExpression') 
	    return; 

        var funName = rewrite(node.callee); 
            
        var rewriteFunction = getKnownFunction(node);
        if(rewriteFunction && rewriteFunction.transform) // No transform function means its fine as-is
            rewriteFunction.transform(node); 
        else if(nodeUtils.getFunctionByName(ast, funName) !== undefined)
            return;     
        else if( _this && _this[ rewrite(node.callee) ] !== undefined) 
            return; 
        else if(rewriteFunction === undefined)
            node.error = new Error("Currently functions must be on a white list to be acceptable. " + rewrite(node.callee)   + " isn't on it.\n" +
                                   "Available are: " + _.map(knownFunctions, function(x) { return x.toString(); }).join(",\r\n") + "."  );
    });
}

module.exports = {
    remap: remapFunctions,
    getKnownFunction: getKnownFunction,
    MemberFunction: MemberFunction
};
