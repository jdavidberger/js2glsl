var js2glsl = require ('../js2glsl');

function adjustableAxisShaderSpec() {

}

adjustableAxisShaderSpec.prototype = Object.create(js2glsl.ShaderSpecification.prototype); 
adjustableAxisShaderSpec.prototype.constructor = adjustableAxisShaderSpec;

var vp = adjustableAxisShaderSpec.prototype.VertexPosition = function() {
    var test = 10;
    var test2 = test + (-1);
    return [this.getX(test2), this.getY(), 0, 1.]; 
}
var fc = adjustableAxisShaderSpec.prototype.FragmentColor = function() {
    return [1,1,1]; 
}
var getX = adjustableAxisShaderSpec.prototype.getX = function(m) {
    var test = [1,2,3];
    return this.attributes.position[0] * m;
}
var getY = adjustableAxisShaderSpec.prototype.getY = function() {
    return this.attributes.position[1];
}

var readmeEx2 = new js2glsl.ShaderSpecification();
readmeEx2.getUV = function() {
       return [this.attributes.position[0],
               this.attributes.position[1]];
};
readmeEx2.VertexPosition = function () {
    this.varyings.uv =  this.getUV();
    return [this.attributes.position[0],
            this.attributes.position[1],
            this.attributes.position[2]]; 
};
readmeEx2.FragmentColor = function () {
    return [0.5*(this.varyings.uv[0]+1.0), 
            0.5*(this.varyings.uv[1]+1.0) , 
            0.5*(Math.cos(this.uniforms.t)+1.0), 1.0]; 
}

function readmeEx1_VertexPosition() {
            varyings.uv =  [attributes.position[0],
                            attributes.position[1]];
    return [attributes.position[0],
            attributes.position[1],
            attributes.position[2]]; 
};

function readmeEx1_FragmentColor() {
            return [0.5*(varyings.uv[0]+1.0), 
                    0.5*(varyings.uv[1]+1.0) , 
                    0.5*(Math.cos(uniforms.t)+1.0), 1.0]; 
};

module.exports = {
    readmeEx1: js2glsl({VertexPosition: readmeEx1_VertexPosition, FragmentColor: readmeEx1_FragmentColor}),
    readmeEx2: readmeEx2,
    altApi: js2glsl({VertexPosition: vp, FragmentColor: fc, getX: getX, getY: getY}),
    adjustableAxisShaderSpec: new adjustableAxisShaderSpec(),
    example1:  new js2glsl.ShaderSpecification(
        function () {
            var position = this.attributes.position; 
            this.varyings.uv = [position[0], position[1]];
            return [position[0], position[1], position[2]]; 
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
            return [position[0] * Math.cos(this.uniforms.t),
                    position[1] * Math.sin(this.uniforms.t), 
                    position[2]]; 
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
            this.varyings.vcolor = vec3.scale([0,0,0], this.attributes.color, this.uniforms.brightness);
            return vec3.transformMat4(vec3.create(), this.attributes.point, this.uniforms.tx);
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
