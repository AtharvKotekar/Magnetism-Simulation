// Minimal store-only (no compression) ZIP writer — fallback for PNG sequences
// when the File System Access API is unavailable. PNGs are already deflated,
// so store-only loses nothing.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class ZipStore {
  constructor() {
    this.parts = [];
    this.central = [];
    this.offset = 0;
  }

  add(name, bytes) {
    const nameB = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);         // version needed
    local.setUint16(6, 0, true);          // flags
    local.setUint16(8, 0, true);          // method: store
    local.setUint16(10, 0, true);         // time
    local.setUint16(12, 0, true);         // date
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameB.length, true);
    local.setUint16(28, 0, true);
    this.parts.push(new Uint8Array(local.buffer), nameB, bytes);
    this.central.push({ nameB, crc, size: bytes.length, offset: this.offset });
    this.offset += 30 + nameB.length + bytes.length;
  }

  finalize() {
    const cdStart = this.offset;
    for (const e of this.central) {
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(10, 0, true);          // store
      cd.setUint32(16, e.crc, true);
      cd.setUint32(20, e.size, true);
      cd.setUint32(24, e.size, true);
      cd.setUint16(28, e.nameB.length, true);
      cd.setUint32(42, e.offset, true);
      this.parts.push(new Uint8Array(cd.buffer), e.nameB);
      this.offset += 46 + e.nameB.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.central.length, true);
    end.setUint16(10, this.central.length, true);
    end.setUint32(12, this.offset - cdStart, true);
    end.setUint32(16, cdStart, true);
    this.parts.push(new Uint8Array(end.buffer));
    return new Blob(this.parts, { type: 'application/zip' });
  }
}
