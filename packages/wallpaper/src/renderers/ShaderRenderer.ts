import { VERTEX_SHADER } from '../shaders/common';
import { TelemetryUniforms } from '../types';

export class ShaderRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private currentShaderSource: string = '';

  // Uniform locations cache
  private uTimeLoc: WebGLUniformLocation | null = null;
  private uResLoc: WebGLUniformLocation | null = null;
  private uSpeedLoc: WebGLUniformLocation | null = null;
  private uIntensityLoc: WebGLUniformLocation | null = null;
  private uPulseLoc: WebGLUniformLocation | null = null;
  private uHueLoc: WebGLUniformLocation | null = null;
  private uDriftLoc: WebGLUniformLocation | null = null;
  private uDimLoc: WebGLUniformLocation | null = null;
  private uAccentLoc: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGL();
  }

  private initGL(): boolean {
    const gl =
      this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      }) ||
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('Phone Deck Wallpaper: WebGL not supported on this device');
      return false;
    }

    this.gl = gl;

    // Create fullscreen quad vertex buffer
    const vertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    return true;
  }

  public setFragmentShader(fragSource: string): boolean {
    if (!this.gl) return false;
    if (this.currentShaderSource === fragSource && this.program) {
      return true; // Already compiled
    }

    const gl = this.gl;

    // Clean up old program if any
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

    if (!vertShader || !fragShader) {
      return false;
    }

    const program = gl.createProgram();
    if (!program) return false;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return false;
    }

    this.program = program;
    this.currentShaderSource = fragSource;

    // Cache uniform locations
    gl.useProgram(program);
    this.uTimeLoc = gl.getUniformLocation(program, 'u_time');
    this.uResLoc = gl.getUniformLocation(program, 'u_resolution');
    this.uSpeedLoc = gl.getUniformLocation(program, 'u_speed');
    this.uIntensityLoc = gl.getUniformLocation(program, 'u_intensity');
    this.uPulseLoc = gl.getUniformLocation(program, 'u_pulse');
    this.uHueLoc = gl.getUniformLocation(program, 'u_hue');
    this.uDriftLoc = gl.getUniformLocation(program, 'u_drift');
    this.uDimLoc = gl.getUniformLocation(program, 'u_dim');
    this.uAccentLoc = gl.getUniformLocation(program, 'u_accent');

    // Bind position attribute
    const posAttribLoc = gl.getAttribLocation(program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(posAttribLoc);
    gl.vertexAttribPointer(posAttribLoc, 2, gl.FLOAT, false, 0, 0);

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        `Shader compile error (${type === gl.VERTEX_SHADER ? 'vert' : 'frag'}):`,
        gl.getShaderInfoLog(shader)
      );
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  public render(
    timeSec: number,
    scale: number,
    telemetry: TelemetryUniforms,
    drift: { x: number; y: number },
    dim: number,
    accentHex: string
  ): void {
    if (!this.gl || !this.program) return;
    const gl = this.gl;

    // Scale canvas buffer size per governor tier (1.0 high, 0.75 balanced, 0.5 eco)
    const displayWidth = Math.max(1, Math.floor(this.canvas.clientWidth * scale));
    const displayHeight = Math.max(1, Math.floor(this.canvas.clientHeight * scale));

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      gl.viewport(0, 0, displayWidth, displayHeight);
    }

    gl.useProgram(this.program);

    // Parse accent hex to normalized RGB
    const accentRgb = this.hexToRgb(accentHex);

    // Upload uniforms
    if (this.uTimeLoc) gl.uniform1f(this.uTimeLoc, timeSec);
    if (this.uResLoc) gl.uniform2f(this.uResLoc, displayWidth, displayHeight);
    if (this.uSpeedLoc) gl.uniform1f(this.uSpeedLoc, telemetry.cpu);
    if (this.uIntensityLoc) gl.uniform1f(this.uIntensityLoc, telemetry.gpu);
    if (this.uPulseLoc) gl.uniform1f(this.uPulseLoc, telemetry.net);
    if (this.uHueLoc) gl.uniform1f(this.uHueLoc, telemetry.temp);
    if (this.uDriftLoc) gl.uniform2f(this.uDriftLoc, drift.x, drift.y);
    if (this.uDimLoc) gl.uniform1f(this.uDimLoc, dim);
    if (this.uAccentLoc) gl.uniform3f(this.uAccentLoc, accentRgb[0], accentRgb[1], accentRgb[2]);

    // Draw full-screen quad (6 vertices)
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private hexToRgb(hex: string): [number, number, number] {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map((c) => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    if (isNaN(num)) return [0.49, 0.36, 1.0]; // Default Void purple
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255,
    ];
  }

  public dispose(): void {
    if (this.gl) {
      if (this.program) {
        this.gl.deleteProgram(this.program);
        this.program = null;
      }
      if (this.positionBuffer) {
        this.gl.deleteBuffer(this.positionBuffer);
        this.positionBuffer = null;
      }
    }
  }
}
