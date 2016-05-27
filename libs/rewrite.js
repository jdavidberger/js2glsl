var esprima = require('esprima');
var _ = require('underscore');
var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var LOG = nodeUtils.LOG;

var temporaryIndexName = 0;
function getTemporaryVarName() {
    return "_js2glsl_var_" + (temporaryIndexName++);
}
function fixMatrixIndices(astNode) {
    var objDataType = nodeUtils.getDataTypeForId(astNode, astNode.object.name);
    var matDim = parseInt(objDataType.slice(3));
    var secondProperty, firstProperty;
    var rtn = "";
    if(astNode.property.type == "Literal") {
	var idx = astNode.property.value;
	var firstIdx =  idx % matDim;
	var secondIdx = Math.floor(idx / matDim);
	firstProperty = {
		type: 'Literal',
		value: firstIdx,
		raw: "" + firstIdx
	};
	secondProperty = {
	    type: 'Literal',
	    value: secondIdx,
	    raw: "" + secondIdx
	};

    } else {
	var idxVar = rewrite(astNode.property);
	var secondIdxVar = [ idxVar, " / ", matDim ].join("");
	var firstIdxVar = [ idxVar, " - (", matDim, " * (", secondIdxVar, "))"].join("");

	firstProperty = esprima.parse(firstIdxVar).body[0].expression;
	secondProperty = esprima.parse(secondIdxVar).body[0].expression;
    }

    var oldObj = astNode.object;
    astNode.object = {
	parent: astNode,
	type: 'MemberExpression',
	computed: true,
	object: oldObj,
	property: secondProperty
    };
    oldObj.parent = astNode.object;
    astNode.property = firstProperty;
    return rtn;
}

function rewrite(astNode, tabs) {
    function handleChildren(delim) {
        return _.map(nodeUtils.getChildren(astNode), function(c) { return rewrite(c, tabs + 1); } ).join(delim);
    }
    function handleBody() {
        return [tabString + "{", handleChildren("\n"), tabString + "}" ].join("\n");
    }

    if(tabs === undefined)
        tabs = 0;

    var tabString = " ".repeat(tabs * 8);
    try {
        if(astNode.left !== undefined && astNode.right !== undefined && astNode.operator !== undefined) {
	    var operator = astNode.operator;

	    if(operator == "%")
		    return "mod("+rewrite(astNode.left) + ", " + rewrite(astNode.right) + ")";

	    if(operator.length === 3)
		operator = operator.slice(0, 2);
	    var useParans = operator != '=';
	    var statement = rewrite(astNode.left) + " " + operator + " " + rewrite(astNode.right);
	    if(useParans)
		statement = "(" + statement + ")";
	    return statement;
        }

        switch(astNode.type) {
        case 'ThisExpression': return 'this';
        case 'Program': return handleChildren("\n");
        case 'BlockStatement': return handleBody();
        case 'ReturnStatement':
            if(astNode.argument)
                return tabString + "return " + rewrite(astNode.argument) + ";";
            return tabString + "return;";
        case 'MemberExpression':
            if(astNode.computed) {
		var prepend = "";
		var objDataType = astNode.object.name && nodeUtils.getDataTypeForId(astNode, astNode.object.name);
		var propertyDataType = nodeUtils.getDataType(astNode);
		var parentIsComputedMember = astNode.parent && astNode.parent.type == "MemberExpression" && astNode.parent.computed;
		if(objDataType && objDataType.indexOf("mat") === 0 &&
		   propertyDataType.indexOf("float") === 0 && !parentIsComputedMember) {
		    prepend = fixMatrixIndices(astNode);
		}
                return prepend + rewrite(astNode.object) + "[" + rewrite(astNode.property) + "]";
	    }
            return rewrite(astNode.object) + "." + rewrite(astNode.property) ;
        case 'VariableDeclaration':
            return tabString + handleChildren('\n');
        case 'VariableDeclarator':
            return (astNode.id.isConst ? "const " : "") + nodeUtils.getDataType(astNode.id) + " " + rewrite(astNode.id) +
                (astNode.init ? (" = " + rewrite(astNode.init)) : "") + ";";
	case 'ForStatement':
	    return 'for(' + rewrite(astNode.init) + rewrite(astNode.test) + ";" + rewrite(astNode.update) + ") { " + rewrite(astNode.body) + "; }";
	case 'UpdateExpression':
	    return rewrite(astNode.argument) + astNode.operator;
        case 'FunctionDeclaration':
            return (astNode.id.dataType ? astNode.id.dataType : "void") + " " +
                astNode.id.name + "(" +
                astNode.params.map(function(p) { return (p.isOutParam ? "inout " : "") + p.dataType + " " + p.name; }).join(", ") + ")" +
                rewrite(astNode.body);
        case 'ExpressionStatement':
            return tabString + rewrite(astNode.expression) + ";";
        case 'AssignmentExpression':
            return rewrite(astNode.left) + " = " + rewrite(astNode.right);
        case 'ArrayExpression': return "vec" + astNode.elements.length +  "(" + handleChildren(', ') + ")";
        case 'CallExpression':
            return rewrite( astNode.callee ) + "(" + _.map(astNode.arguments, rewrite).join(', ') + ")";
        case 'Identifier':
            return astNode.name;
        case 'SequenceExpression':
            return handleChildren(";\n");
        case 'ConditionalExpression':
            return rewrite(astNode.test) + " ? " + rewrite(astNode.consequent) + " : " + rewrite(astNode.alternate);
        case 'IfStatement':
            return [ tabString + "if(" + rewrite(astNode.test) + ") ",
                     rewrite(astNode.consequent, tabs + 1),
                     astNode.alternate ? rewrite(astNode.alternate, tabs + 1) : "" ].join("\n");
        case 'Literal':
            var appendPeriod = /^[0-9]*$/.exec(astNode.value);
            if(appendPeriod && astNode.dataType && astNode.dataType.replace("/*?*/","") == 'float')
                return astNode.value + ".";
            return astNode.value;
        case 'UnaryExpression':
            return "(" + astNode.operator + "(" + rewrite(astNode.argument) + ") )";
        case 'rawSource':
            return astNode.src;
        case '':
        case 'ObjectExpression':
        case 'EmptyStatement':
            return "";
        default:
            throw new Error("Cant rewrite type defined for " + astNode.type + " -- " + astNode.toString() );
        }
    } catch(e) {
        LOG(astNode);
        throw e;
    }
}

