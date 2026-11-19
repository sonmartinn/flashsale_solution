import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const publicFile = (path: string) => new URL(`../public/${path}`, import.meta.url);
const slugs = [
  "ao-thun-cotton-basic", "quan-jeans-slim-fit", "vay-hoa-midi",
  "giay-sneaker-trang", "tui-tote-canvas", "ao-khoac-gio",
];

/** Đọc kích thước từ SOF; giải mã điểm ảnh thật được kiểm tra riêng trên trình duyệt. */
function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "Ảnh phải có chữ ký JPEG");
  assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9, "Ảnh phải tải đầy đủ đến EOI");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    assert.equal(bytes[offset++], 0xff, "Marker JPEG không hợp lệ");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length, "Segment JPEG bị thiếu");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("Không tìm thấy kích thước JPEG");
}

/** cmap format 4 bao phủ các mã Unicode BMP của tiếng Việt. */
function glyphFor(font: Buffer, code: number): number {
  assert.equal(font.readUInt32BE(0), 0x00010000, "Font phải là TrueType");
  const tables = font.readUInt16BE(4);
  let cmap = 0;
  for (let index = 0; index < tables; index++) {
    const entry = 12 + index * 16;
    if (font.toString("ascii", entry, entry + 4) === "cmap") cmap = font.readUInt32BE(entry + 8);
  }
  assert.ok(cmap > 0, "Font thiếu bảng cmap");
  const count = font.readUInt16BE(cmap + 2);
  for (let index = 0; index < count; index++) {
    const record = cmap + 4 + index * 8;
    const platform = font.readUInt16BE(record);
    if (platform !== 0 && !(platform === 3 && font.readUInt16BE(record + 2) === 1)) continue;
    const subtable = cmap + font.readUInt32BE(record + 4);
    if (font.readUInt16BE(subtable) !== 4) continue;
    const segments = font.readUInt16BE(subtable + 6) / 2;
    const ends = subtable + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
      if (code < font.readUInt16BE(starts + segment * 2) || code > font.readUInt16BE(ends + segment * 2)) continue;
      const delta = font.readInt16BE(deltas + segment * 2);
      const range = font.readUInt16BE(ranges + segment * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const position = ranges + segment * 2 + range + 2 * (code - font.readUInt16BE(starts + segment * 2));
      const glyph = font.readUInt16BE(position);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
  }
  return 0;
}

describe("Tài sản local cho bản demo không có mạng", () => {
  for (const slug of slugs) {
    it(`${slug}: JPEG đầy đủ, đủ độ phân giải và trong ngân sách`, () => {
      const path = publicFile(`images/products/${slug}.jpg`);
      const size = statSync(path).size;
      assert.ok(size > 10_000, "Không dùng ảnh rỗng hoặc thumbnail nhỏ");
      assert.ok(size <= (slug === "giay-sneaker-trang" ? 400 : 250) * 1024, "Ảnh vượt ngân sách KiB");
      const { width, height } = jpegDimensions(readFileSync(path));
      assert.ok(width >= 1000 && height >= 720, "Ảnh phải đủ rõ cho màn hình demo");
    });
  }

  it("Cả hai độ đậm của Be Vietnam Pro đều đủ chữ và dấu tiếng Việt", () => {
    const regular = readFileSync(publicFile("assets/fonts/BeVietnamPro-Regular.ttf"));
    const medium = readFileSync(publicFile("assets/fonts/BeVietnamPro-Medium.ttf"));
    const vietnamese = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĂăÂâĐđÊêÔôƠơƯưÀÁÃÈÉÌÍÒÓÕÙÚÝàáãèéìíòóõùúý\u0300\u0301\u0302\u0303\u0306\u0309\u031b\u0323";
    const codes = new Set([...vietnamese].map(character => character.codePointAt(0)!));
    for (let code = 0x1ea0; code <= 0x1ef9; code++) codes.add(code);
    for (const code of codes) {
      assert.ok(glyphFor(regular, code), `Regular thiếu glyph U+${code.toString(16)}`);
      assert.ok(glyphFor(medium, code), `Medium thiếu glyph U+${code.toString(16)}`);
    }
    assert.ok(regular.length + medium.length < 320 * 1024, "Font phải trong ngân sách");
    assert.match(readFileSync(publicFile("assets/fonts/BeVietnamPro-OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE/i);
  });

  it("Font, ảnh hero và sổ nguồn đều có tham chiếu local", () => {
    const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
    const fonts = readFileSync(publicFile("assets/fonts/fonts.css"), "utf8");
    const credits = readFileSync(publicFile("credits.html"), "utf8");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    const ledger = readFileSync(new URL("../ASSETS.md", import.meta.url), "utf8");
    assert.match(main, /import "\.\/styles\/app\.css"/);
    assert.match(fonts, /url\("\/assets\/fonts\/BeVietnamPro-Regular\.ttf"\)[^}]*font-weight: 400;/);
    assert.match(fonts, /url\("\/assets\/fonts\/BeVietnamPro-Medium\.ttf"\)[^}]*font-weight: 500;/);
    assert.match(fonts, /--font-display: "Be Vietnam Pro", sans-serif;/);
    assert.match(fonts, /--font-text: "Be Vietnam Pro", sans-serif;/);
    assert.match(html, /rel="preload" href="\/assets\/fonts\/BeVietnamPro-Regular\.ttf"/);
    assert.match(html, /rel="stylesheet" href="\/assets\/fonts\/fonts\.css"/);
    assert.match(credits, /rel="stylesheet" href="\/assets\/fonts\/fonts\.css"/);
    assert.doesNotMatch(css, /(?:url\(|@import\s+)["']?https?:\/\//);
    assert.doesNotMatch(fonts, /(?:url\(|@import\s+)["']?https?:\/\//);
    assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//);
    for (const slug of slugs) assert.ok(ledger.includes(`${slug}.jpg`), `Thiếu nguồn ảnh ${slug}`);
  });
});
