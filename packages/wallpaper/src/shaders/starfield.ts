import { SHADER_HEADER } from './common';

export const STARFIELD_FRAGMENT = `
${SHADER_HEADER}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec2 p = uv + u_drift * 0.005;

  float warpSpeed = 0.5 + u_speed * 1.5;
  float t = u_time * warpSpeed;

  vec3 color = vec3(0.0);

  // 3 Layers of depth
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float z = fract(0.33 * fi - t * 0.2);
    float size = (1.0 - z) * 2.0;
    vec2 pos = p / (z + 0.001);

    vec2 gridId = floor(pos * 8.0);
    vec2 gridUv = fract(pos * 8.0) - 0.5;

    float rnd = hash(gridId + fi * 10.0);
    if (rnd > (0.85 - u_intensity * 0.15)) {
      float d = length(gridUv);
      float star = smoothstep(0.12 * size, 0.0, d);
      float brightness = (1.0 - z) * (0.6 + u_intensity * 0.6);

      // Subtle star color temperature tint
      vec3 starColor = mix(vec3(0.9, 0.95, 1.0), u_accent, rnd * 0.5);
      if (u_hue > 0.5) {
        starColor = mix(starColor, vec3(1.0, 0.6, 0.3), (u_hue - 0.5) * 2.0);
      }

      color += starColor * star * brightness;
    }
  }

  // Network activity pulse flash
  if (u_pulse > 0.1) {
    float coreDist = length(uv);
    color += u_accent * (1.0 - smoothstep(0.0, 0.8, coreDist)) * u_pulse * 0.2;
  }

  // True black threshold
  color = clamp(color - 0.02, 0.0, 1.5) * u_dim;

  gl_FragColor = vec4(color, 1.0);
}
`;
