JS2GLSL
=======

JS2GLSL is a library that turns javascript into GLSL source. The goal is to allow developers to write shaders in javascript, and then transpile it into shader language. 

# Try it 

http://jdavidberger.github.io/js2glsl-shadertoy/

# Basic Example
````
var js2glsl = require('js2glsl'); 

function VertexPosition() {
            varyings.uv =  [attributes.position[0],
                            attributes.position[1]];
            return vec3(attributes.position[0],
                        attributes.position[1],
                        attributes.position[2]); 
};

function FragmentColor() {
            return [0.5*(varyings.uv[0]+1.0), 
                    0.5*(varyings.uv[1]+1.0) , 
                    0.5*(Math.cos(uniforms.t)+1.0), 1.0]; 
};

var shaderSrc = js2glsl({VertexPosition: VertexPosition, FragmentColor: FragmentColor});
var shaderSrc = shaderSpec.ShaderSource();
console.log(shaderSrc.vertex);
console.log(shaderSrc.fragment);
````

# Object-Oriented Example
````
var js2glsl = require('js2glsl'); 

var shaderSpec = new js2glsl.ShaderSpecification();
shaderSpec.getUV = function() {
       return [this.attributes.position[0],
               this.attributes.position[1]];
};
shaderSpec.VertexShader = function () {
    this.varyings.uv =  this.getUV();
    return vec3(this.attributes.position[0],
                this.attributes.position[1],
                this.attributes.position[2]); 
};
shaderSpec.FragmentShader = function () {
    return [0.5*(this.varyings.uv[0]+1.0), 
            0.5*(this.varyings.uv[1]+1.0) , 
            0.5*(Math.cos(this.uniforms.t)+1.0), 1.0]; 
}

var shaderSrc = shaderSpec.ShaderSource();
console.log(shaderSrc.vertex);
console.log(shaderSrc.fragment);
````

# How it works

The javascript functions are parsed into a tree representation by [esprima](http://esprima.org/). That representation is then examined for JS specific functions which are switched out for their GLSL counterparts. 

## Limitations

Since the langauges are very different, not all javascript functions can transpile. The main limitation is that JSON objects aren't supported beyond the special forms from uniform, varying, and attribute. 

Limited custom JS functions are supported, although not closures and not much of the JS core library -- bind, apply, map, etc. 

The main purpose behind the OO bindings is to allow a more modular design for shaders. A core use case is to have something like a base shader which plots over XY, but different subclasses have different color mappings; so with little to no code duplication, you can get multiple related shaders. Any 'normal' prototype based inheritance method should work. Demos in different transpiled languages are forthcoming. 

