"use strict";
/* ================= Version detection ================= */
class BinReader {
  constructor(u8) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = 0; }
  byte() { if (this.p >= this.u8.length) throw new Error("EOF"); return this.dv.getInt8(this.p++); }
  ubyte() { if (this.p >= this.u8.length) throw new Error("EOF"); return this.u8[this.p++]; }
  bool() { return this.ubyte() !== 0; }
  short() { const v = this.dv.getInt16(this.p); this.p += 2; return v; }
  int32() { const v = this.dv.getInt32(this.p); this.p += 4; return v; }
  float() { const v = this.dv.getFloat32(this.p); this.p += 4; return v; }
  varint(optimizePositive = true) {
    let b = this.ubyte(), r = b & 0x7f;
    if (b & 0x80) { b = this.ubyte(); r |= (b & 0x7f) << 7;
      if (b & 0x80) { b = this.ubyte(); r |= (b & 0x7f) << 14;
        if (b & 0x80) { b = this.ubyte(); r |= (b & 0x7f) << 21;
          if (b & 0x80) { b = this.ubyte(); r |= (b & 0x7f) << 28; } } } }
    return optimizePositive ? r >>> 0 : ((r >>> 1) ^ -(r & 1));
  }
  string() {
    let n = this.varint(true);
    if (n === 0) return null; if (n === 1) return "";
    n--; if (this.p + n > this.u8.length) throw new Error("EOF");
    const s = new TextDecoder().decode(this.u8.subarray(this.p, this.p + n)); this.p += n; return s;
  }
}
const VERSION_RE = /^(\d+)\.(\d+)(\.[\w-]+)?/;
/** Đọc version Spine từ header file .skel (3.x và 4.x có cấu trúc header khác nhau). */
function detectBinaryVersion(u8) {
  // 4.x: hash 8 byte (2x int32) rồi version string
  try { const r = new BinReader(u8); r.p = 8; const v = r.string(); if (v && VERSION_RE.test(v) && v.length < 24) return v; } catch (e) {}
  // 3.x: hash string rồi version string
  try { const r = new BinReader(u8); const h = r.string(); if (h == null || h.length < 64) { const v = r.string(); if (v && VERSION_RE.test(v) && v.length < 24) return v; } } catch (e) {}
  return null;
}
