var esprima = require('esprima'); 
var escodegen = require('escodegen'); 
var _ = require('underscore');

var nodeUtils = require('./nodeUtils');
var knownFunctions = require('./knownFunctions');
var rewrite = require('./rewrite'); 
var typeInference = require('./typeInference'); 

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


function ShaderSpecification(vertex, fragmentColor, varyings) {
    vertex        && (this.VertexPosition = vertex); 
    fragmentColor && (this.FragmentColor  = fragmentColor);
    varyings      && (this.CreateVaryings = varyings);    
};

ShaderSpecification.prototype.VertexPosition = function() {
    return [0,0,0,1];
}
ShaderSpecification.prototype.CreateVaryings = function() {
    return {};
}
ShaderSpecification.prototype.FragmentColor = function() {
    return [0,0,0,1];
}
ShaderSpecification.prototype.KnownFunctionSources = knownFunctions.knownFunctionsSource; 
ShaderSpecification.prototype.ShaderSource = function() {    
    console.log("Getting shader source");
    var glPosition = rewrite.normalizeFunctionDeclaration(this.VertexPosition, "VertexPosition");     
    var glColor    = rewrite.normalizeFunctionDeclaration(this.FragmentColor, "FragmentColor");
    
    var glPositionAst   = esprima.parse(glPosition.toString());
    var glColorAst      = esprima.parse(glColor.toString());
    
    var varyingsTempName = "1_varyings";
    
    var allAst = { 
        body: [ glPositionAst, glColorAst]
    };    

    var self = this;
    function getUsedThisFunctionNames(node) {
        return _.chain(nodeUtils.getAllNodes(node)).filter(function(n) { return n.type == "CallExpression" && 
                                                                         n.callee.object && n.callee.object.type == "ThisExpression"; })
                                .map(function(n) { return n.callee.property.name; })
                                .unique()                            
                                .filter(function(n) { return self[n]; })
                                .map(function (n) {
                                    var fnSrc = rewrite.normalizeFunctionDeclaration(self[n].toString(), n);     
                                    return esprima.parse(fnSrc);                                    
                                }).value(); 
    
    };
      
    var extraVertexFunctions   = getUsedThisFunctionNames(glPositionAst);
    var extraFragmentFunctions = getUsedThisFunctionNames(glColorAst);
                            
    allAst.body = allAst.body.concat(extraVertexFunctions)
                             .concat(extraFragmentFunctions); 

    nodeUtils.linkParents(allAst); 
    
    // Remove this. and replace it with this_ forms 
    rewrite.removeMemberRoot(allAst, "this", "this_");
    
    
    var attributes = gatherObjectProperties(allAst, "this_attributes");    
    var varyings   = gatherObjectProperties(allAst, "this_varyings");         
    var uniforms   = gatherObjectProperties(allAst, "this_uniforms");

    rewrite.removeMemberRoot(allAst, "this_attributes", "this_attributes_");
    rewrite.removeMemberRoot(allAst, "this_varyings",   "this_varyings_");
    rewrite.removeMemberRoot(allAst, "this_uniforms",   "this_uniforms_");

    _.chain(nodeUtils.getAllNodes(allAst)).filter(nodeUtils.hasType("VariableDeclarator"))
        .each(function(node) {
            rewrite.addIdPrefix(node.id, "_local_"); 
        }); 
    
    rewrite.removeIdPrefix(allAst, "this_attributes_");
    rewrite.removeIdPrefix(allAst, "this_uniforms_");
    rewrite.removeIdPrefix(allAst, "this_");       
    
    glPositionAst.body[0].id.dataTypeHint = "vec4";
    glColorAst.body[0].id.dataTypeHint = "vec4";
    typeInference.inferTypes(allAst); 
    
    /*
    if(glPositionAst.body[0].dataType == undefined) {
        glPositionAst.body[0].dataType = "vec4";
        console.log("Inference failed for position type. Defaulting to vec4"); 
    }
    if(glColorAst.body[0].dataType == undefined) {    
        glColorAst.body[0].dataType = "vec4";
        console.log("Inference failed for color type. Defaulting to vec4"); 
    }
    
    typeInference.inferTypes(allAst, true); 
   */
   // The color ast is allowed to return nothing and this means we do a discard. 
    _.chain(nodeUtils.getAllNodes(glColorAst))
     .filter(function(node) {        
        return node.type == "ReturnStatement" && node.argument == null; 
     }).each(function(node) {
        var targetDatatype = glColorAst.body[0].id.dataType; 
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
    
    var positionLength  = /vec([0-9]*)/.exec(glPositionAst.body[0].id.dataType)[1];
    var positionLine = "gl_Position = glPosition(); ";
    if(positionLength != 4) {
        positionLine = "gl_Position = vec4(glPosition() " + 
                        _.range(positionLength, 3).map(function() { return ",0.0"; }).join(" ") + 
                        ", 1.0);"; 
    }   
    
    var colorLength  = /vec([0-9]*)/.exec(glColorAst.body[0].id.dataType)[1];
    var colorLine = "gl_FragColor = glColor(); ";
    if(colorLength != 4) {
        colorLine = "gl_FragColor = vec4(glColor() " + 
                        _.range(colorLength, 3).map(function() { return ",0.0"; }).join(" ") + 
                        ", 1.0);"; 
    }   
    
    
    var vertex = [
        "precision mediump float;",        
        generateFields(allAst, "attribute", attributes) + "",
        generateFields(allAst, "varying", varyings, "varyings_") + "",
        generateFields(allAst, "uniform", uniforms) + "",
        extraVertexFunctions.map(function (n) { return rewrite(n); }).join("\n"),
        _.chain(nodeUtils.getAllNodes(glPositionAst)).filter(function(n) { return n.type == "CallExpression" && n.callee.name; })
                                    .map(function(n) { return n.callee.name; })
                                    .unique()                                    
                                    .map(function(n) { return self.KnownFunctionSources[n]; })
                                    .value().join("\n"),
        rewrite.rewriteFunctionAs( glPositionAst.body[0], 'glPosition'),        
        "void main() {",        
        positionLine,
        "}", 
      ].join('\n'); 

    var fragment = [
     "precision mediump float;",     
    generateFields(allAst, "varying", varyings, "varyings_") + "",
    generateFields(allAst, "uniform", uniforms) + "",
    extraFragmentFunctions.map(function (n) { return rewrite(n); }).join("\n"),
    _.chain(nodeUtils.getAllNodes(glColorAst)).filter(function(n) { return n.type == "CallExpression" && n.callee.name; })
                            .map(function(n) { return n.callee.name; })
                            .unique()
                            .map(function(n) { return self.KnownFunctionSources[n]; })
                            .value().join("\n"),
    rewrite.rewriteFunctionAs( glColorAst.body[0], 'glColor'),     
     "void main() {",    
     colorLine,
     "}"    
    ].join('\n'); 
    //console.log(vertex);console.log(fragment);
 
    return {
        vertex: vertex,
        fragment: fragment
    };    
}

module.exports = ShaderSpecification;
