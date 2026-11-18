// The World in One Image — Wednesday 18 November 2026.
// A one-page newspaper poster of the day's world news, drawn entirely
// in code: own PNG encoder, own bitmap type, own geometric icons.
// Node standard library only. Deterministic: same bytes on every run.
// Stories cross-checked on the day against Reuters, AP, the UN, CBS,
// Al Jazeera and the day's news roundups.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const td = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  dv.setUint32(8 + data.length, crc32(td));
  return out;
}

function encodePng(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

type Rgb = [number, number, number];
const PAPER: Rgb = [246, 241, 228];
const INK: Rgb = [18, 18, 20];
const RED: Rgb = [178, 30, 38];
const BLUE: Rgb = [30, 74, 138];
const GOLD: Rgb = [176, 124, 18];
const GREEN: Rgb = [26, 110, 62];
const TEAL: Rgb = [12, 106, 118];
const WHITE: Rgb = [255, 255, 255];
const GREY: Rgb = [92, 90, 84];

function setPx(x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: Rgb): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPx(xx, yy, c);
}

function frameRect(x: number, y: number, w: number, h: number, t: number, c: Rgb): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function fillCircle(cx: number, cy: number, r: number, c: Rgb): void {
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) setPx(xx, yy, c);
    }
}

function ringCircle(cx: number, cy: number, r: number, t: number, c: Rgb): void {
  for (let yy = cy - r - t; yy <= cy + r + t; yy++)
    for (let xx = cx - r - t; xx <= cx + r + t; xx++) {
      const d = Math.sqrt((xx - cx) ** 2 + (yy - cy) ** 2);
      if (d >= r - t && d <= r + t) setPx(xx, yy, c);
    }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: Rgb): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r = Math.floor(t / 2);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    fillRect(x - r, y - r, t, t, c);
  }
}

function triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: Rgb): void {
  const minX = Math.max(0, Math.min(x0, x1, x2));
  const maxX = Math.min(W - 1, Math.max(x0, x1, x2));
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / area;
      const w1 = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPx(x, y, c);
    }
}

// ---------------------------------------------------------------- type
// A 5x7 bitmap face drawn for this poster. '#' is ink, '.' is paper.
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", ".#.#.", "..#..", ".#.#.", ".#.#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": [".##..", ".##..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", ".#...", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#...", "#..##"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

function glyph(ch: string): string[] {
  const up = ch.toUpperCase();
  if (up === "–" || up === "—") return GLYPHS["-"];
  if (up === "·") return GLYPHS["."];
  return GLYPHS[up] ?? GLYPHS["?"];
}

// scale = pixels per bitmap cell. Returns the advance width of the string.
function textWidth(s: string, scale: number): number {
  return s.length === 0 ? 0 : s.length * 6 * scale - scale;
}

