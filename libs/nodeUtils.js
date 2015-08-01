var _ = require('underscore');

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
    for(var member in withThis) {
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
    return astNode.__root = getRoot(astNode.parent); 
}

function getChildren(astNode) {    
    switch(astNode.type) {
        case 'FunctionDeclaration':
            var lst; 
            if(astNode.body.length !== undefined)
                lst = astNode.body
            else 
                lst = [astNode.body]; 
            lst = lst.concat([astNode.id]); 
            if(astNode.params)
                return lst.concat(astNode.params);
            return lst;
        case 'ReturnStatement': 
        case 'UnaryExpression':
            return astNode.argument == undefined ? [] : [ astNode.argument ]; 
        case 'MemberExpression': return [ astNode.object, astNode.property ] ; 
        case 'VariableDeclaration': return astNode.declarations; 
        case 'VariableDeclarator': return [ astNode.id, astNode.init ]; 
        case 'ExpressionStatement': return [ astNode.expression ];
        case 'BinaryExpression':
        case 'AssignmentExpression': 
            return [ astNode.left, astNode.right ]; 
        case 'Property': return [ astNode.value ] ;
        case 'ArrayExpression': return astNode.elements;
        case 'CallExpression': return [astNode.callee].concat(astNode.arguments);
        case 'SequenceExpression': return astNode.expressions;        
        case 'IfStatement': 
            if(astNode.alternate)
                return [ astNode.test, astNode.consequent, astNode.alternate ];
            return [  astNode.test, astNode.consequent ];
        case 'Identifier':
        case 'Literal':    
        case 'ThisExpression':
        case '':
            return []; 
    }
    if(astNode.body && astNode.body.length !== undefined ) return astNode.body;
    else if(astNode.body) return [ astNode.body ];
    
    if(astNode.elements && astNode.elements.length !== undefined ) return astNode.elements;
    if(astNode.properties) return astNode.properties; 
    
    throw new Error("Unrecognized type defined for " + astNode.type + " -- " + astNode.toString() );             
    return []; 
}

function getAllDescendants(ast) {
    try {
        return _.reduce( getChildren(ast), function(rtn, node) { return rtn.concat( getAllDescendants(node) ); }, [ ast ] ); 
    } catch(e) {    
        console.log(ast);
        throw new Error(e.toString() + "\n from: " + ast.type + " -- " + ast.toString()); 
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
        return node.type == 'Identifier' && node.name == id; 
    });
}

function getDataTypeForId(rootNode, id) {
    var typedNode = _.find(getNodesWithIdInScope(rootNode, id), function(n) { return n.dataType !== undefined; });
    if(typedNode === undefined) {
        var atLeast = _.chain(getNodesWithIdInScope(rootNode, id)).filter(function(n) { return n.dataTypeAtLeast; })
                                                               .map(function(n) { return n.dataTypeAtLeast; })
                                                               .max().value();
        if(atLeast > 0) {
            return "vec" + (atLeast+1);
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

module.exports = {
    getAllNodes: getAllNodes,
    getChildren: getChildren,
    getDataType: getDataType,
    getNodesWithIdInScope: getNodesWithIdInScope,
    getDataTypeForId: getDataTypeForId,
    linkParents: linkParents,
    hasType: hasType,
    getAllDescendants: getAllDescendants
}