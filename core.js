var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./libs/nodeUtils');
var knownFunctions = require('./libs/knownFunctions');
var rewrite = require('./libs/rewrite'); 
var typeInference = require('./libs/typeInference'); 
var LOG = nodeUtils.LOG;
var glmatrixStdLib = require('./libs/glmatrixStdLib');

function gatherObjectProperties(ast, idNode) {
    if(idNode === undefined)
        return []; 
    
    var id = idNode.name || idNode; 
    var nodes = nodeUtils.getAllNodes(ast);
    
    return _.chain(nodes)
            .filter(function(node) {
                return node.type == "MemberExpression" && node.object.name == id; 
            })
            .map(function(node) {
                return node.property.name; 
            }).uniq().value();
}
function generateFields(rootNode, fieldType, obj, prefix) {
    if(prefix === undefined)
        prefix = "";
        
    return _.map(obj, function(name) {
        var type = nodeUtils.getDataTypeForId(rootNode, prefix + name); 
        if(type === undefined)
            type = "float";
        return fieldType + " " + type + " " + prefix + name + ";";
    }).join('\n').trim();
};

function replaceAllIds(ast, oldName, newName) {
    _.chain(nodeUtils.getAllNodes(ast)).filter(function( node ) {
            return node.type == "Identifier" && node.name == oldName; 
        }).each(function(node) {
            node.name = newName; 
        });
}
function expandObjectExpression(ast, node, name){
    switch(node.type) {
        case 'AssignmentExpression':
            node.type = 'SequenceExpression';
            node.operator = undefined;
            node.expressions = _.map(node.right.properties, function(property) {
                return {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: {
                        "type": "MemberExpression",
                        "computed": false,
                        "object": {
                            "type": "Identifier",
                            "name": name
                        },
                        "property": property.key
                    },
                    right: property.value
                };
            }); 
            node.right = undefined;
            node.left = undefined;
            break;
        case 'VariableDeclarator':
            node.type = ''; 
             _.each(node.init.properties, function(property) {             
                node.parent.declarations.push({
                    type: 'VariableDeclarator',
                    operator: '=',
                    id: property.key,      
                    init: property.value
                });
            }); 
            break;
    }
}
function deobjectify(ast, name) {
    var change = true; 
    var cnodes = _.chain(nodeUtils.getAllNodes(ast));    
    function handleAssignments(node, left, right) {
        if(left.type != 'Identifier' || left.name != name) 
            return false; 
                    
        switch(right.type) {
            case 'Identifier':
                node.type = ''; 
                replaceAllIds(ast, right.name, name); 
                break;
            case 'ObjectExpression':
                expandObjectExpression(ast, node, name); 
                break;
            default:
                throw new Error(name + " is assigned a " + right.type + ". It must be an object.");                            
        }        
        return true; 
    }; 
    
    while(change) {
        change = false; 
        cnodes.each(function(node) {
            switch(node.type) {
                case 'VariableDeclarator':
                    change |= handleAssignments(node, node.id, node.init); 
                    break;
                case 'AssignmentExpression':
                    change |= handleAssignments(node, node.left, node.right); 
                    break;
            }
        });
    }
};

function deModularize(ast) {
    if( ast.type == "Program") {
            for(var i = 0;i < ast.body.length;i++) {
                if(ast.body[i].type == "ExpressionStatement" &&
                    ast.body[i].expression.type == "CallExpression" &&
                    ast.body[i].expression.callee.type == "MemberExpression" &&
                    ast.body[i].expression.callee.object.type == "FunctionExpression" &&
                    ast.body[i].expression.arguments.length == 1 &&
                    ast.body[i].expression.arguments[0].type == "ThisExpression") {
                ast.body[i] = ast.body[i].expression.callee.object.body; 
            }
        }
    }
}

    
function getUsedFunctions(node, alreadySeen) {
    if(node === undefined)
	return [];
    return _.chain(nodeUtils.getAllDescendants(node)).filter(function (n) {
        return n.type == "CallExpression"; 
    }).map(function(n) {
        return rewrite(n.callee);
    }).value(); 
};

function renameFunctionCallSites(node, oldName, newName) {
    if(node === undefined)
	return;

    _.chain(nodeUtils.getAllDescendants(node)).filter(function (n) {
        return n.type == "CallExpression" && rewrite(n.callee) == oldName; 
    }).each(function(n) {
	n.callee = {
	    parent: n,
	    type: 'Identifier',
	    name: newName
	};
    });
}

