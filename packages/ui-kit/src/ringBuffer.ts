/**
 * High-performance typed-array ring buffer for history metrics.
 * Allocates zero garbage during updates and downsamples to canvas width.
 */
export class MetricRingBuffer {
  private values: Float32Array;
  private timestamps: Float64Array;
  private capacity: number;
  private head: number = 0;
  private size: number = 0;

  constructor(capacity: number = 300) {
    this.capacity = capacity;
    this.values = new Float32Array(capacity);
    this.timestamps = new Float64Array(capacity);
  }

  public push(timestamp: number, value: number): void {
    this.values[this.head] = value;
    this.timestamps[this.head] = timestamp;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  public getLength(): number {
    return this.size;
  }

  /**
   * Returns values in chronological order (oldest to newest).
   */
  public toArray(): { timestamp: number; value: number }[] {
    const arr = new Array(this.size);
    const startIdx = this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      const idx = (startIdx + i) % this.capacity;
      arr[i] = {
        timestamp: this.timestamps[idx],
        value: this.values[idx],
      };
    }
    return arr;
  }

  public getLatest(): number {
    if (this.size === 0) return 0;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.values[idx];
  }

  public getMinMax(): { min: number; max: number } {
    if (this.size === 0) return { min: 0, max: 100 };
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.size; i++) {
      const val = this.values[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 100 : max };
  }
}
