declare module "js2glsl" {
    export class ShaderSpecification <Attributes, Varyings, Uniforms> {
	attributes: Attributes;
	uniforms: Uniforms;
	varyings: Varyings; 
	VertexPosition(...modules : Array<any>) : number[];
	FragmentColor(...modules : Array<any>) : number[];

	GetProgram(gl : WebGLRenderingContext) : WebGLProgram;
    }
}
