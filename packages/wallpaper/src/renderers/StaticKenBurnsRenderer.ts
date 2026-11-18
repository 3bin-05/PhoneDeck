export class StaticKenBurnsRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private image: HTMLImageElement | null = null;
  private isLoaded = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  public setImage(src: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.image = img;
        this.isLoaded = true;
        resolve(true);
      };
      img.onerror = () => {
        console.warn('Failed to load Ken Burns image:', src);
        resolve(false);
      };
      img.src = src;
    });
  }

  public render(
    timeSec: number,
    scale: number,
    dim: number,
    drift: { x: number; y: number }
  ): void {
    if (!this.ctx || !this.image || !this.isLoaded) return;
    const ctx = this.ctx;

    const width = Math.max(1, Math.floor(this.canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * scale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Ultra-slow pan and zoom (Ken Burns)
    const zoomCycle = 30.0; // 30s zoom cycle
    const panCycle = 45.0; // 45s pan cycle
    const zoom = 1.05 + Math.sin((timeSec / zoomCycle) * Math.PI * 2) * 0.05; // 1.05 to 1.10 zoom
    const panX = Math.sin((timeSec / panCycle) * Math.PI * 2) * 20 + drift.x;
    const panY = Math.cos((timeSec / (panCycle * 1.3)) * Math.PI * 2) * 15 + drift.y;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(width / 2 + panX, height / 2 + panY);
    ctx.scale(zoom, zoom);

    // Draw image centered
    const imgAspect = this.image.width / this.image.height;
    const canvasAspect = width / height;

    let drawW = width;
    let drawH = height;

    if (imgAspect > canvasAspect) {
      drawW = height * imgAspect;
    } else {
      drawH = width / imgAspect;
    }

    ctx.drawImage(this.image, -drawW / 2, -drawH / 2, drawW, drawH);

    // Apply OLED dimming overlay
    if (dim < 1.0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${1.0 - dim})`;
      ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
    }

    ctx.restore();
  }

  public dispose(): void {
    this.image = null;
    this.isLoaded = false;
  }
}
