var WebGL = require("../WebGL"); 

function drawToCanvas(canvas, mode, spec, attributes, uniforms) {
    spec.uniforms = uniforms; 
    spec.varyings = {};
    var w = canvas.width; 
    var h = canvas.height;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(w,h); 

    for(var x = 0;x < w;x++){
	for(var y = 0;y < h;y++) {
	    spec.varyings.texCoord = [ x/w + 1/(2*w), y/h + 1/(2*h)  ]; 
	    var rgba = spec.FragmentColor(WebGL.Builtins);
	    var idx = (x + (h-y-1) * (w)) * 4; 
	    img.data[idx + 0] = Math.round( (rgba[0]||0) * 255);
	    img.data[idx + 1] = Math.round( (rgba[1]||0) * 255);
	    img.data[idx + 2] = Math.round( (rgba[2]||0) * 255);
	    img.data[idx + 3] = Math.round( (rgba[3] === undefined ? 1 : rgba[3]) * 255); // If rgba[3] == 0 then our || trick does the wrong thing. 

	}
    }
    ctx.putImageData(img, 0, 0);     

}

module.exports = drawToCanvas;
