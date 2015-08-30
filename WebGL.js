var knownFunctions = require("./libs/knownFunctions");
var _ = require('underscore');

var builtins = {};

function Builtin(name, fn, argTypes, rtnType) {
    this.name = name; 
    this.rtnType = rtnType || "float";
    this.argTypes = argTypes || [ "float" ];  
    this.fn = fn;
};

function Shared(name, argTypes, rtnType) {
    Builtin.call(this, name, Math[name], argTypes, rtnType);
};


function mod(a, b) { return a % b; }

function texture2D(tex, coord) {
    return tex.texture2D(coord);
 }

function multVecs (a,b) {
    var rtn = []; 
    for(var i = 0;i < a.length;i++)
	rtn.push(a[i] * b[i]);
    return rtn; 
}

function addVecs(a,b) {
   var rtn = []; 
    for(var i = 0;i < a.length;i++)
	rtn.push(a[i] + b[i]);
    return rtn; 
}

function clamp(value, low, high) {
      return Math.max(low, Math.min(value, high));
}

var builtins = [
    new Shared("sin"), new Shared("cos"), new Shared("tan"), new Shared("asin"),
    new Shared("acos"), new Shared("exp"), new Shared("log"), new Shared("sqrt"), 
    new Shared("abs"), new Shared("sign"), new Shared("floor"), new Shared("ceil"),     
    new Shared("atan"),     
    new Shared("pow", [ "float", "float" ]), 
    new Shared("min", [ "float", "float" ]), 
    new Shared("max", [ "float", "float" ]),
    new Builtin("atan", Math.atan2, [ "float", "float" ]),
    new Builtin("texture2D", texture2D, [ 'sampler2D', 'vec2' ], 'vec4'),
    new Builtin("mod", mod, [ 'float', 'float' ], 'float'),
    new Builtin("addVecs4", addVecs, [ 'vec4', 'vec4' ], 'vec4'),
    new Builtin("clamp", clamp, [ 'float', 'float', 'float' ], 'float')
];



module.exports = {
    Builtins: _.object(_.pluck(builtins, 'name'), _.pluck(builtins, 'fn')),
    MetaBuiltins: builtins
};
