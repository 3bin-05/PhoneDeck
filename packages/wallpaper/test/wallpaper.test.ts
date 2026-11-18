import test from 'node:test';
import assert from 'node:assert/strict';
import { WallpaperGovernor } from '../src/governor.ts';
import {
  computePackHash,
  computeChecksum,
  chunkPackPayload,
} from '../src/packManager.ts';
import { BUILTIN_WALLPAPERS, DEFAULT_WALLPAPER } from '../src/presets.ts';
import { TimeOfDayManager } from '../src/renderers/TimeOfDayManager.ts';
import { GovernorInputs } from '../src/types.ts';

const defaultInputs: GovernorInputs = {
  batteryLevel: 90,
  isCharging: true,
  thermalStatus: 0,
  isDimmed: false,
  pageWeight: 4,
  pageVisibility: true,
};

test('WallpaperGovernor - default tier and state', () => {
  const gov = new WallpaperGovernor('balanced');
  const state = gov.update(defaultInputs);

  assert.equal(state.tier, 'balanced');
  assert.equal(state.effectiveFps, 24);
  assert.equal(state.scale, 0.75);
  assert.ok(Math.abs(state.driftX) <= 6.0);
  assert.ok(Math.abs(state.driftY) <= 6.0);
});

test('WallpaperGovernor - hidden visibility drops to static', () => {
  const gov = new WallpaperGovernor('high');
  const state = gov.update({ ...defaultInputs, pageVisibility: false });

  assert.equal(state.tier, 'static');
  assert.equal(state.effectiveFps, 0);
  assert.match(state.reason, /Page Visibility/);
});

test('WallpaperGovernor - night mode dimmed drops to static', () => {
  const gov = new WallpaperGovernor('high');
  const state = gov.update({ ...defaultInputs, isDimmed: true });

  assert.equal(state.tier, 'static');
  assert.equal(state.effectiveFps, 0);
  assert.match(state.reason, /Dimmed/);
});

test('WallpaperGovernor - severe thermal status forces static protection', () => {
  const gov = new WallpaperGovernor('high');
  const state = gov.update({ ...defaultInputs, thermalStatus: 3 });

  assert.equal(state.tier, 'static');
  assert.match(state.reason, /thermal/i);
});

test('WallpaperGovernor - moderate thermal status caps tier at eco', () => {
  const gov = new WallpaperGovernor('high');
  const state = gov.update({ ...defaultInputs, thermalStatus: 2 });

  assert.equal(state.tier, 'eco');
  assert.equal(state.effectiveFps, 12);
});

test('WallpaperGovernor - low battery without charging caps tier at eco', () => {
  const gov = new WallpaperGovernor('high');
  const state = gov.update({
    ...defaultInputs,
    batteryLevel: 15,
    isCharging: false,
  });

  assert.equal(state.tier, 'eco');
  assert.equal(state.effectiveFps, 12);
});

test('WallpaperGovernor - frame time budget overruns demote tier', () => {
  const gov = new WallpaperGovernor('high');
  gov.update(defaultInputs);

  // Record 30 slow frames (e.g. 15 ms each, well over 8 ms budget)
  for (let i = 0; i < 30; i++) {
    gov.recordFrame(15.0);
  }
  gov.fastForwardCooldown();

  const state = gov.update(defaultInputs);
  assert.ok(state.tier === 'balanced' || state.tier === 'eco');
});

test('packManager - content hash and checksumming', () => {
  const hash1 = computePackHash(DEFAULT_WALLPAPER);
  const hash2 = computePackHash(DEFAULT_WALLPAPER);
  assert.equal(hash1, hash2, 'Hash must be deterministic');
  assert.equal(hash1.length, 8, '32-bit hex hash length is 8');

  const checksum = computeChecksum('test-data-payload');
  assert.ok(checksum > 0);

  const chunks = chunkPackPayload(DEFAULT_WALLPAPER, 1024);
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[0].totalChunks, chunks.length);
  assert.equal(chunks[0].hash, hash1);
});

test('presets - built-in wallpapers validity', () => {
  const keys = Object.keys(BUILTIN_WALLPAPERS);
  assert.ok(keys.length >= 5, 'Should have at least 5 built-in presets');

  for (const key of keys) {
    const pack = BUILTIN_WALLPAPERS[key];
    assert.ok(pack.id, `Preset ${key} must have id`);
    assert.ok(pack.name, `Preset ${key} must have name`);
    assert.ok(pack.targetFps <= 30, `Preset ${key} targetFps must obey <= 30 cap`);
    assert.ok(pack.dim >= 0 && pack.dim <= 1, `Preset ${key} dim must be in 0..1`);

    if (pack.type === 'shader') {
      assert.ok(
        pack.assets?.fragmentShader,
        `Shader preset ${key} must contain fragmentShader source`
      );
    }
  }
});

test('TimeOfDayManager - solar states', () => {
  const dawn = TimeOfDayManager.getSolarState(new Date('2026-11-18T06:30:00'));
  assert.equal(dawn.phase, 'dawn');
  assert.ok(dawn.warmthFactor >= 0.4);

  const day = TimeOfDayManager.getSolarState(new Date('2026-11-18T13:00:00'));
  assert.equal(day.phase, 'day');

  const dusk = TimeOfDayManager.getSolarState(new Date('2026-11-18T19:30:00'));
  assert.equal(dusk.phase, 'dusk');

  const night = TimeOfDayManager.getSolarState(new Date('2026-11-18T23:30:00'));
  assert.equal(night.phase, 'night');
  assert.equal(night.ambientDim, 0.45);
});
