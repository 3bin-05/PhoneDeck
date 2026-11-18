import { SHADER_HEADER } from './common';

export const AURORA_FRAGMENT = `
${SHADER_HEADER}

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 st = (gl_FragCoord.xy + u_drift) / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);

  // Time modulated by CPU speed
  float t = u_time * (0.2 + u_speed * 0.4);

  // Network pulse induces horizontal displacement waves
  float wave = sin(p.y * 3.0 + t + u_pulse * 3.14) * (0.05 + u_pulse * 0.1);
  p.x += wave;

  // Layered sinusoidal ribbon bands
  float ribbon1 = sin(p.x * 1.5 + t * 0.8) + cos(p.y * 2.0 - t * 0.5);
  float ribbon2 = sin(p.x * 2.2 - t * 1.1 + ribbon1) * 0.5;
  float ribbon3 = cos(p.y * 3.0 + t * 0.7 - ribbon2) * 0.25;

  float intensity = abs(1.0 / ((p.y + ribbon1 * 0.25 + ribbon2 * 0.15) * 12.0));
  intensity = clamp(intensity, 0.0, 2.0) * (0.4 + u_intensity * 0.8);

  // Base hue from theme accent or temperature shift
  float baseHue = fract(0.72 + u_hue * 0.3); // Shifts violet/cyan -> warmer amber
  vec3 col = hsv2rgb(vec3(baseHue + ribbon2 * 0.1, 0.75, intensity));

  // Blend in user theme accent
  col = mix(col, u_accent * intensity * 1.2, 0.4);

  // True-black threshold clamp for OLED power saving
  float alpha = smoothstep(0.05, 0.35, length(col));
  col *= alpha * u_dim;

  gl_FragColor = vec4(col, 1.0);
}
`;