function rewriteFunctionAs(functionAst, newName) {
    var returnType = "void";
    if(functionAst.id.dataType !== undefined)
        returnType = functionAst.id.dataType;
    return [
        returnType + " " + newName + " ()",
        _.map( [functionAst.body], rewrite).join("\n"),
        ].join('\n');
}
function removeMemberRoot(ast, idNode, prefix) {
    if(idNode === undefined)
        return;
    if(prefix === undefined)
        prefix = "";

    var id = idNode.name || idNode;
    _.chain(nodeUtils.getAllNodes(ast)).filter( function(node) {
        if(node.type == "MemberExpression" && ( (node.object.type == "Identifier" && node.object.name == id ) ||
                                                (node.object.type == "ThisExpression" && id == "this") )){
            node.type = node.property.type;
            node.name = prefix + node.property.name;
            node.computed = node.object = node.property = undefined;
        }
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
    var matchFunction = /(function)\s*[A-Za-z0-9_]*\s*(\([\s\S]*)/g.exec(funSrc);
    if(matchFunction) {
        return  "function " + newName + matchFunction[2];
    } else {
        return funSrc;
    }
};

rewrite.normalizeFunctionExpressions = function(allAst) {
    _.chain( nodeUtils.getAllNodes(allAst) )
     .filter( function(n) {
        return n.type == "VariableDeclarator" && n.init && n.init.type == "FunctionExpression";
     })
     .each( function(n) {
        var p = n;
        while(p !== undefined && p.body === undefined) {
            p = p.parent;
        }
        p.body.push( {
             "type": "FunctionDeclaration",
            "id": n.id,
            "params": n.init.params,
            "defaults": n.init.defaults,
            "body": n.init.body
        });
        n.type = '';
        n.id = n.init = null;
     });

    _.chain( nodeUtils.getAllNodes(allAst) )
     .each( function(n) {
        if ((n.type == "AssignmentExpression" && n.right && n.right.type == "FunctionExpression") === false) {
            return;
        }
        var oldVarNode = _.chain( nodeUtils.getNodesWithIdInScope(n, n.left.name) )
         .map(function (n) { return n.parent; })
         .find( function(n) {
            return n.type == "VariableDeclarator";
         }).value();

         if(oldVarNode)
            oldVarNode.type = "";

        var p = n;
        while(p !== undefined && p.body === undefined) {
            p = p.parent;
        }
        p.body.push( {
             "type": "FunctionDeclaration",
            "id": n.left,
            "params": n.right.params,
            "defaults": n.right.defaults,
            "body": n.right.body
        });
        n.type = '';
        n.id = n.right = n.left = null;
     });


     nodeUtils.linkParents(allAst);
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
            return node.name !== undefined && node.name.indexOf(prefix) === 0;
        }).each(function(node) {
            var newName = node.name.slice( prefix.length );
            node.name = newName;
        });
};

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
};

module.exports = rewrite;
