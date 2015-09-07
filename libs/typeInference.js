var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var rewrite = require('./rewrite'); 


var syncDataType = nodeUtils.syncDataType;
var setDataType  = nodeUtils.setDataType; 
var LOG = nodeUtils.LOG;

/**
    Attempts to assign a dataType to every l-value in the AST
*/
function inferTypes( rootNode ) {           
    var allNodes = nodeUtils.getAllNodes(rootNode);
    var nodesToProcess = [rootNode];

    // All array types are (for now) called vec[n]
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
            nodesToProcess = nodesToProcess.concat(knownFunction.inferTypes(node));
        }
        
        if(knownFunction === undefined) {                
            var astFunctions = _.chain(nodeUtils.getAllNodes(node))
                .filter(function (n) {
                    return n.type == "FunctionDeclaration" && n.id.type == "Identifier" && n.id.name == node.callee.name && n.params.length == node.arguments.length;
                }).each(function(n) {
                    nodesToProcess = nodesToProcess.concat(  syncDataType(n, node), "Matched call to return type of other function"); 
                    _.each(n.params, function(an,idx) {
                        nodesToProcess = nodesToProcess.concat( syncDataType(an, node.arguments[idx], "Matched " + idx + " argument") );
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
    
    while(nodesToProcess.length) {
        var node = nodesToProcess.pop();
        var parentNode = node.parent; 

        /***** Push down inferences -- inferences that are based on this node, and push down to its children.  */
        if(node.type == 'CallExpression') {
            nodesToProcess = nodesToProcess.concat( syncDataType(node, node.callee), "CallExpression has type of called functions return" );                         }
        // For unary types, propagate down to the expression
        else if(node.type == "UnaryExpression" || node.type == 'UpdateExpression') {
            nodesToProcess = nodesToProcess.concat( syncDataType(node.argument, node), "Unary expressions share type" ); 
        }
        else if(node.type == 'ConditionalExpression') {
            nodesToProcess = nodesToProcess.concat( syncDataType(node.alternate, node.consequent, "Ternary outcomes are equal") );               
            nodesToProcess = nodesToProcess.concat( syncDataType(node, node.consequent, "Ternary returns same type as outcomes") );
        } 

        /***** Push up inferences -- inferences that are based on the parent node, and push up to that parent.  */
        if(parentNode) {
            if(parentNode.type == 'VariableDeclarator' && parentNode.init) {
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode.id, parentNode.init, "Match var id to initialization") );            
            } else if(parentNode.type == 'CallExpression' && parentNode.callee == node) {
                nodesToProcess = nodesToProcess.concat( syncDataType(node, parentNode, "Call expression") );                 
            } else if(parentNode.type == 'ConditionalExpression') {
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode.alternate, parentNode.consequent,"Ternary outcomes are equal") );
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode, parentNode.consequent,"Ternary returns same type as outcomes") ); 
	    }
            // Happens when an argument gets its type processed
            else if(parentNode.type == "FunctionDeclaration" || parentNode.type == "FunctionExpression") {
                _.chain( nodeUtils.getNodesWithIdInScope(node, parentNode.id) ).filter(function(node) {
                    return node.parent.type == 'CallExpression' && node.parent.arguments.length == parentNode.params.length;
                }).each(function (calleeIdNode) {
                    var callExpression = calleeIdNode.parent; 
                    nodesToProcess = nodesToProcess.concat(  syncDataType(parentNode.id, callExpression, "Call has same type as fn") ); 
                    _.each(parentNode.params, function(an,idx) {
                        nodesToProcess = nodesToProcess.concat( syncDataType(an, callExpression.arguments[idx], "Argument syncs for " + idx) );
                    });
                }); 
                
                _.chain(nodeUtils.getAllDescendants(parentNode))
                     .filter(nodeUtils.hasType("ReturnStatement"))
                     .each(function(returnStatement) {
                         if(returnStatement.argument) {
                             nodesToProcess = nodesToProcess.concat( 
				 syncDataType(returnStatement.argument, parentNode.id, "Fn type must match return argument") );
                            }
                     }); 
            }
            
            // If a return statements argument was set, propagate to the function definition its in
            else if(parentNode.type == 'ReturnStatement' && parentNode.argument != undefined) {
                var p = parentNode; 
                while(p != undefined && p.type != "FunctionDeclaration" && p.type != "FunctionExpression" ) {
                    p = p.parent; 
                }    
                if(p && p.type == "FunctionExpression") {
                    p = p.parent; 
                }
                    
                if(p) {
                    nodesToProcess = nodesToProcess.concat( syncDataType(p.id, parentNode.argument), "Return argument must match function type" ); 
                }
                else throw new Error("Couldn't find matching function statement for return statement"); 
            }
            
            // Anything with a left/right thing has the same type. Also mark the parent Node. 
            else if(parentNode.left != undefined && parentNode.right != undefined) {
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode.left, parentNode.right, "left == right for binary expression") );
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode, parentNode.left, "binary expression parent node must equal operands") );
            }
            // For unary types, propagate up to the expression node
            else if(parentNode.type == "UnaryExpression" || parentNode.type == 'UpdateExpression') {
                nodesToProcess = nodesToProcess.concat( syncDataType(parentNode, node, "Unary match") ); 
            }
            
            
        }
        
        
        /***** Last resort propagation methods */
        
        // Out of nodes? Solidify the array counts. 
        if(nodesToProcess.length == 0 ) {            
            var nodesWithDataTypeMinSizes = _.chain(allNodes).filter(function (node) {        
		return node.dataType === undefined && node.dataTypeAtLeast > 0;
	    }).sortBy(function(node) { 
		// Ordering matters for this operation; we start with the things that resolve as the largest types. See comment below.
		return -node.dataTypeAtLeast;
	    }).value();
	    
	    // We have to bail if nodes get added to process. By starting with the largest, we make sure situations where 
	    // you have two unknown sized vecs that are set to be equal, it always ends up assigning the larger size. 
	    for(var i = 0;i < nodesWithDataTypeMinSizes.length && nodesToProcess.length == 0;i++) {
		var node = nodesWithDataTypeMinSizes[i]; 
		LOG( rewrite(node) + " max seen index --" + nodeUtils.getDataTypeForId(node, node) ); 
                nodesToProcess = nodesToProcess.concat( setDataType(node, nodeUtils.getDataTypeForId(node, node)) ); 
 	    }
        }
        
        // If we are still out of nodes to process, first try applying dataTypeHints
        if(nodesToProcess.length == 0 ) {
            _.chain(allNodes).filter(function (node) {                 
                return node.dataType === undefined && node.dataTypeHint !== undefined;
            }).each(function(node) {
                nodesToProcess = nodesToProcess.concat( setDataType(node, node.dataTypeHint) ); 
		LOG("Setting " + rewrite(node) + " to " + node.dataTypeHint + " based on hint");
            });
        }


        // Essentially this just guesses 'float' for the rest of the unknowns. This is most likely ok. GLSL needs a type
        // and _most_ of the time you want float. In particular, if a variable is just not used, it could be a coin flip
        // if it is an int or a float, but since it isn't used either one works and the GLSL compiler will probably just 
        // yank it out. 
        if(nodesToProcess.length == 0 ) {            
            _.chain(allNodes).each(function (node) {        
                if(node.name && node.type == "Identifier" && node.dataType === undefined && isInCallExpression(node) == false) {            
		    LOG( rewrite(node) + " best guess"); 
                    nodesToProcess = nodesToProcess.concat( setDataType(node, nodeUtils.getDataTypeForId(node, node)) ); 
                }
            });                
        }
       
        
    }

    _.chain(allNodes).filter(function(node) {
        return node.type == "ForStatement";
    }).each(function (node ) {        
	markRHSConstant(node.init);
	markRHSConstant(node.test); 
    });

} 
function isInCallExpression(node) {
    if(node === undefined)
	return false;
    
    switch(node.type) {
    case 'Identifier':
    case 'MemberExpression':
	return isInCallExpression(node.parent);
    case 'CallExpression':
	return true; 
    }
    return false;
}
function markRHSConstant(astNode) {
    switch(astNode.type) {
	case 'Identifier': 
	_.each(nodeUtils.getNodesWithIdInScope(astNode, astNode.name), function(node) {
	    node.isConst = true; 
	});
	return;
	case 'UnaryExpression':
	return markRHSConstant(astNode.argument); 
	case 'VariableDeclarator':
	return markRHSConstant(astNode.init); 
	case 'VariableDeclaration':
	return _.each(astNode.declarations, markRHSConstant); 
    }	       
 
    if(astNode.right) {
	markRHSConstant(astNode.right); 
    }
}

module.exports = {
    inferTypes: inferTypes    
};
