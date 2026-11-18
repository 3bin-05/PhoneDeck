import React from 'react';

// Format bytes into human readable KB / MB / GB
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export interface MemoryDisksProps {
  ramUsedBytes: number;
  ramTotalBytes: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
}

export const MemoryDisksWidget: React.FC<MemoryDisksProps> = React.memo(
  ({
    ramUsedBytes,
    ramTotalBytes,
    diskUsedBytes = 512 * 1024 * 1024 * 1024,
    diskTotalBytes = 1024 * 1024 * 1024 * 1024,
  }) => {
    const safeRamTotal = Math.max(1, ramTotalBytes);
    const ramPct = Math.min(100, Math.round((ramUsedBytes / safeRamTotal) * 100));

    const safeDiskTotal = Math.max(1, diskTotalBytes);
    const diskPct = Math.min(100, Math.round((diskUsedBytes / safeDiskTotal) * 100));

    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>MEMORY & STORAGE</span>
          <span className="text-[#EDEDF2] font-mono">{ramPct}% RAM</span>
        </div>

        <div className="space-y-3 my-auto">
          {/* RAM Progress */}
          <div>
            <div className="flex justify-between text-[11px] font-mono mb-1">
              <span className="text-[#EDEDF2]">RAM</span>
              <span className="text-[#71717A] tabular-nums">
                {formatBytes(ramUsedBytes)} / {formatBytes(ramTotalBytes)}
              </span>
            </div>
            <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7C5CFF] rounded-full transition-all duration-300"
                style={{ width: `${ramPct}%` }}
              />
            </div>
          </div>

          {/* DISK Progress */}
          <div>
            <div className="flex justify-between text-[11px] font-mono mb-1">
              <span className="text-[#EDEDF2]">NVMe SSD</span>
              <span className="text-[#71717A] tabular-nums">
                {formatBytes(diskUsedBytes)} / {formatBytes(diskTotalBytes)}
              </span>
            </div>
            <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00E599] rounded-full transition-all duration-300"
                style={{ width: `${diskPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <span>STORAGE HEALTH: 100%</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
        </div>
      </div>
    );
  }
);
MemoryDisksWidget.displayName = 'MemoryDisksWidget';

export interface NetworkIoProps {
  inBytesSec: number;
  outBytesSec: number;
}

export const NetworkIoWidget: React.FC<NetworkIoProps> = React.memo(
  ({ inBytesSec, outBytesSec }) => {
    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>NETWORK I/O</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
        </div>

        <div className="grid grid-cols-2 gap-2 my-auto">
          {/* In / Download */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-1 text-[10px] font-mono text-[#71717A]">
              <span className="text-[#00E599]">↓</span>
              <span>IN (DL)</span>
            </div>
            <span className="font-mono text-xl md:text-2xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
              {formatBytes(inBytesSec)}/s
            </span>
          </div>

          {/* Out / Upload */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-1 text-[10px] font-mono text-[#71717A]">
              <span className="text-[#7C5CFF]">↑</span>
              <span>OUT (UL)</span>
            </div>
            <span className="font-mono text-xl md:text-2xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
              {formatBytes(outBytesSec)}/s
            </span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#71717A] flex items-center justify-between">
          <span>THROUGHPUT</span>
          <span className="text-[#EDEDF2]">LAN WI-FI 6</span>
        </div>
      </div>
    );
  }
);
NetworkIoWidget.displayName = 'NetworkIoWidget';

export interface ProcessItem {
  name: string;
  cpuPct: number;
  ramBytes: number;
}

export interface TopProcessesProps {
  processes?: ProcessItem[];
}

export const TopProcessesWidget: React.FC<TopProcessesProps> = React.memo(
  ({
    processes = [
      { name: 'rustc.exe', cpuPct: 14.8, ramBytes: 1024 * 1024 * 1024 * 1.8 },
      { name: 'Code.exe', cpuPct: 6.2, ramBytes: 1024 * 1024 * 840 },
      { name: 'chrome.exe', cpuPct: 4.1, ramBytes: 1024 * 1024 * 1250 },
      { name: 'deck-agent.exe', cpuPct: 0.1, ramBytes: 1024 * 1024 * 42 },
    ],
  }) => {
    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>TOP PROCESSES</span>
          <span className="text-[#EDEDF2] font-mono">CPU / RAM</span>
        </div>

        <div className="space-y-1.5 my-1 overflow-hidden">
          {processes.slice(0, 4).map((proc, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-xs font-mono py-0.5 border-b border-white/[0.04] last:border-0"
            >
              <span className="truncate max-w-[140px] text-[#EDEDF2]">
                {proc.name}
              </span>
              <div className="flex items-center space-x-3 tabular-nums">
                <span className="text-[#7C5CFF]">
                  {proc.cpuPct.toFixed(1)}%
                </span>
                <span className="text-[#71717A]">
                  {formatBytes(proc.ramBytes, 0)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <span>ON-DEMAND POLLING</span>
          <span className="text-[#00E599]">TTL 2S CACHED</span>
        </div>
      </div>
    );
  }
);
TopProcessesWidget.displayName = 'TopProcessesWidget';

export interface SystemUptimeProps {
  uptimeSeconds: number;
}

export const SystemUptimeWidget: React.FC<SystemUptimeProps> = React.memo(
  ({ uptimeSeconds }) => {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    const secs = Math.floor(uptimeSeconds % 60);

    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>SYSTEM UPTIME</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
        </div>

        <div className="font-mono text-2xl md:text-3xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
          {days}d {hours.toString().padStart(2, '0')}:
          {mins.toString().padStart(2, '0')}:
          {secs.toString().padStart(2, '0')}
        </div>

        <div className="text-[10px] font-mono text-[#71717A] flex items-center justify-between">
          <span>HOST STATUS</span>
          <span className="text-[#00E599]">ONLINE</span>
        </div>
      </div>
    );
  }
);
SystemUptimeWidget.displayName = 'SystemUptimeWidget';

export interface PhoneStatusProps {
  batteryPct?: number;
  isCharging?: boolean;
  tempC?: number;
}

export const PhoneStatusWidget: React.FC<PhoneStatusProps> = React.memo(
  ({ batteryPct = 85, isCharging = true, tempC = 31.4 }) => {
    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>PHONE DECK DEVICE</span>
          <span className="text-[#00E599] font-mono">
            {isCharging ? '⚡ CHARGING' : 'BATTERY'}
          </span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="font-mono text-3xl md:text-4xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {batteryPct}
          </span>
          <span className="font-mono text-xs text-[#71717A]">%</span>
          <span className="text-xs font-mono text-[#71717A] ml-auto">
            {tempC.toFixed(1)}°C
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <span>BATTERY CARE: 80% CAP</span>
          <span className="text-[#00E599]">COOL</span>
        </div>
      </div>
    );
  }
);
PhoneStatusWidget.displayName = 'PhoneStatusWidget';
