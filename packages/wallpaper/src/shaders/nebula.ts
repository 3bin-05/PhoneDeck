import { SHADER_HEADER } from './common';

export const NEBULA_FRAGMENT = `
${SHADER_HEADER}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec2 p = uv * 1.5 + u_drift * 0.003;

  float t = u_time * (0.05 + u_speed * 0.15);

  float q = fbm(p + vec2(t * 0.2, t * 0.1));
  float r = fbm(p + q * 1.2 + vec2(cos(t * 0.3), sin(t * 0.4)));

  float density = smoothstep(0.35, 0.75, r);
  density *= (0.3 + u_intensity * 0.8);

  // Palette: Void deep purple to vibrant accent & amber temp shift
  vec3 colCool = mix(vec3(0.05, 0.0, 0.15), u_accent, density);
  vec3 colWarm = mix(u_accent, vec3(1.0, 0.35, 0.1), density);
  vec3 color = mix(colCool, colWarm, u_hue) * density;

  // Pulse glow on net traffic
  color += u_accent * (r * u_pulse * 0.35);

  // Strict OLED black clamping
  color = clamp(color - 0.04, 0.0, 1.0) * u_dim;

  gl_FragColor = vec4(color, 1.0);
}
`;
