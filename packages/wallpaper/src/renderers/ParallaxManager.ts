export class ParallaxManager {
  private tiltX = 0;
  private tiltY = 0;
  private targetTiltX = 0;
  private targetTiltY = 0;
  private active = false;

  constructor() {
    this.handleOrientation = this.handleOrientation.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;

    if (typeof window !== 'undefined') {
      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
      }
      // Fallback desktop browser mouse tilt
      window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    }
  }

  private handleOrientation(event: DeviceOrientationEvent): void {
    // In landscape mode, gamma is vertical tilt and beta is horizontal tilt
    const gamma = event.gamma || 0; // -90 to 90
    const beta = event.beta || 0;   // -180 to 180

    // Clamp and normalize to -1.0 .. 1.0
    this.targetTiltX = Math.max(-1.0, Math.min(1.0, beta / 45.0));
    this.targetTiltY = Math.max(-1.0, Math.min(1.0, gamma / 45.0));
  }

  private handleMouseMove(event: MouseEvent): void {
    if (typeof window === 'undefined') return;
    const nx = (event.clientX / window.innerWidth) * 2.0 - 1.0;
    const ny = (event.clientY / window.innerHeight) * 2.0 - 1.0;
    this.targetTiltX = nx * 0.5;
    this.targetTiltY = ny * 0.5;
  }

  public update(): { x: number; y: number } {
    // Critically damped spring / exponential smoothing
    this.tiltX = this.tiltX * 0.9 + this.targetTiltX * 0.1;
    this.tiltY = this.tiltY * 0.9 + this.targetTiltY * 0.1;
    return { x: this.tiltX, y: this.tiltY };
  }

  public stop(): void {
    this.active = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.handleOrientation);
      window.removeEventListener('mousemove', this.handleMouseMove);
    }
  }
}
