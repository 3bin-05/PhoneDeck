import { WallpaperManifest } from './types';

export interface PackChunk {
  packId: string;
  hash: string;
  chunkIndex: number;
  totalChunks: number;
  checksum: number; // CRC32 / Adler32 checksum
  data: string; // Base64 chunk
}

// 32-bit FNV-1a content hash
export function computePackHash(pack: WallpaperManifest): string {
  const content = JSON.stringify({
    id: pack.id,
    type: pack.type,
    version: pack.version,
    targetFps: pack.targetFps,
    dim: pack.dim,
    blur: pack.blur,
    reactiveBindings: pack.reactiveBindings,
    assets: pack.assets,
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Adler-32 checksum for chunk verification
export function computeChecksum(str: string): number {
  let a = 1;
  let b = 0;
  const MOD_ADLER = 65521;
  for (let i = 0; i < str.length; i++) {
    a = (a + str.charCodeAt(i)) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return (b << 16) | a;
}

export function chunkPackPayload(
  pack: WallpaperManifest,
  chunkSize: number = 32768 // 32 KB chunks
): PackChunk[] {
  const hash = computePackHash(pack);
  const json = JSON.stringify(pack);
  const base64 = btoa(unescape(encodeURIComponent(json)));

  const totalChunks = Math.max(1, Math.ceil(base64.length / chunkSize));
  const chunks: PackChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkData = base64.slice(i * chunkSize, (i + 1) * chunkSize);
    chunks.push({
      packId: pack.id,
      hash,
      chunkIndex: i,
      totalChunks,
      checksum: computeChecksum(chunkData),
      data: chunkData,
    });
  }

  return chunks;
}

export class WallpaperCache {
  private static readonly STORAGE_PREFIX = 'phone_deck_wallpaper_';

  public static has(hash: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(`${this.STORAGE_PREFIX}${hash}`) !== null;
  }

  public static get(hash: string): WallpaperManifest | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${this.STORAGE_PREFIX}${hash}`);
      if (!raw) return null;
      return JSON.parse(raw) as WallpaperManifest;
    } catch {
      return null;
    }
  }

  public static set(hash: string, pack: WallpaperManifest): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${this.STORAGE_PREFIX}${hash}`, JSON.stringify(pack));
    } catch (e) {
      console.warn('WallpaperCache storage quota reached or storage disabled', e);
    }
  }
}