function drawText(x: number, y: number, s: string, scale: number, c: Rgb): number {
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "#") fillRect(cx + col * scale, y + r * scale, scale, scale, c);
    cx += 6 * scale;
  }
  return cx - scale;
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, c: Rgb): void {
  drawText(Math.round(cx - textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap to a maximum width in pixels; returns the lines.
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text; returns the y just below the last line.
function drawWrapped(x: number, y: number, s: string, scale: number, c: Rgb, maxW: number, leading: number): number {
  const lines = wrap(s, scale, maxW);
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += 7 * scale + leading;
  }
  return yy;
}

// ---------------------------------------------------------------- icons
function burst(cx: number, cy: number, r: number, c: Rgb): void {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    thickLine(
      Math.round(cx + Math.cos(a) * r * 0.35),
      Math.round(cy + Math.sin(a) * r * 0.35),
      Math.round(cx + Math.cos(a) * r),
      Math.round(cy + Math.sin(a) * r),
      7,
      c,
    );
  }
  fillCircle(cx, cy, 10, c);
}

function jet(cx: number, cy: number, c: Rgb): void {
  thickLine(cx - 95, cy, cx + 55, cy, 13, c); // fuselage
  triangle(cx + 55, cy - 12, cx + 55, cy + 12, cx + 100, cy, c); // nose
  triangle(cx - 5, cy, cx - 45, cy - 52, cx - 62, cy - 52, c); // wing up
  triangle(cx - 5, cy, cx - 45, cy + 52, cx - 62, cy + 52, c); // wing down
  triangle(cx - 95, cy, cx - 118, cy - 30, cx - 118, cy, c); // tail fin
  fillCircle(cx + 30, cy, 7, PAPER); // cockpit dot
}

function island(cx: number, cy: number, c: Rgb): void {
  fillRect(cx - 110, cy + 26, 220, 10, c);
  fillRect(cx - 88, cy + 16, 176, 10, c);
  fillRect(cx - 55, cy + 6, 110, 10, c);
}

// ---------------------------------------------------------------- panels
function panel(x: number, y: number, w: number, h: number, bar: Rgb, kicker: string, num: string): void {
  fillRect(x, y, w, h, WHITE);
  frameRect(x, y, w, h, 3, INK);
  fillRect(x, y, w, 38, bar);
  drawText(x + 16, y + 9, kicker, 3, WHITE);
  const nw = textWidth(num, 3);
  drawText(x + w - 16 - nw, y + 9, num, 3, WHITE);
}

function story(
  x: number, y: number, w: number, h: number, bar: Rgb, kicker: string, num: string,
  headline: string, headScale: number, headW: number, body: string, bodyW: number,
): void {
  panel(x, y, w, h, bar, kicker, num);
  const afterHead = drawWrapped(x + 16, y + 50, headline, headScale, INK, headW, 8);
  drawWrapped(x + 16, afterHead + 4, body, 3, GREY, bodyW, 5);
}

// ---------------------------------------------------------------- poster
fillRect(0, 0, W, H, PAPER);
frameRect(16, 16, W - 32, H - 32, 5, INK);

// Masthead
drawTextCentered(W / 2, 36, "THE WORLD IN ONE IMAGE", 3, INK);
fillRect(232, 66, W - 464, 5, RED);
drawTextCentered(W / 2, 82, "18 NOVEMBER 2026", 10, INK);
drawTextCentered(W / 2, 162, "WEDNESDAY - ALL THE DAY'S NEWS ON ONE PAGE", 3, GREY);
fillRect(32, 192, W - 64, 6, INK);

// Hero: the Gulf strikes
panel(32, 206, W - 64, 216, RED, "MIDDLE EAST - CONFLICT", "01");
{
  const afterHead = drawWrapped(48, 256, "U.S. STRIKES IRAN'S QESHM ISLAND", 6, INK, 690, 8);
  drawWrapped(48, afterHead + 4, "IRAN ANSWERS WITH DRONES ON U.S. BASES IN BAHRAIN + KUWAIT", 3, GREY, 660, 5);
  jet(856, 300, INK);
  island(856, 362, RED);
  burst(758, 338, 30, RED);
}

// Row two: Crimea Bridge and the Shenzhen summit
story(32, 438, 472, 208, BLUE, "EUROPE - WAR", "02",
  "UKRAINE HITS CRIMEA BRIDGE", 4, 440,
  "SECOND-DAY STRIKE DROPS THE ROAD SPAN INTO THE KERCH STRAIT", 440);
story(520, 438, 472, 208, GOLD, "ASIA - DIPLOMACY", "03",
  "XI HOSTS PUTIN IN SHENZHEN", 4, 440,
  "TRUMP JOINS THURSDAY FOR THE FIRST U.S.-CHINA-RUSSIA SUMMIT", 440);

// Row three: Ebola and the U.S. Senate
story(32, 662, 472, 208, GREEN, "AFRICA - HEALTH", "04",
  "EBOLA PASSES 11,000 CASES", 4, 440,
  "IN DR CONGO: 5,400+ DEAD, CASES DOUBLED IN 3 MONTHS - UN", 440);
story(520, 662, 472, 208, TEAL, "AMERICAS - POLITICS", "05",
  "PELTOLA WINS ALASKA", 4, 440,
  "SENATE GOES 56-44 TO DEMOCRATS; U.S. LOSES MEASLES-FREE STATUS", 440);

// Ticker: the rest of the day in brief
fillRect(32, 886, W - 64, 106, INK);
drawTextCentered(W / 2, 892, "IN BRIEF - NVIDIA POSTS RECORD 115.8BN DOLLAR SALES", 3, WHITE);
drawTextCentered(W / 2, 917, "CATEGORY 5 CYCLONE XAVIER HITS THE COOK ISLANDS", 3, WHITE);
drawTextCentered(W / 2, 942, "SIBERIA PLANE CRASH KILLS 19 - COP31 IN ANTALYA", 3, WHITE);
drawTextCentered(W / 2, 967, "WORLD COURT TO RULE ON MYANMAR GENOCIDE CASE", 3, WHITE);

// ---------------------------------------------------------------- output
const outDir = process.env.ENTRY_OUT ?? "/output";
try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePng(W, H, px));
} catch {
  mkdirSync("output", { recursive: true });
  writeFileSync(join("output", "entry.png"), encodePng(W, H, px));
}
