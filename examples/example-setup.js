module.exports = function (jsShaders) {
    var shell = require('gl-now')()
    var createShader = require('gl-shader')
    var js2glsl = require('../js2glsl.js'); 

    var shader, buffer
     
    shell.on('gl-init', function() {
      var gl = shell.gl
        
      var shaders = jsShaders.ShaderSource(); 
      
      //Create shader 
      shader = createShader(gl,
        shaders.vertex,
        shaders.fragment);
     
      //Create vertex buffer 
      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0,
         1, -1, 0,
        -1,  1, 0,
         1,  1, 0,
      ]), gl.STATIC_DRAW)
     
    shell.on('gl-render', function(t) {
      var gl = shell.gl
      if(shader === undefined) return; 
      //Bind shader 
      shader.bind()
      
      //Set attributes 
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      shader.attributes.position.pointer()
     
      //Set uniforms 
      shader.uniforms.t += 0.01
     
      //Draw 
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    })

    })
};