var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./libs/nodeUtils');
var knownFunctions = require('./libs/knownFunctions');
var rewrite = require('./libs/rewrite'); 
var typeInference = require('./libs/typeInference'); 


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
                //ast.body = ast.body.concat(ast.body[i].expression.callee.object.body); 
            }
        }
    }
}

function getSource(allAst, KnownFunctionSources) {
    if(typeof(allAst ) == 'string') {        
        return getSource(esprima.parse(allAst)); 
    } else if(typeof(allAst) == "object" && allAst.type != "Program") {
            var obj = allAst;
            allAst = { body: [] };
            for (var m in obj) {
                if (typeof obj[m] == "function" && !obj[m].exclude) {
                    allAst.body.push(esprima.parse( rewrite.normalizeFunctionDeclaration(obj[m].toString(),m)  ));
                }
            }
            // Remove 'this.' expressions
            rewrite.removeMemberRoot(allAst, "this");           
    }
    KnownFunctionSources = KnownFunctionSources || knownFunctions.knownFunctionsSource;
   
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
            rewrite.addIdPrefix(node.id, "_local_"); 
        }); 
    
    rewrite.removeIdPrefix(allAst, "attributes_");    
    rewrite.removeIdPrefix(allAst, "uniforms_");    
       
    //var glPositionAst = _.find(nodeUtils.getAllDescendants(allAst), function(n) { return n.type == "FunctionDeclaration" && n.id.name == "VertexPosition"; });
    //var glColorAst = _.find(nodeUtils.getAllDescendants(allAst), function(n) { return n.type == "FunctionDeclaration" && n.id.name == "FragmentColor"; });
        
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
                                    "type": "CallExpression",
                                    "callee": {
                                        "type": "Identifier",
                                        "name": targetDatatype
                                    },
                                    "arguments": _.map(_.range(returnLength), function () { 
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
    
    function getFunctionByName(name) {
        return _.find(nodeUtils.getAllNodes(allAst), function(n) { return n.type == "FunctionDeclaration" && n.id.name == name; });
    }
    
    function getUsedFunctions(node, alreadySeen) {
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
                var foundFunction =  getFunctionByName(callName);
                if(foundFunction) {
                    rtn = getUsedFunctions(foundFunction, alreadySeen ).concat(rtn);
                } else if(KnownFunctionSources[callName]) {
                    rtn = [{ type: 'rawSource', src: KnownFunctionSources[callName] }].concat(rtn);
                }
            }
        }
        return rtn;
    };
        
    getUsedFunctions(glPositionAst)
    .concat(getUsedFunctions(glColorAst))
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
        getUsedFunctions(glPositionAst).map(rewrite).join("\n"),                      
        "void main() {",        
        positionLine,
        "}", 
      ].join('\n'); 

    var fragment = [
         "precision mediump float;",     
         "",
        generateFields(allAst, "varying", varyings, "varyings_").trim(),
        generateFields(allAst, "uniform", uniforms).trim(),
        "",
        getUsedFunctions(glColorAst).map(rewrite).join("\n"),       
        "",
         "void main() {",    
         colorLine,
         "}"    
    ].join('\n'); 

    console.log(vertex, fragment);
    return {
        vertex: vertex,
        fragment: fragment
    };        
};

module.exports = getSource;
