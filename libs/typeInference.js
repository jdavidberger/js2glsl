var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var rewrite = require('./rewrite'); 

function setDataType(node, dataType, singleNode) {    
    if(dataType.indexOf("/*?*/") >= 0) {
        console.log && console.log("Warning: Guessing " + dataType + " for '" + rewrite(node) + "'");         
    }
    
    if(node.dataType) {
        function rawType(dt) {
            return dt.replace("/*?*/","");
        }
        if(rawType(node.dataType) != rawType(dataType)) {  
            throw new Error("Type inference failed for '" + rewrite(node) + "'. Resolved as both " + node.dataType + " and now " + dataType);
        }
        return []; 
    } else {
        if(node.name && !singleNode) {
            _.each(nodeUtils.getNodesWithIdInScope(node, node.name), function(node) {
                setDataType(node, dataType, true);
            });
            return nodeUtils.getNodesWithIdInScope(node, node.name);
        } else {
            node.dataType = dataType;
            return [node];
        }        
    }
};

function syncDataType(nodeA, nodeB) {
    if(nodeA.dataType !== undefined) {
        var changed = setDataType(nodeB, nodeA.dataType);
        if(changed.length > 0)
            return changed; 
    }
    if(nodeB.dataType !== undefined) {
        var changed = setDataType(nodeA, nodeB.dataType);
        if(changed.length > 0)
            return changed; 
    }
    return []; 
}

