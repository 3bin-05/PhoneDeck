import { SHADER_HEADER } from './common';

export const FLOW_FIELD_FRAGMENT = `
${SHADER_HEADER}

void main() {
  vec2 p = (gl_FragCoord.xy + u_drift) / u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);

  float t = u_time * (0.15 + u_speed * 0.35);

  // Field calculation
  float angle = sin(uv.x * 2.0 + t) + cos(uv.y * 2.5 - t * 0.8);
  vec2 dir = vec2(cos(angle), sin(angle));

  // Trace distance to flow lines
  float d1 = sin(dot(uv, dir) * 10.0 + t * 2.0 + u_pulse * 4.0);
  float d2 = cos(dot(uv, vec2(-dir.y, dir.x)) * 8.0 - t);
  float lines = abs(d1 * d2);

  float glow = pow(1.0 - clamp(lines, 0.0, 1.0), 4.0);
  glow *= (0.3 + u_intensity * 0.7);

  // Accent color with temperature modulation
  vec3 col = mix(u_accent, vec3(1.0, 0.4 + u_hue * 0.6, 0.2), u_hue * 0.5) * glow;

  // Add net pulse shockwave ring
  float distCenter = length(uv);
  float ring = exp(-pow((distCenter - fract(u_time * 0.5 + u_pulse)) * 10.0, 2.0)) * u_pulse * 0.8;
  col += u_accent * ring;

  // True black cutoff
  col = clamp(col - 0.03, 0.0, 1.0);
  col *= u_dim;

  gl_FragColor = vec4(col, 1.0);
}
`;
