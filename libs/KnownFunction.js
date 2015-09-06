var nodeUtils = require('./nodeUtils');
var rewrite = require ('./rewrite');

function KnownFunction( name, argTypes, rtnType, transform, src ) {
    this.name = name; 
    this.rtnType = rtnType || "float";
    this.argTypes = argTypes || [ "float" ];
    this.transform = transform; 
    this.src = src;
};
KnownFunction.prototype.toString = function() {
    return this.name + "(" + this.argTypes.join(",") + ")";
}

KnownFunction.prototype.inferTypes = function(node) {
    var rtn = nodeUtils.setDataType(node, this.rtnType);
    if(this.argTypes.length !== node.arguments.length) {
        throw new Error(rewrite(node.callee) + " should have " + this.argTypes.length + " arguments, it has " + node.arguments.length); 
    }            
    for(var i = 0;i < this.argTypes.length;i++) 
        rtn = rtn.concat(nodeUtils.setDataType(node.arguments[i], this.argTypes[i]));
    return rtn;
}

module.exports = KnownFunction;
