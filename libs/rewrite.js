var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');

function rewrite(astNode) {
    try {
        function handleChildren(delim) {
            return _.map(nodeUtils.getChildren(astNode), rewrite).join(delim); 
        };
        function handleBody() {
            return ["{", handleChildren("\n"), "}" ].join("\n"); 
        };
        switch(astNode.type) {
            case 'FunctionDeclaration':                 
                return (astNode.id.dataType ? astNode.id.dataType : "void") + " " + 
                    astNode.id.name + "(" + 
                        astNode.params.map(function(p) { return p.dataType + " " + p.name; }).join(",") + ")" + 
                            rewrite(astNode.body); 
            case 'Program': return handleChildren("\n"); 
            case 'BlockStatement': return handleBody(); 
            case 'ReturnStatement': 
                if(astNode.argument)
                    return "return " + rewrite(astNode.argument) + ";"; 
                return "return;";
            case 'MemberExpression': 
                if(astNode.computed)
                    return rewrite(astNode.object) + "[" + rewrite(astNode.property) + "]"; 
                return rewrite(astNode.object) + "." + rewrite(astNode.property) ; 
            case 'VariableDeclaration': return handleChildren('\n'); 
            case 'VariableDeclarator':                 
                return nodeUtils.getDataType(astNode.id) + " " + rewrite(astNode.id) + "=" + rewrite(astNode.init) + ";"; 
            case 'ExpressionStatement': return rewrite(astNode.expression) + ";";
            case 'AssignmentExpression':                 
                return rewrite(astNode.left) + "=" + rewrite(astNode.right);             
            case 'ArrayExpression': return "vec" + astNode.elements.length +  "(" + handleChildren(',') + ")"; 
            case 'CallExpression':
                return rewrite( astNode.callee ) + "(" + _.map(astNode.arguments, rewrite).join(', ') + ")"; 
            case 'BinaryExpression':
                return "(" + rewrite(astNode.left) + " " + astNode.operator + " " + rewrite(astNode.right) + ")";
            case 'Identifier':
                return astNode.name; 
            case 'SequenceExpression': 
                return handleChildren(";\n");
            case 'IfStatement': 
                return [ "if(" + rewrite(astNode.test) + ")",
                         rewrite(astNode.consequent), 
                         astNode.alternate ? rewrite(astNode.alternate) : "" ].join("\n");
            case 'Literal':
                var appendPeriod = /^[0-9]*$/.exec(astNode.value);
                if(appendPeriod && astNode.dataType && astNode.dataType.replace("/*?*/","") == 'float')
                    return astNode.value + ".";
                return astNode.value;
            case 'UnaryExpression':
                return astNode.operator + rewrite(astNode.argument);
            case '':
                return ""; 
            default:
                throw new Error("Cant rewrite type defined for " + astNode.type + " -- " + astNode.toString() );             
        }
    } catch(e) {
        console.log(astNode);
        throw e;         
    }
};
function rewriteFunctionAs(functionAst, newName) {
    var returnType = "void";
    if(functionAst.id.dataType !== undefined)
        returnType = functionAst.id.dataType;
    return [
        returnType + " " + newName + " ()",
        _.map( [functionAst.body], rewrite).join("\n"),         
        ].join('\n');     
};
function removeMemberRoot(ast, idNode, prefix) {
    if(idNode === undefined)
        return; 
    if(prefix === undefined)
        prefix = "";
    
    var id = idNode.name || idNode;     
    _.chain(nodeUtils.getAllNodes(ast)).filter( function(node) {
        return node.type == "MemberExpression" && ( (node.object.type == "Identifier" && node.object.name == id ) ||
                                                    (node.object.type == "ThisExpression" && id == "this") );
    }).each(function(node) {
        node.type = node.property.type; 
        node.name = prefix + node.property.name; 
        node.computed = node.object = node.property = undefined; 
    }); 
}

/**
    There are essentially two forms you fill get from doing toString on a function:
        - function fun() {}
        - function() {}
        
    the second one doesn't parse, so we turn it into the first one. 
*/
rewrite.normalizeFunctionDeclaration = function(funSrc, newName) {
    newName = newName || "_fun";
    var matchFunction = /(function)\W*(\([\s\S]*)/g.exec(funSrc);
    if(matchFunction) {
        return matchFunction[1] + " " + newName + matchFunction[2]; 
    } else {
        return funSrc;
    }
}; 
rewrite.addIdPrefix = function(node, prefix) {
    _.chain(nodeUtils.getNodesWithIdInScope(node, node))
        .each(function(node) {
            node.name = prefix + node.name;
        });
}; 
rewrite.removeIdPrefix = function(node, prefix) {    
    _.chain(nodeUtils.getAllNodes(node))
        .filter(function(node) {
            return node.name !== undefined && node.name.indexOf(prefix) == 0; 
        }).each(function(node) {
            var newName = node.name.slice( prefix.length );
            node.name = newName;
        });
}

rewrite.rewriteFunctionAs = rewriteFunctionAs;
rewrite.removeMemberRoot = removeMemberRoot;
rewrite.retargetReturns = function (ast, declarationName) {   
    return _.chain(nodeUtils.getAllNodes(ast))
    .filter(function(node) {
        return node.type == "ReturnStatement"; 
    })
    .each(function(node) {
        node.type = "ExpressionStatement";
        
        node.expression = 
            {
                "type": "AssignmentExpression",
                operator: "=",
                "left": {
                    "type": "Identifier",
                    "name": declarationName
                },
                "right": node.argument,
                parent: node
            };
        node.argument = undefined; 
    }).length;
}

module.exports = rewrite;