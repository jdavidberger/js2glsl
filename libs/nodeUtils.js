var _ = require('underscore');

// var LOG = function() {}
var LOG = console.log.bind(console);

/**
    Set the data type for a give node. 
    
    This will throw an error if the inferred type contradicts an already set type. 
    
    @param node node to assign
    @param dataType type to assign
    @param singleNode whether to only apply to the given node, or to also assign to all equivalent id'd nodes in scope. (Used internally)
    @return A list of every node that had its dataType set due to this operation.     
*/
function setDataType(node, dataType, singleNode) {    
    var rewrite = require('./rewrite'); 	    

    // Remove the 'guess' annotation
    function rawType(dt) {
        return dt.replace("/*?*/","");
    }
    
    // If the node already has a dataType, we are just checking for equivalence
    if(node.dataType) {
        if(rawType(node.dataType) != rawType(dataType)) {  
            throw new Error("Type inference failed for '" + rewrite(node) + "'. Resolved as both " + node.dataType + " and now " + dataType);
        }
        
        // MUST RETURN EMPTY or we could loop forever
        return []; 
    } else {        
        if(node.name && !singleNode) {
            // This recursive invocation is _probably_ (certainly?) redundant, but we do it anyway to rerun the inference check. 
            _.each(getNodesWithIdInScope(node, node.name), function(node) {
                setDataType(node, dataType, true);
            });
            return getNodesWithIdInScope(node, node.name);
        } else {
            node.dataType = dataType;
            return [node];
        }        
    }
}

/** 
    Makes nodeA and nodeB share a type. 
    @return Any and all changed nodes @seealso setDataType
*/
function syncDataType(nodeA, nodeB, msg) {
    var changed = []; 
    if(nodeA.dataType !== undefined) {
        changed = setDataType(nodeB, nodeA.dataType);
    }
    if(nodeB.dataType !== undefined && changed.length === 0) {
        changed = setDataType(nodeA, nodeB.dataType);
    }
    msg = msg || "<unmarked reason>"; 
    if(changed.length){
	var rewrite = require('./rewrite'); 
	LOG("Syncing " + rewrite(nodeA) + " <-> " + rewrite(nodeB) + " to " + nodeA.dataType + " for " + msg);
    }
    return changed; 
}


function linkParents(ast) {    
    _.each(getChildren(ast), function(child) {        
        child.parent = ast; 
        linkParents(child); 
    }); 
}

function replaceNode(replaceThis, withThis) {
    var temp = {};
    for(var member in replaceThis) {
        temp[member] = replaceThis[member]; 
        replaceThis[member] = undefined; 
    }
    for(member in withThis) {
        replaceThis[member] = withThis[member]; 
    }    
    linkParents(replaceThis); 
    return temp; 
}

function getRoot(astNode) {
    if(astNode.__root !== undefined)
        return astNode.__root;
        
    if(astNode.parent === undefined)
        return astNode;
    astNode.__root = getRoot(astNode.parent); 
    return astNode.__root; 
}

function getChildren(astNode) {    
    switch(astNode.type) {
	case 'ForStatement':
	return [astNode.init, astNode.test, astNode.update, astNode.body];
	case 'UpdateExpression':
	return [astNode.argument]; 
        case 'FunctionDeclaration':
            var lst; 
            if(astNode.body.length !== undefined)
                lst = astNode.body;
            else 
                lst = [astNode.body]; 
            lst = lst.concat([astNode.id]); 
            if(astNode.params)
                return lst.concat(astNode.params);
            return lst;
        case 'ReturnStatement': 
        case 'UnaryExpression':        
            return astNode.argument === undefined ? [] : [ astNode.argument ]; 
        case 'MemberExpression': return [ astNode.object, astNode.property ] ; 
        case 'VariableDeclaration': return astNode.declarations; 
        case 'VariableDeclarator': 
            var rtn = [ astNode.id ];
            if(astNode.init)
                rtn.push(astNode.init);
            return rtn;
        case 'ExpressionStatement': return [ astNode.expression ];
        case 'BinaryExpression':
        case 'AssignmentExpression': 
        case 'LogicalExpression':        
            return [ astNode.left, astNode.right ]; 
        case 'Property': return [ astNode.value ] ;
        case 'ArrayExpression': return astNode.elements;
        case 'CallExpression': return [astNode.callee].concat(astNode.arguments);
        case 'SequenceExpression': return astNode.expressions;        
        case 'ConditionalExpression': 
        case 'IfStatement': 
            if(astNode.alternate)
                return [ astNode.test, astNode.consequent, astNode.alternate ];
            return [  astNode.test, astNode.consequent ];
        case 'Identifier':
        case 'Literal':    
        case 'ThisExpression':
        case '':
    case 'rawSource':
        case 'EmptyStatement':
            return []; 
    }
    if(astNode.body && astNode.body.length !== undefined ) return astNode.body;
    else if(astNode.body) return [ astNode.body ];
    
    if(astNode.elements && astNode.elements.length !== undefined ) return astNode.elements;
    if(astNode.properties) return astNode.properties; 
    
    throw new Error("Unrecognized type defined for " + astNode.type + " -- " + astNode.toString() );             
}

