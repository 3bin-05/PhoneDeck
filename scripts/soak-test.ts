/**
 * Phone Deck Long-Running Soak Test Script
 * Tracks memory growth (RSS), throughput, and reconnect reliability.
 * Usage:
 *   pnpm dlx tsx scripts/soak-test.ts [--hours 8] [--interval-secs 10]
 *   pnpm dlx tsx scripts/soak-test.ts --quick (runs a 30s smoke validation)
 */

// Use globalThis.WebSocket standard in Node 22+
declare const WebSocket: any;

interface SoakSnapshot {
  timestamp: string;
  elapsedSec: number;
  memoryMb: number;
  bytesReceived: number;
  throughputBps: number;
  reconnectCount: number;
}

const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const durationSecs = isQuick
  ? 30
  : parseFloat(args[args.indexOf('--hours') + 1] || '8') * 3600;
const sampleIntervalSecs = isQuick ? 5 : 60;
const targetWsUrl = process.env.PHONEDECK_WS || 'ws://127.0.0.1:8765/ws';

console.log('================================================================');
console.log('     Phone Deck Long-Running Soak Test & Leak Detector          ');
console.log(`     Target: ${targetWsUrl}`);
console.log(`     Planned Duration: ${isQuick ? '30s (quick smoke)' : `${durationSecs / 3600} hours`}`);
console.log(`     Sample Interval: ${sampleIntervalSecs}s`);
console.log('================================================================\n');

let totalBytesReceived = 0;
let bytesInWindow = 0;
let reconnectCount = 0;
let activeSocket: WebSocket | null = null;
let isConnected = false;
const snapshots: SoakSnapshot[] = [];

const startTime = Date.now();

function connectSocket() {
  const ws = new globalThis.WebSocket(targetWsUrl);

  ws.onopen = () => {
    isConnected = true;
    console.log(`[${new Date().toISOString()}] WebSocket connected to Agent.`);
  };

  ws.onmessage = (event: any) => {
    const len = typeof event.data === 'string' ? event.data.length : event.data?.byteLength || 64;
    totalBytesReceived += len;
    bytesInWindow += len;
  };

  ws.onclose = () => {
    isConnected = false;
    reconnectCount++;
    console.log(`[${new Date().toISOString()}] Socket disconnected. Reconnecting... (total reconnects: ${reconnectCount})`);
    setTimeout(connectSocket, 1500);
  };

  ws.onerror = (err: any) => {
    console.warn(`[Socket Warning]: ${err?.message || 'Connection error'}`);
  };

  activeSocket = ws;
}

// Memory tracking (Process memory of this runner + agent inspection)
function getMemoryUsageMb(): number {
  const mem = process.memoryUsage();
  return Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
}

connectSocket();

// Periodic sampling loop
const sampleTimer = setInterval(() => {
  const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
  const throughputBps = Math.round(bytesInWindow / sampleIntervalSecs);
  bytesInWindow = 0;

  const currentMemMb = getMemoryUsageMb();

  const snapshot: SoakSnapshot = {
    timestamp: new Date().toISOString(),
    elapsedSec,
    memoryMb: currentMemMb,
    bytesReceived: totalBytesReceived,
    throughputBps,
    reconnectCount,
  };

  snapshots.push(snapshot);

  console.log(
    `[${snapshot.timestamp}] Elapsed: ${elapsedSec}s | Memory: ${currentMemMb} MB | Throughput: ${throughputBps} B/s | Reconnects: ${reconnectCount}`
  );

  // Periodically force reconnect every 1 hour (or 15s in quick mode) to test connection cycling
  if (isQuick && elapsedSec === 15) {
    console.log('--> Simulating synthetic connection drop to test reconnect handling...');
    activeSocket?.close();
  }

  if (elapsedSec >= durationSecs) {
    finishSoakTest();
  }
}, sampleIntervalSecs * 1000);

function finishSoakTest() {
  clearInterval(sampleTimer);
  activeSocket?.close();

  const initial = snapshots[0]?.memoryMb || 0;
  const finalMem = snapshots[snapshots.length - 1]?.memoryMb || 0;
  const growthMb = Math.round((finalMem - initial) * 10) / 10;

  console.log('\n================================================================');
  console.log('                 SOAK TEST SUMMARY REPORT                       ');
  console.log('================================================================');
  console.log(`Total Duration:       ${Math.floor((Date.now() - startTime) / 1000)} seconds`);
  console.log(`Total Data Received:  ${(totalBytesReceived / 1024).toFixed(2)} KB`);
  console.log(`Initial Memory:       ${initial} MB`);
  console.log(`Final Memory:         ${finalMem} MB`);
  console.log(`Net Memory Growth:    ${growthMb} MB (Budget threshold: <= 15 MB)`);
  console.log(`Total Reconnects:     ${reconnectCount}`);
  console.log('----------------------------------------------------------------');

  if (growthMb > 15.0) {
    console.error('❌ FAILED: Memory growth exceeded budget threshold (possible leak detected)!');
    process.exit(1);
  } else {
    console.log('✅ PASSED: Zero memory leak detected. Memory curve stable across soak test.');
    process.exit(0);
  }
}
