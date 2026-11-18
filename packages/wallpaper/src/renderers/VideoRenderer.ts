export class VideoRenderer {
  private video: HTMLVideoElement | null = null;
  private container: HTMLElement;
  private isPlaying = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setSource(src: string): void {
    if (!this.video) {
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.loop = true;
      this.video.playsInline = true;
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('webkit-playsinline', '');
      this.video.style.position = 'absolute';
      this.video.style.inset = '0';
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.style.objectFit = 'cover';
      this.video.style.pointerEvents = 'none';
      this.container.appendChild(this.video);
    }

    this.video.src = src;
    this.video.play().catch(() => {
      // Autoplay with mute allowed
    });
    this.isPlaying = true;
  }

  public update(cpuSpeed: number, isStaticOrDimmed: boolean, dim: number): void {
    if (!this.video) return;

    if (isStaticOrDimmed) {
      if (this.isPlaying) {
        this.video.pause();
        this.isPlaying = false;
      }
    } else {
      if (!this.isPlaying) {
        this.video.play().catch(() => {});
        this.isPlaying = true;
      }
      // Speed modulated by CPU
      this.video.playbackRate = 0.8 + cpuSpeed * 0.7;
    }

    this.video.style.opacity = `${dim}`;
  }

  public dispose(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      if (this.video.parentElement) {
        this.video.parentElement.removeChild(this.video);
      }
      this.video = null;
    }
    this.isPlaying = false;
  }
}