function getAllDescendants(ast) {
    try {
        return _.reduce( getChildren(ast), function(rtn, node) { return rtn.concat( getAllDescendants(node) ); }, [ ast ] ); 
    } catch(e) {    
	if(ast && ast.type && ast.toString)
            throw new Error(e.toString() + "\n from: " + ast.type + " -- " + ast.toString()); 
	throw new Error(e.toString() + "\n from unexpected: " + (ast)); 
    }
}

function getAllNodes(ast) {
    return getAllDescendants( getRoot(ast) ); 
}

function getDataType(astNode) {
    if(astNode.dataType)
        return astNode.dataType;
    return "float/*?*/"; 
}

function getIdScope(astNode, id, currentNode) {
    id = id.name || id;  
    currentNode = currentNode || astNode;    
    if(currentNode.type == 'FunctionDeclaration') {
        var rtn = _.find(currentNode.params, function(param) {
            return id == param.name;
        });        
        if(rtn !== undefined) {
            return currentNode; 
        }        
    } 
    
    var children = getChildren(currentNode);
    for(var i = 0;i < children.length && currentNode.body ;i++) {
        if(children[i].type == 'VariableDeclaration') {
            var declarators = getChildren(children[i]);
            for(var j = 0;j < declarators.length;j++) {
                if(declarators[j].id.name == id) {
                    return currentNode; 
                }
            }
        }
    }

    if(currentNode.parent === undefined)
        return undefined;
        
    return getIdScope(astNode, id, currentNode.parent); 
}

/**
    Searches up for nodes in scope 
*/
function getNodesWithIdInScope(astNode, id) {
    id = id.name || id;  
    var scope = getIdScope(astNode, id); 
    if(scope === undefined) { // undefined is global
        scope = getRoot(astNode); 
    }
    return _.filter( getAllDescendants(scope), function(node) {
	var isDerivativeId =
	    node.parent !== undefined &&
	    node.parent.type == "MemberExpression" && 
	    node.parent.property == node &&
	    node.parent.computed == false; 
	
        return node.type == 'Identifier' && 
	    node.name == id && isDerivativeId == false;
    });
}

function getDataTypeForId(rootNode, id) {
    var typedNode = _.find(getNodesWithIdInScope(rootNode, id), function(n) { return n.dataType !== undefined; });
    if(typedNode === undefined) {
        var atLeast = _.chain(getNodesWithIdInScope(rootNode, id)).filter(function(n) { return n.dataTypeAtLeast; })
                                                               .map(function(n) { return n.dataTypeAtLeast; })
                                                               .max().value();
        if(atLeast > 0 && atLeast < 4) {
            return "vec" + (atLeast+1);
        } else if(atLeast > 0 && atLeast <= 16) {
	    return "mat" + Math.sqrt(atLeast+1); 
	}
        return "float/*?*/";
    }
    return typedNode.dataType;
};

function hasType(type) {
    return function(node) {
        return node.type == type;
    };
}

function getFunctionByName(allAst, name) {
    return _.find(getAllNodes(allAst), function(n) { 
                            return (n.type == "FunctionDeclaration" && n.id.name == name) || 
                                   (n.type == "AssignmentExpression" && n.left.name == name && n.right.type == "FunctionExpression") ||
                                   (n.type == "VariableDeclarator" && n.id.name == name && n.init);
                            });
}

function isLHV(node) {
    switch(node.type) {
    case 'Identifier': 
	return true; 
    case 'MemberExpression':
	return isRHV(node.property);
    }
    return false; 
}

function getStatementPosition(astNode, statement) {
    if(astNode) {
	if(astNode.body) {
	    for(var i = 0;i < astNode.body.length;i++) {
		if(astNode.body[i] == statement) {
		    return [astNode, i];
		}
	    }
	    return;
	}
	return getStatementPosition(astNode.parent, astNode);
    }
}

function insertBefore(astNode, source) {
    var blockAndIdx = getStatementPosition(astNode.parent, astNode);
    if(source.length === undefined)
	source = [ source ];
    var newParent = blockAndIdx[0];
    var newIdx = blockAndIdx[1];
    var args = [ newIdx, 0].concat(source); 
    newParent.body.splice.apply(newParent.body, args);
}

module.exports = {
    getAllNodes: getAllNodes,
    getChildren: getChildren,
    getDataType: getDataType,
    getNodesWithIdInScope: getNodesWithIdInScope,
    getDataTypeForId: getDataTypeForId,
    linkParents: linkParents,
    hasType: hasType,
    getAllDescendants: getAllDescendants,
    getFunctionByName: getFunctionByName,
    setDataType: setDataType,
    syncDataType: syncDataType,
    isLHV: isLHV,
    LOG: LOG,
    insertBefore: insertBefore
}
