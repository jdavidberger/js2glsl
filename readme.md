JS2GLSL
=======

JS2GLSL is a library that turns javascript into GLSL source. The goal is to allow developers to write shaders in javascript, and then transpile it into shader language. 

# Example
````
var js2glsl = require('js2glsl'); 
var shaderSpec = new js2glsl.ShaderSpecification(
        function () {
            this.varyings.uv =  [this.attributes.position[0],
                            this.attributes.position[1]];
            return vec3(this.attributes.position[0],
                        this.attributes.position[1],
                        this.attributes.position[2]); 
        },
        function () {
            return [0.5*(this.varyings.uv[0]+1.0), 
                    0.5*(this.varyings.uv[1]+1.0) , 
                    0.5*(Math.cos(this.uniforms.t)+1.0), 1.0]; 
        }
);
var shaderSrc = shaderSpec.ShaderSource();
console.log(shaderSrc.vertex);
console.log(shaderSrc.fragment);
````

# How it works

The javascript functions are parsed into a tree representation by [esprima](http://esprima.org/). That representation is then examined for JS specific functions which are switched out for their GLSL counterparts. 

## Limitations

Since the langauges are very different, not all javascript functions can transpile. The main limitation is that JSON objects aren't supported beyond the special forms from uniform, varying, and attribute. 

Limited custom JS functions are supported, although not closures and not much of the JS core library -- bind, apply, map, etc. 

