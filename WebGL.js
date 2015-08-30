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

function getPx(img, x, y, w, h) {
    if(x < 0) x = 0;
    if(y < 0) y = 0; 
    if(x >= w) x = w-1; 
    if(y >= h) y = h-1; 
    var idx = (x + y * w) * 4;
/*    if(idx < 0) 
	console.log(w,h,x,y,idx);*/
    var isByteBased = false;
    switch(img.constructor.name) {
	case "Uint8ClampedArray":
	isByteBased = true; 
    }
    var div = isByteBased ? 255.0 : 1.0;
    return [ img[idx+0]/div || 0,
	     img[idx+1]/div || 0,
	     img[idx+2]/div || 0,
	     img[idx+3]/div || 1]; 
}

function texture2D(tex, coord) {
    var w = tex[1];
    var h = tex[2]; 
    var x = coord[0]*(w) + 0.5; 
    //var y = (1.0-coord[1])*(h) + 0.5;
    var y = (coord[1])*(h) + 0.5;
    var fx = Math.floor(x); 
    var fy = Math.floor(y);
    var cx = Math.ceil(x);
    var cy = Math.ceil(y); 

    var candidates = [ 
	[fx, fy],
	[fx, cy],
	[cx, fy],
	[cx, cy] ];
    
    var winner_idx = 0; 
    var winner_dist = Infinity; 
    for(var i = 0;i < 4;i++) {
	var xi = candidates[i][0];
	var yi = candidates[i][1];
	var d = Math.sqrt(Math.pow((x-xi), 2) + Math.pow((y-yi), 2));
	if(d < winner_dist) {
	    winner_idx = i; 
	    winner_dist = d; 
	}
    }
    var wx = candidates[winner_idx][0];
    var wy = candidates[winner_idx][1];
    return getPx(tex[0], wx, wy, w, h); 
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
