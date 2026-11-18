export type SolarPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface SolarState {
  phase: SolarPhase;
  warmthFactor: number; // 0.0 (deep midnight cool) to 1.0 (golden hour warmth)
  ambientDim: number; // Night dimming modifier
}

export class TimeOfDayManager {
  public static getSolarState(date: Date = new Date()): SolarState {
    const hours = date.getHours() + date.getMinutes() / 60;

    // Dawn: 05:00 - 08:00
    if (hours >= 5 && hours < 8) {
      const progress = (hours - 5) / 3;
      return {
        phase: 'dawn',
        warmthFactor: 0.4 + progress * 0.4,
        ambientDim: 0.6 + progress * 0.4,
      };
    }
    // Day: 08:00 - 18:00
    else if (hours >= 8 && hours < 18) {
      return {
        phase: 'day',
        warmthFactor: 0.5,
        ambientDim: 1.0,
      };
    }
    // Dusk / Golden Hour: 18:00 - 21:00
    else if (hours >= 18 && hours < 21) {
      const progress = (hours - 18) / 3;
      return {
        phase: 'dusk',
        warmthFactor: 0.9 - progress * 0.5,
        ambientDim: 1.0 - progress * 0.4,
      };
    }
    // Night: 21:00 - 05:00
    else {
      return {
        phase: 'night',
        warmthFactor: 0.1,
        ambientDim: 0.45,
      };
    }
  }
}
