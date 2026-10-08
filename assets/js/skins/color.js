const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));

export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(c => clamp255(c).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsv([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : delta / max, max];
}

export function hsvToRgb([h, s, v]) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else { r = c; b = x; }
  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)];
}

function toLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function fromLinear(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp255(c * 255);
}

export function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [
    fromLinear(Math.max(0, Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s))),
    fromLinear(Math.max(0, Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s))),
    fromLinear(Math.max(0, Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)))
  ];
}

export function oklabToOklch([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = C < 1e-9 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab([L, C, h]) {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function mixOklab(rgbA, rgbB, t) {
  if (t <= 0) return [rgbA[0], rgbA[1], rgbA[2]];
  if (t >= 1) return [rgbB[0], rgbB[1], rgbB[2]];
  const a = rgbToOklab(rgbA);
  const b = rgbToOklab(rgbB);
  return oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export function distance(rgbA, rgbB) {
  const a = rgbToOklab(rgbA);
  const b = rgbToOklab(rgbB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