var stdlib = _.extend({}, glmatrixStdLib); 

function addFunctionAndCallees(allAst, obj, funcName) {
    if(allAst.children[funcName])
	return;
    if(typeof obj[funcName] != 'function')
	return; 

    function addFunction(fn, funcName) {
	var funcName = funcName || fn.name; 
	var parseTree = typeof fn == 'function' ? 
	    esprima.parse( rewrite.normalizeFunctionDeclaration(fn.toString(),funcName)) :
	    fn;

	parseTree = parseTree.body[0]; // Strip off program root
	allAst.children[funcName] = parseTree;
	allAst.body.push(parseTree);
	return parseTree;
    }

    var parseTree = addFunction(obj[funcName], funcName);
    var functions = getUsedFunctions(parseTree); 
    functions.forEach(function(n) { 	
	if(n.indexOf("this.") == 0) {
	    n = n.slice("this.".length); 
	    addFunctionAndCallees(allAst, obj, n); 
	} else if(stdlib[n]){
	    var name = n.replace(".", "_"); 
	    for(var i = 0;i < stdlib[n].length;i++)
		addFunction(stdlib[n][i], name);
	    renameFunctionCallSites(allAst, n, name);
	}	
    });
}

function getSource(allAst) {
    if(typeof(allAst ) == 'string') {        
        return getSource(esprima.parse(allAst)); 
    } else if(typeof(allAst) == "object" && allAst.type != "Program") {
            var obj = allAst;
            allAst = { body: [], children: {} };

	addFunctionAndCallees(allAst, obj, 'VertexPosition');
	addFunctionAndCallees(allAst, obj, 'FragmentColor');
	addFunctionAndCallees(allAst, obj, 'PointSize');

        // Remove 'this.' expressions
        rewrite.removeMemberRoot(allAst, "this");           
    }
   
    deModularize(allAst); 
    nodeUtils.linkParents(allAst); 

    rewrite.normalizeFunctionExpressions(allAst);    
    
   var varyingsTempName = "1_varyings";
   
    var glPositionAst = nodeUtils.getFunctionByName(allAst, "VertexPosition");
    var glColorAst    = nodeUtils.getFunctionByName(allAst, "FragmentColor");    

    glPositionAst.params = [];
    glColorAst.params = [];
    
    if(glPositionAst === undefined)
        throw new Error("Could not find a definition for 'VertexPosition'; this is a required function."); 
    if(glColorAst === undefined)
        throw new Error("Could not find a definition for 'FragmentColor'; this is a required function.");             
    
    var attributes = gatherObjectProperties(allAst, "attributes");    
    var varyings   = gatherObjectProperties(allAst, "varyings");         
    var uniforms   = gatherObjectProperties(allAst, "uniforms");

    rewrite.removeMemberRoot(allAst, "attributes", "attributes_");
    rewrite.removeMemberRoot(allAst, "varyings",   "varyings_");
    rewrite.removeMemberRoot(allAst, "uniforms",   "uniforms_");

    _.chain(nodeUtils.getAllNodes(allAst)).filter(nodeUtils.hasType("VariableDeclarator"))
        .each(function(node) {
            rewrite.addIdPrefix(node.id, "_local"); 
        }); 
    
    rewrite.removeIdPrefix(allAst, "attributes_");    
    rewrite.removeIdPrefix(allAst, "uniforms_");    
               
    glPositionAst.id.dataTypeHint = "vec4";
    glColorAst.id.dataTypeHint = "vec4";
    typeInference.inferTypes(allAst); 
    
   // The color ast is allowed to return nothing and this means we do a discard. 
    _.chain(nodeUtils.getAllNodes(glColorAst))
     .filter(function(node) {        
        return node.type == "ReturnStatement" && node.argument == null; 
     }).each(function(node) {
        var targetDatatype = glColorAst.id.dataType; 
        var returnLength  = /vec([0-9]*)/.exec(targetDatatype)[1];
        
        node.type = "BlockStatement";
        node.body = [
                            {
                                "type": "ExpressionStatement",
                                "expression": {
                                    "type": "Identifier",
                                    "name": "discard"
                                }
                            },
                            {
                                "type": "ReturnStatement",
                                "argument": {
                                    "type": "ArrayExpression",
                                    "elements": _.map(_.range(returnLength), function () { 
                                        return {
                                            "type": "Literal",
                                            "value": 0,
                                            "raw": "0"
                                        };
                                    }) 
                                }
                            }
                    ];
            node.argument = undefined;            
     });
    
    knownFunctions.remap(allAst, this);    
    
    var positionLength  = /vec([0-9]*)/.exec(glPositionAst.id.dataType)[1];
    var positionLine = "\tgl_Position = VertexPosition(); ";
    if(positionLength != 4) {
        positionLine = "\tgl_Position = vec4(VertexPosition() " + 
                        _.range(positionLength, 3).map(function() { return ",0.0"; }).join(" ") + 
                        ", 1.0);"; 
    }   
    
    var colorLength  = /vec([0-9]*)/.exec(glColorAst.id.dataType)[1];
    var colorLine = "\tgl_FragColor = FragmentColor(); ";
    if(colorLength != 4) {
        colorLine = "\tgl_FragColor = vec4(FragmentColor() " + 
                        _.range(colorLength, 3).map(function() { return ",0.0"; }).join(" ") + 
                        ", 1.0);"; 
    }   
    
    var glPointSizeAst = getFunctionByName('PointSize')[0];
    var pointSizeLine = "";
    if(glPointSizeAst) {
	pointSizeLine = "\tgl_PointSize = PointSize();";
    }

    function getFunctionByName(name) {
        return _.filter(nodeUtils.getAllNodes(allAst), function(n) { return n.type == "FunctionDeclaration" && n.id.name == name; });
    }
    
    function getUsedFunctions(node, alreadySeen) {
	if(node === undefined)
	    return [];

        alreadySeen = alreadySeen || {};
        alreadySeen[node.id.name] = 1; 
        var callNames = _.chain(nodeUtils.getAllDescendants(node)).filter(function (n) {
            return n.type == "CallExpression"; 
        }).map(function(n) {
            return n.callee.name; 
        }).value();

        var rtn = [ node ]; 
        for(var i = 0;i < callNames.length;i++) {
            var callName = callNames[i];
            if(!alreadySeen[callName]) {
                var foundFunctions =  getFunctionByName(callName);
                if(foundFunctions) {
		    for(var j = 0;j < foundFunctions.length;j++)
			rtn = getUsedFunctions(foundFunctions[j], alreadySeen ).concat(rtn);
                } 
            }
        }
        return rtn;
    };
        
    var usedFunctions = 
	getUsedFunctions(glPositionAst)
	.concat(getUsedFunctions(glColorAst)); 

    // Gather all used names in the program
    var usedNames = {};    
    _.each(nodeUtils.getAllNodes(allAst), function(node) {
	if(node.id) {
	    usedNames[node.id] = true; 
	}
    });

    // Strip out _local from variables that don't strictly need it
    _.each(usedFunctions, function(func) {
	var variableDecls = nodeUtils.getAllNodes(func).filter(nodeUtils.hasType("VariableDeclarator"));
	var prefix = "_local";
	_.each(variableDecls, function(decl) {
	    if(decl.id.name.indexOf(prefix) == 0){
		var newName = decl.id.name.slice(prefix.length);
		if(usedNames[newName] === undefined) {
		    var sites = nodeUtils.getNodesWithIdInScope(func, decl.id);
		    _.each(sites, function(n) {
			n.name = newName;
		    }); 
		}
	    }
	});
    });
    
    // Make sure that if any of the used functions have an error; we throw the exception here. 
    usedFunctions
	.forEach( function(node) {
            nodeUtils.getAllDescendants(node).forEach(function(node) {
		if(node.error)
                    throw node.error;
            });
	}); 
    
    var vertex = [
        "precision mediump float;",        
        "",
        generateFields(allAst, "attribute", attributes).trim(),
        generateFields(allAst, "varying", varyings, "varyings_").trim(),
        generateFields(allAst, "uniform", uniforms).trim(),
        "",
        _.uniq(getUsedFunctions(glPositionAst).concat(getUsedFunctions(glPointSizeAst))).map(rewrite).join("\n"),                      
        "void main() {",        
        positionLine,
	pointSizeLine,
        "}", 
      ].join('\n'); 

    var fragment = [
         "precision mediump float;",     
         "",
        generateFields(allAst, "varying", varyings, "varyings_").trim(),
        generateFields(allAst, "uniform", uniforms).trim(),
        "",
        _.uniq(getUsedFunctions(glColorAst)).map(rewrite).join("\n"),       
        "",
         "void main() {",    
         colorLine,
         "}"    
    ].join('\n'); 

    LOG(vertex, fragment);
    return {
        vertex: vertex,
        fragment: fragment
    };        
};

module.exports = getSource;
