var js2glsl = require ('../js2glsl');

function adjustableAxisShaderSpec() {

}

adjustableAxisShaderSpec.prototype = Object.create(js2glsl.ShaderSpecification.prototype); 
adjustableAxisShaderSpec.prototype.constructor = adjustableAxisShaderSpec;

adjustableAxisShaderSpec.prototype.VertexPosition = function() {
    var test = 10; 
    return [this.getX(10), this.getY(), 0, 1.]; 
}
adjustableAxisShaderSpec.prototype.FragmentColor = function() {
    return [1,1,1]; 
}
adjustableAxisShaderSpec.prototype.getX = function(m) {
    var test = [1,2,3];
    return this.attributes.position[0] * m;
}
adjustableAxisShaderSpec.prototype.getY = function() {
    return this.attributes.position[1];
}
module.exports = {
    adjustableAxisShaderSpec: new adjustableAxisShaderSpec(),
    example1:  new js2glsl.ShaderSpecification(
        function () {
            var position = this.attributes.position; 
            this.varyings.uv = [position[0], position[1]];
            return vec3(position[0], position[1], position[2]); 
        },
        function () {
            var uv = this.varyings.uv; 
            var t = this.uniforms.t; 
            return [0.5*(uv[0]+1.0), 0.5*(uv[1]+1.0) , 0.5*(Math.cos(t)+1.0), 1.0]; 
        }
    ),
    example2: new js2glsl.ShaderSpecification(
        function () {
            var position = this.attributes.position; 
            this.varyings.uv = [position[0], position[1]];
            return vec3(position[0] * Math.cos(this.uniforms.t),
                        position[1] * Math.sin(this.uniforms.t), 
                        position[2]); 
        },
        function () {
            var uv = this.varyings.uv; 
            var t = this.uniforms.t; 
            return [0.5*(uv[0]+1.0), 0.5*(uv[1]+1.0) , 0.5*(Math.cos(t)+1.0), 1.0]; 
        }    
    ),
    standardShader2: new js2glsl.ShaderSpecification(
        function() {
            this.varyings.color = this.attributes.color; 
            return this.attributes.position;
        },
        function () {
            return this.varyings.color;
        }
    ),
    standardShader: new js2glsl.ShaderSpecification(
        function() {
            this.varyings.vcolor = vec3.scale(this.attributes.color, this.uniforms.brightness);
            return mat4.multiplyVec3(this.uniforms.tx, this.attributes.point);    
        },
        function() {
            return this.varyings.vcolor;
        }
    ),
    vec4shader: new js2glsl.ShaderSpecification(
        function() {
            return this.attributes.xyz; 
        },
        function() {
            return;
        }
    ),
    simpleShader: new js2glsl.ShaderSpecification(
        function() {
            this.varyings.vcolor = this.attributes.rgb; 
            return [this.attributes.x, this.attributes.y, this.attributes.z, 1.0];
        },    
        function() {
            return this.varyings.vcolor;
        }
    ),
    emptyShader: new js2glsl.ShaderSpecification()
};
