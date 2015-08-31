function Sampler2D(imgData, width, height) {

    this.data = imgData;
    this.flipY = false; 
    this.width = width;
    this.height = height;
    this.magnificationFilter = Sampler2D.Filter.Nearest;
    this.minificationFilter = Sampler2D.Filter.Nearest;
    this.wrapX = Sampler2D.Wrap.ClampToEdge;
    this.wrapY = Sampler2D.Wrap.ClampToEdge;
};

Sampler2D.Filter = {
    Nearest: 1,
    Linear: 2,
    LinearMipmapLinear: 4,
    NearestMipmapNearest: 8,
    NearestMipmapLinear: 16,
    LinearMipmapNearest: 32
};

Sampler2D.Wrap = {
    ClampToEdge: 1,
    Repeat: 2,
    MirroredRepeat: 4    
};

Sampler2D.prototype.getPx = function(x, y) {
    var w = this.width; 
    var h = this.height; 

    switch(this.wrapX) {
    case Sampler2D.Wrap.ClampToEdge:
	if(x < 0) x = 0;
	if(x >= w) x = w-1; 
	break;
    case Sampler2D.Wrap.Repeat:
    case Sampler2D.Wrap.MirroredRepeat:
	x = w % x; 
	break;
    }
    
    switch(this.wrapY) {
    case Sampler2D.Wrap.ClampToEdge:
	if(y < 0) y = 0; 
	if(y >= h) y = h-1; 
	break;
    case Sampler2D.Wrap.Repeat:
    case Sampler2D.Wrap.MirroredRepeat:
	y = h % y; 
	break;
    }

    var idx = (x + y * w) * 4;

    var isByteBased = false;
    switch(this.data.constructor.name) {
	case "Uint8ClampedArray":
	isByteBased = true; 
    }
    var div = isByteBased ? 255.0 : 1.0;
    return [ this.data[idx+0]/div || 0,
	     this.data[idx+1]/div || 0,
	     this.data[idx+2]/div || 0,
	     this.data[idx+3] == undefined ? 1 : this.data[idx+3]/div]; 
};

Sampler2D.prototype.texture2D = function(coord) {
    var w = this.width;
    var h = this.height; 
    var flErrBias = 10*Number.EPSILON;
    var x = (coord[0]-flErrBias)*(w) ;
    var c1 = coord[1]; 
    if(this.flipY)
	c1 = 1.0 - c1; 
    var y = (c1-flErrBias)*h ;
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
	var d = (Math.pow((x-xi), 2) + Math.pow((y-yi), 2));
	if(d < winner_dist) {
	    winner_idx = i; 
	    winner_dist = d; 
	}
    }
    if(winner_idx != 0) {
	winner_idx;
    }
    var wx = candidates[winner_idx][0];
    var wy = candidates[winner_idx][1];
    return this.getPx(wx, wy); 
};

module.exports = Sampler2D; 