function inferTypes( rootNode ) {           
    var allNodes = nodeUtils.getAllNodes(rootNode);
    var nodesToProcess = [rootNode];
    
    // All array types are (for now) called vecn
    _.chain(allNodes).filter(function(node) {
            return node.type == 'ArrayExpression';
        }).each(function( node ) {
            nodesToProcess = nodesToProcess.concat(setDataType(node, "vec" + node.elements.length));
        });

    // Use known functions to match up argument and return types
    _.chain(allNodes).filter(function(node) {
        return node.type == 'CallExpression';
    }).each(function( node ) {            
        var knownFunction = knownFunctions.getKnownFunction(node);        
        if(knownFunction) {                
            nodesToProcess = nodesToProcess.concat(setDataType(node, knownFunction.rtnType));
            if(knownFunction.argTypes.length !== node.arguments.length) {
                throw new Error(node.callee.name + " should have " + knownFunction.argTypes.length + " arguments, it has " + node.arguments.length); 
            }            
            for(var i = 0;i < knownFunction.argTypes.length;i++) {
                nodesToProcess = nodesToProcess.concat(setDataType(node.arguments[i], knownFunction.argTypes[i]));
            }
        }
        
        if(knownFunction === undefined) {                
            var astFunctions = _.chain(nodeUtils.getAllNodes(node))
                                .filter(function (n) {
                                    return n.type == "FunctionDeclaration" && n.id.type == "Identifier" && n.id.name == node.callee.name;
                                }).each(function(n) {
                                    nodesToProcess = nodesToProcess.concat(  syncDataType(n, node) ); 
                                    _.each(n.params, function(an,idx) {
                                        nodesToProcess = nodesToProcess.concat( syncDataType(an, node.arguments[idx]) );
                                    });
                                }).value();
            if(astFunctions.length > 1) {
                throw new Error("Type overloading isn't allowed; not even sure how you did that.");
            }
        }           
    });
        
    // Mark all index types as ints, mark all indexed values as float
    _.chain(allNodes).filter(function(node) {
        return node.type == "MemberExpression" && node.computed;
    }).each(function (node ) {        
        nodesToProcess = nodesToProcess.concat( setDataType(node.property, 'int') );
        nodesToProcess = nodesToProcess.concat( setDataType(node, 'float') );
        if(node.property.type == "Literal")
            node.object.dataTypeAtLeast = node.property.value;        
    });         

    _.chain(allNodes).each(function (node) {        
        if(node.dataTypeAtLeast > 0) {            
            nodesToProcess = nodesToProcess.concat( setDataType(node, nodeUtils.getDataTypeForId(node, node)) ); 
        }
    }); 
    
    while(nodesToProcess.length) {
        var node = nodesToProcess.pop();
        var parentNode = node.parent; 
        // in var a = b; if we know type of b we know type of a
        if(node.type == 'CallExpression') {
            nodesToProcess = nodesToProcess.concat( syncDataType(node, node.callee) );                 
        }
        
        if(parentNode) {
            if(parentNode.type == 'VariableDeclarator') {
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode.id, parentNode.init) );            
            }
        if(parentNode.type == 'CallExpression' && parentNode.callee == node) {
            nodesToProcess = nodesToProcess.concat( syncDataType(node, parentNode) );                 
        }   
        
        // Happens when an argument gets its type processed
        if(parentNode.type == "FunctionDeclaration" || parentNode.type == "FunctionExpression") {
            _.chain( nodeUtils.getNodesWithIdInScope(node, parentNode.id) ).filter(function(node) {
                return node.parent.type == 'CallExpression';
            }).each(function (calleeIdNode) {
                var callExpression = calleeIdNode.parent; 
                nodesToProcess = nodesToProcess.concat(  syncDataType(parentNode.id, callExpression) ); 
                _.each(parentNode.params, function(an,idx) {
                    nodesToProcess = nodesToProcess.concat( syncDataType(an, callExpression.arguments[idx]) );
                });
            }); 
            
            _.chain(nodeUtils.getAllDescendants(parentNode))
                 .filter(nodeUtils.hasType("ReturnStatement"))
                 .each(function(returnStatement) {
                        if(returnStatement.argument) {
                            nodesToProcess = nodesToProcess.concat( syncDataType(returnStatement.argument, parentNode.id) );
                            console.log && console.log("Deducing " + rewrite(returnStatement.argument) + " as " + parentNode.id.dataType + " from function return type");            
                        }
                 }); 
        }
        
        if(parentNode.type == 'ReturnStatement' && parentNode.argument != undefined) {
            var p = parentNode; 
            while(p != undefined && p.type != "FunctionDeclaration" && p.type != "FunctionExpression" ) {
                p = p.parent; 
            }            
            if(p) {
                nodesToProcess = nodesToProcess.concat( syncDataType(p.id, parentNode.argument) );                 
                console.log && console.log("Deducing " + p.id.name + " as " + p.id.dataType + " from the return type " + rewrite(parentNode.argument));
            }
            else throw new Error("Couldn't find matching function statement for return statement"); 
        }
        
        // Anything with a left/right thing has the same type. Also mark the parent Node. 
        if(parentNode.left != undefined && parentNode.right != undefined) {
            nodesToProcess = nodesToProcess.concat( syncDataType(parentNode.left, parentNode.right) );
            nodesToProcess = nodesToProcess.concat( syncDataType(parentNode, parentNode.left) );     
            console.log && console.log("Deducing " + rewrite(parentNode) + " as " + parentNode.dataType + " from binary syntax");            
        }; 
        
            
        }
        if(nodesToProcess.length == 0 ) {
            _.chain(allNodes).filter(function (node) {                 
                return node.dataType === undefined && node.dataTypeHint !== undefined;
            }).each(function(node) {
                nodesToProcess = nodesToProcess.concat( setDataType(node, node.dataTypeHint) ); 
                console.log( rewrite(node) + " set to " + node.dataTypeHint + " based on hint"); 
            });
        }

        if(nodesToProcess.length == 0 ) {            
            _.chain(allNodes).each(function (node) {        
                if(node.dataType === undefined && node.dataTypeAtLeast > 0) {            
                    nodesToProcess = nodesToProcess.concat( setDataType(node, nodeUtils.getDataTypeForId(node, node)) ); 
                    console.log( rewrite(node) + " set to " + node.dataType + " based on minimum index"); 
                }
            });                
        }
        
        if(nodesToProcess.length == 0 ) {
            // When all is said and done, cement in any unknowns. Also fixes arrays. 
            _.chain(allNodes).each(function (node) {        
                if(node.name && node.type == "Identifier" && node.dataType === undefined) {            
                    nodesToProcess = nodesToProcess.concat( setDataType(node, nodeUtils.getDataTypeForId(node, node)) ); 
                    console.log( rewrite(node) + " set to " + node.dataType + " based on guess"); 
                }
            });                
        }
       
        
    }
} 

module.exports = {
    inferTypes: inferTypes    
};