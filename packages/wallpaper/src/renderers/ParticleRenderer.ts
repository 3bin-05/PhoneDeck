import { TelemetryUniforms } from '../types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  colorSeed: number;
}

export class ParticleRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private readonly particleCount = 60; // Keep lightweight

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.initParticles();
  }

  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.001,
        vy: (Math.random() - 0.5) * 0.001 - 0.0005, // Slight upward drift
        size: Math.random() * 2.0 + 1.0,
        alpha: Math.random() * 0.6 + 0.2,
        colorSeed: Math.random(),
      });
    }
  }

  public render(
    scale: number,
    telemetry: TelemetryUniforms,
    drift: { x: number; y: number },
    dim: number,
    accentHex: string
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const width = Math.max(1, Math.floor(this.canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * scale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // OLED True Black backdrop
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const speedMult = 0.5 + telemetry.cpu * 2.5;

    ctx.save();
    ctx.translate(drift.x, drift.y);

    for (const p of this.particles) {
      // Update positions
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;

      // Wrap around bounds
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1;
      if (p.y > 1) p.y -= 1;

      const px = p.x * width;
      const py = p.y * height;

      // Draw particle
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);

      const effectiveAlpha = Math.min(1.0, p.alpha * dim * (0.4 + telemetry.gpu * 0.6));
      ctx.fillStyle = accentHex;
      ctx.globalAlpha = effectiveAlpha;
      ctx.fill();
    }

    // Draw net pulse ring if active
    if (telemetry.net > 0.1) {
      ctx.beginPath();
      const ringRadius = (width * 0.3) * telemetry.net;
      ctx.arc(width / 2, height / 2, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = telemetry.net * 0.4 * dim;
      ctx.stroke();
    }

    ctx.restore();
  }

  public dispose(): void {
    this.particles = [];
  }
}
