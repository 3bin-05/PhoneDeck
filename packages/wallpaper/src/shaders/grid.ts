import { SHADER_HEADER } from './common';

export const GRID_FRAGMENT = `
${SHADER_HEADER}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  uv.xy += u_drift * 0.002;

  // Horizon line positioned slightly above center
  float horizon = -0.1;
  float y = uv.y - horizon;

  vec3 color = vec3(0.0);

  // Ground plane in perspective (y < 0)
  if (y < 0.0) {
    // 3D perspective mapping
    float depth = -0.6 / y;
    float forward = depth + u_time * (0.8 + u_speed * 1.5);
    float lateral = uv.x * depth;

    // Grid coordinates
    vec2 grid = abs(fract(vec2(lateral, forward) - 0.5) - 0.5) / fwidth(vec2(lateral, forward));
    float line = min(grid.x, grid.y);
    float lineIntensity = 1.0 - min(line, 1.0);

    // Fog fade near horizon
    float fog = clamp(exp(-depth * 0.15), 0.0, 1.0);

    // Net pulse wave running forward along grid
    float pulseWave = sin(forward * 2.0 - u_time * 3.0) * u_pulse;
    pulseWave = clamp(pulseWave, 0.0, 1.0);

    float brightness = (lineIntensity + pulseWave * 0.8) * (0.5 + u_intensity * 0.6) * fog;

    // Grid color derived from accent
    color = u_accent * brightness;

    // Temperature shifts horizon glow
    vec3 glowColor = mix(u_accent, vec3(1.0, 0.5, 0.2), u_hue);
    color += glowColor * pow(fog, 3.0) * 0.4;
  } else {
    // Sky gradient with subtle stars / drift
    float skyFog = clamp(exp(-y * 8.0), 0.0, 1.0);
    color = u_accent * (skyFog * 0.15 * (0.5 + u_intensity * 0.5));
  }

  // Pure black clamping
  color = clamp(color - 0.015, 0.0, 1.5) * u_dim;

  gl_FragColor = vec4(color, 1.0);
}
`;
