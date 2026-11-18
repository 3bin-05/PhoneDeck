/**
 * Critically damped spring simulation for buttery-smooth gauge & metric interpolation.
 * Produces smooth 30 fps transitions on 1 Hz telemetry without overshoot or network overhead.
 */
export class Spring {
  public value: number;
  public target: number;
  public velocity: number;
  public omega: number; // Angular frequency (stiffness / response speed)

  constructor(initialValue: number = 0, omega: number = 10.0) {
    this.value = initialValue;
    this.target = initialValue;
    this.velocity = 0;
    this.omega = omega;
  }

  public setTarget(newTarget: number): void {
    this.target = newTarget;
  }

  public snapTo(val: number): void {
    this.value = val;
    this.target = val;
    this.velocity = 0;
  }

  /**
   * Step the simulation forward by `dt` seconds (e.g. 1/30s or measured elapsed time).
   * Returns the updated value.
   */
  public step(dt: number): number {
    const clampedDt = Math.min(dt, 0.1); // Prevent explosion on large frame drops
    const delta = this.value - this.target;

    // Critically damped spring: acceleration = -omega^2 * delta - 2 * omega * velocity
    const springForce = -this.omega * this.omega * delta;
    const dampingForce = -2.0 * this.omega * this.velocity;
    const acceleration = springForce + dampingForce;

    this.velocity += acceleration * clampedDt;
    this.value += this.velocity * clampedDt;

    // Settle to rest when near target
    if (Math.abs(this.value - this.target) < 0.005 && Math.abs(this.velocity) < 0.005) {
      this.value = this.target;
      this.velocity = 0;
    }

    return this.value;
  }

  public isSettled(): boolean {
    return this.value === this.target && this.velocity === 0;
  }
}
