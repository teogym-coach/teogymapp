#!/usr/bin/env node
/**
 * TEO GYM — 브랜드 아이콘/파비콘 일괄 생성 스크립트
 *
 * 사용법:
 *   node scripts/generate-icons.js
 *
 * 앞으로 아이콘을 바꿀 때는 scripts/brand/tg-icon-source.png 파일 하나만
 * 새 원본으로 교체한 뒤 이 스크립트를 다시 실행하면
 * public/ 아래 모든 아이콘·파비콘이 자동으로 재생성됩니다.
 *
 * 필요 패키지: sharp (devDependencies에 이미 포함, npm install 시 자동 설치)
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SOURCE = path.join(__dirname, "brand", "tg-icon-source.png");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// 원본 배경과 자연스럽게 이어지도록 safe-area 패딩에 채울 색 (원본 카드 배경 샘플링 값)
const PAD_BG = { r: 249, g: 244, b: 237, alpha: 1 };
// Apple HIG 권장 safe-area — 콘텐츠를 캔버스의 이 비율로 축소하고 나머지를 여백으로 둔다
const SAFE_AREA_CONTENT_RATIO = 0.85; // 약 15% 여백

async function withSafeArea(canvasSize) {
  const contentSize = Math.round(canvasSize * SAFE_AREA_CONTENT_RATIO);
  const offset = Math.round((canvasSize - contentSize) / 2);
  const resizedContent = await sharp(SOURCE)
    .resize(contentSize, contentSize, { fit: "cover" })
    .toBuffer();
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: PAD_BG,
    },
  })
    .composite([{ input: resizedContent, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function toIco(pngBuffers /* [{size, buffer}] */) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageBuffers = [];
  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    dirEntries.push(entry);
    imageBuffers.push(buffer);
  }
  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

function svgWrap(base64Png, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${base64Png}"/></svg>`;
}

async function buildMaskSilhouette(size) {
  // 원본은 밝은(크림) 배경 + 어두운(차콜) 심볼 → 어두운 픽셀만 남기고 나머지는 투명화
  const small = await sharp(SOURCE).resize(80, 80).toBuffer();
  const upscaled = sharp(small).resize(size, size);
  const { data, info } = await upscaled.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const threshold = 150; // 이보다 어두우면(휘도 낮으면) 심볼로 간주
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < threshold) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255;
    } else {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`[오류] 원본 이미지가 없습니다: ${SOURCE}`);
    console.error("scripts/brand/tg-icon-source.png 위치에 원본 PNG를 넣어주세요.");
    process.exit(1);
  }

  console.log("TEO GYM 아이콘 생성 시작...");

  // 1) safe-area 적용 마스터 (큰 아이콘용)
  const padded512 = await withSafeArea(1200);

  const write = async (buf, name) => {
    const outPath = path.join(PUBLIC_DIR, name);
    fs.writeFileSync(outPath, buf);
    console.log(`  ✓ ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
  };

  // 2) 큰 아이콘 (safe-area 적용)
  await write(await sharp(padded512).resize(512, 512).png().toBuffer(), "icon-512.png");
  await write(await sharp(padded512).resize(192, 192).png().toBuffer(), "icon-192.png");
  await write(await sharp(padded512).resize(180, 180).png().toBuffer(), "apple-touch-icon.png");
  await write(await sharp(padded512).resize(150, 150).png().toBuffer(), "mstile-150x150.png");

  // 3) 파비콘 — 작은 크기에서도 선명하도록 살짝 샤프닝 적용
  const favicon32 = await sharp(padded512)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.6 })
    .png()
    .toBuffer();
  const favicon16 = await sharp(padded512)
    .resize(16, 16, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.5 })
    .png()
    .toBuffer();
  await write(favicon32, "favicon-32x32.png");
  await write(favicon16, "favicon-16x16.png");

  // 4) favicon.ico (16+32 PNG 컨테이너)
  const ico = await toIco([
    { size: 16, buffer: favicon16 },
    { size: 32, buffer: favicon32 },
  ]);
  await write(ico, "favicon.ico");

  // 5) favicon.svg (완전한 벡터 원본이 없어 래스터를 base64로 embed)
  const svg256 = await sharp(padded512).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), svgWrap(svg256.toString("base64"), 256));
  console.log("  ✓ favicon.svg");

  // 6) safari-pinned-tab.svg (mask-icon, 단색 실루엣)
  const maskPng = await buildMaskSilhouette(300);
  fs.writeFileSync(path.join(PUBLIC_DIR, "safari-pinned-tab.svg"), svgWrap(maskPng.toString("base64"), 300));
  console.log("  ✓ safari-pinned-tab.svg");

  console.log("\n완료! public/ 폴더에 아이콘 8종 + safari-pinned-tab.svg가 생성되었습니다.");
  console.log("index.html / manifest.json의 캐시 버전(?v=)을 올리는 것도 잊지 마세요.");
}

main().catch((e) => {
  console.error("[오류] 아이콘 생성 실패:", e);
  process.exit(1);
});
