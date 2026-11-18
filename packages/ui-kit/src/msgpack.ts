/**
 * Lightweight, zero-dependency MessagePack decoder for Phone Deck.
 * Decodes envelopes and telemetry deltas streamed by `crates/protocol` / `deck-mock`.
 */

export function decodeMsgPack(buffer: ArrayBuffer | Uint8Array): any {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const textDecoder = new TextDecoder("utf-8");
  let offset = 0;

  function decode(): any {
    if (offset >= bytes.length) {
      throw new Error("Unexpected end of MessagePack buffer");
    }

    const byte = bytes[offset++];

    // Positive fixint (0x00 - 0x7f)
    if (byte <= 0x7f) {
      return byte;
    }

    // Fixmap (0x80 - 0x8f)
    if (byte >= 0x80 && byte <= 0x8f) {
      const size = byte & 0x0f;
      return decodeMap(size);
    }

    // Fixarray (0x90 - 0x9f)
    if (byte >= 0x90 && byte <= 0x9f) {
      const size = byte & 0x0f;
      return decodeArray(size);
    }

    // Fixstr (0xa0 - 0xbf)
    if (byte >= 0xa0 && byte <= 0xbf) {
      const len = byte & 0x1f;
      return decodeString(len);
    }

    // Negative fixint (0xe0 - 0xff)
    if (byte >= 0xe0) {
      return byte - 0x100;
    }

    switch (byte) {
      case 0xc0: // nil
        return null;
      case 0xc2: // false
        return false;
      case 0xc3: // true
        return true;
      case 0xca: { // float 32
        const val = view.getFloat32(offset);
        offset += 4;
        return val;
      }
      case 0xcb: { // float 64
        const val = view.getFloat64(offset);
        offset += 8;
        return val;
      }
      case 0xcc: { // uint8
        return bytes[offset++];
      }
      case 0xcd: { // uint16
        const val = view.getUint16(offset);
        offset += 2;
        return val;
      }
      case 0xce: { // uint32
        const val = view.getUint32(offset);
        offset += 4;
        return val;
      }
      case 0xcf: { // uint64
        // rmp-serde encodes large u64 as big-endian
        const hi = view.getUint32(offset);
        const lo = view.getUint32(offset + 4);
        offset += 8;
        if (hi === 0) return lo;
        return Number((BigInt(hi) << 32n) | BigInt(lo));
      }
      case 0xd0: { // int8
        const val = view.getInt8(offset);
        offset += 1;
        return val;
      }
      case 0xd1: { // int16
        const val = view.getInt16(offset);
        offset += 2;
        return val;
      }
      case 0xd2: { // int32
        const val = view.getInt32(offset);
        offset += 4;
        return val;
      }
      case 0xd3: { // int64
        const hi = view.getInt32(offset);
        const lo = view.getUint32(offset + 4);
        offset += 8;
        return Number((BigInt(hi) << 32n) | BigInt(lo));
      }
      case 0xd9: { // str8
        const len = bytes[offset++];
        return decodeString(len);
      }
      case 0xda: { // str16
        const len = view.getUint16(offset);
        offset += 2;
        return decodeString(len);
      }
      case 0xdb: { // str32
        const len = view.getUint32(offset);
        offset += 4;
        return decodeString(len);
      }
      case 0xdc: { // array16
        const size = view.getUint16(offset);
        offset += 2;
        return decodeArray(size);
      }
      case 0xdd: { // array32
        const size = view.getUint32(offset);
        offset += 4;
        return decodeArray(size);
      }
      case 0xde: { // map16
        const size = view.getUint16(offset);
        offset += 2;
        return decodeMap(size);
      }
      case 0xdf: { // map32
        const size = view.getUint32(offset);
        offset += 4;
        return decodeMap(size);
      }
      default:
        throw new Error(`Unsupported MessagePack tag 0x${byte.toString(16)} at offset ${offset - 1}`);
    }
  }

  function decodeString(length: number): string {
    const slice = bytes.subarray(offset, offset + length);
    offset += length;
    return textDecoder.decode(slice);
  }

  function decodeArray(size: number): any[] {
    const arr = new Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = decode();
    }
    return arr;
  }

  function decodeMap(size: number): Record<string | number, any> {
    const obj: Record<string | number, any> = {};
    for (let i = 0; i < size; i++) {
      const key = decode();
      const val = decode();
      obj[key] = val;
    }
    return obj;
  }

  return decode();
}
