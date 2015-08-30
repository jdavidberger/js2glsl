declare module js2glsl {    
    class ShaderSpecification<Attributes, Varyings, Uniforms> {
	constructor(); 
        attributes: Attributes;
        uniforms: Uniforms;
        varyings: Varyings;
        VertexPosition(...modules: Array<any>): number[];
        FragmentColor(...modules: Array<any>): number[];
	ShaderSource() : {vertex:string, fragment:string}; 
        GetProgram(gl: WebGLRenderingContext): WebGLProgram;
    }       
    var builtIns : Object; 
}
