export const VERTEX_SHADER = `
precision highp float;
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const SHADER_HEADER = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_speed;     // CPU: 0.1 to 3.0
uniform float u_intensity; // GPU: 0.2 to 1.5
uniform float u_pulse;     // Net: 0.0 to 1.0
uniform float u_hue;       // Temp: 0.0 to 1.0
uniform vec2 u_drift;      // OLED drift offset in pixels
uniform float u_dim;       // Overall brightness multiplier (0.0 to 1.0)
uniform vec3 u_accent;     // Theme accent color (0..1, 0..1, 0..1)
`;
