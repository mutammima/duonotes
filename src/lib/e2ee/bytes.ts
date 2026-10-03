/**
 * Byte helpers for the e2ee units. UTF-8 is implemented here rather than via
 * TextEncoder/TextDecoder because Hermes' TextDecoder support varies across RN
 * versions; everything decoded here is our own authenticated output.
 */
export type Bytes = Uint8Array;

export function utf8(s: string): Bytes {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate, as TextEncoder does
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function fromUtf8(b: Bytes): string {
  let s = '';
  const units: number[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let cp: number;
    let need: number;
    if (x < 0x80) [cp, need] = [x, 0];
    else if (x >= 0xc2 && x < 0xe0) [cp, need] = [x & 31, 1];
    else if (x >= 0xe0 && x < 0xf0) [cp, need] = [x & 15, 2];
    else if (x >= 0xf0 && x < 0xf5) [cp, need] = [x & 7, 3];
    else throw new Error('invalid utf-8');
    if (need && i + need >= b.length) throw new Error('invalid utf-8');
    for (let k = 1; k <= need; k++) {
      const y = b[i + k];
      if ((y & 0xc0) !== 0x80) throw new Error('invalid utf-8');
      cp = (cp << 6) | (y & 63);
    }
    if (need === 2 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) throw new Error('invalid utf-8');
    if (need === 3 && (cp < 0x10000 || cp > 0x10ffff)) throw new Error('invalid utf-8');
    if (cp < 0x10000) units.push(cp);
    else {
      cp -= 0x10000;
      units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    }
    if (units.length >= 8192) {
      s += String.fromCharCode(...units);
      units.length = 0;
    }
    i += need + 1;
  }
  return s + String.fromCharCode(...units);
}

export function toB64(b: Bytes): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromB64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(b: Bytes): string {
  let h = '';
  for (const x of b) h += x.toString(16).padStart(2, '0');
  return h;
}

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function compareBytes(a: Bytes, b: Bytes): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
