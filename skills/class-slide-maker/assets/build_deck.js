/*
 * class-slide-maker · 메타(Meta) 스타일 수업용 PPTX 빌더
 * 사용법: node assets/build_deck.js content.json [imgDir] [output.pptx]
 *
 * content.json 구조는 references/layout_types.md 참고.
 * 슬라이드 개수 = content.slides 배열 길이 (자동으로 맞춰짐)
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const CONTENT = process.argv[2] || "content.json";
const IMGDIR  = process.argv[3] || "img";
const OUT     = process.argv[4] || "output.pptx";
const c = JSON.parse(fs.readFileSync(CONTENT, "utf8"));
const IMG = (f) => path.resolve(IMGDIR, f);
const hasImg = (f) => f && fs.existsSync(IMG(f));

// ---------------- 메타 테마 토큰 (hex는 # 없이) ----------------
const C = {
  canvas: "FFFFFF", inkDeep: "0A1317", ink: "1C1E21", steel: "5D6C7B",
  stone: "8595A4", blue: "0064E0", lblue: "CFE0FB", soft: "F1F4F7",
  softer: "F8FAFD", border: "DEE3E9", yellow: "F7B928",
};
const F = "Pretendard";
const R = 0.14; // 카드 라운드 반경

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10in x 5.625in
pres.title = c.title || "수업 슬라이드";

// ---------------- 공통 유틸 ----------------
const makeShadow = () => ({ type: "outer", blur: 10, offset: 2, angle: 90, color: "8595A4", opacity: 0.14 });

function bg(s) { s.background = { color: C.canvas }; }

function card(s, x, y, w, h, opt = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: opt.fill || C.canvas },
    line: { color: opt.border || C.border, width: opt.border === null ? 0 : 1 },
    rectRadius: opt.radius ?? R,
    shadow: opt.shadow ? makeShadow() : undefined,
  });
}

function dashedBox(s, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: C.softer },
    line: { color: C.blue, width: 1.25, dashType: "dash" },
    rectRadius: R,
  });
}

function pageNum(s, n, total) {
  s.addText(`${n} / ${total}`, {
    x: 8.7, y: 5.28, w: 0.85, h: 0.24,
    fontSize: 10.5, fontFace: F, color: C.stone, bold: true, align: "right",
  });
}

// 텍스트 줄 수 추정 (한글/영문 혼용 Pretendard Bold 기준 경험적 근사치)
function estimateLines(text, widthIn, fontSizePt) {
  if (!text) return 0;
  const avgCharWidthIn = (fontSizePt / 72) * 0.95;
  const charsPerLine = Math.max(4, Math.floor(widthIn / avgCharWidthIn));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

// 상단 헤더: 챕터(우상단) + 제목(좌상단) + 부제(옵션)
// 제목이 줄바꿈되어도 부제/본문이 겹치지 않도록 실제 줄 수를 기준으로 y좌표를 동적으로 계산한다.
// 반환값: 이후 콘텐츠가 시작될 y좌표
function header(s, chapter, title, subtitle) {
  const titleFS = 25;
  const titleW = chapter ? 5.9 : 8.9;
  if (chapter) {
    s.addText(chapter, {
      x: 6.6, y: 0.4, w: 2.9, h: 0.3,
      fontSize: 12.5, fontFace: F, color: C.blue, bold: true, align: "right", charSpacing: 1,
    });
  }
  const titleLines = estimateLines(title, titleW, titleFS);
  const titleLineH = (titleFS * 1.14) / 72;
  const titleH = titleLines * titleLineH;
  s.addText(title, {
    x: 0.55, y: 0.38, w: titleW, h: titleH + 0.1,
    fontSize: titleFS, fontFace: F, color: C.inkDeep, bold: true,
    valign: "top", lineSpacingMultiple: 1.14, wrap: true,
  });
  let cursorY = 0.38 + titleH + 0.14;
  if (subtitle) {
    const subFS = 13.5;
    const subLines = estimateLines(subtitle, 8.9, subFS);
    const subH = subLines * ((subFS * 1.25) / 72);
    s.addText(subtitle, {
      x: 0.55, y: cursorY, w: 8.9, h: subH + 0.06,
      fontSize: subFS, fontFace: F, color: C.steel, bold: false, valign: "top", wrap: true,
    });
    cursorY += subH + 0.22;
  } else {
    cursorY += 0.16;
  }
  return Math.max(cursorY, 1.2);
}

// 이미지 자리 표시 박스 (실제 이미지가 있으면 삽입, 없으면 자리만 표시)
function imageSlot(s, x, y, w, h, label, imgFile) {
  if (hasImg(imgFile)) {
    card(s, x, y, w, h, { fill: C.softer });
    s.addImage({ path: IMG(imgFile), x: x + 0.06, y: y + 0.06, w: w - 0.12, h: h - 0.12, sizing: { type: "cover", w: w - 0.12, h: h - 0.12 } });
  } else {
    dashedBox(s, x, y, w, h);
    s.addText("🖼", { x, y: y + h / 2 - 0.55, w, h: 0.5, fontSize: 26, align: "center", color: C.blue });
    s.addText(label || "이미지 자리", {
      x: x + 0.1, y: y + h / 2 - 0.02, w: w - 0.2, h: 0.4,
      fontSize: 12.5, fontFace: F, color: C.ink, bold: true, align: "center",
    });
  }
}

// 파란 점불릿 리스트 (개수에 따라 폰트/줄간격 자동 조정)
function bulletList(s, items, x, y, w, h) {
  const n = items.length;
  const fontSize = n <= 3 ? 17 : n <= 5 ? 15.5 : 13.5;
  const rowH = h / n;
  items.forEach((it, i) => {
    const ry = y + i * rowH;
    s.addShape(pres.shapes.OVAL, {
      x: x, y: ry + rowH / 2 - 0.045, w: 0.09, h: 0.09,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 },
    });
    s.addText(it, {
      x: x + 0.26, y: ry, w: w - 0.26, h: rowH,
      fontSize, fontFace: F, color: C.ink, valign: "middle",
      lineSpacingMultiple: 1.28, wrap: true,
    });
  });
}

// =====================================================================
// 슬라이드 타입별 렌더러
// =====================================================================

function renderCover(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const eyebrow = sl.eyebrow || c.subject || "";
  if (eyebrow) {
    card(s, 0.55, 0.55, Math.min(0.5 + eyebrow.length * 0.135, 6.5), 0.42, { fill: C.lblue, border: null });
    s.addText(eyebrow, {
      x: 0.55, y: 0.55, w: Math.min(0.5 + eyebrow.length * 0.135, 6.5), h: 0.42,
      fontSize: 12.5, fontFace: F, color: C.blue, bold: true, align: "center", valign: "middle",
    });
  }
  const hasImage = !!sl.image || sl.showImageSlot;
  const titleW = hasImage ? 5.7 : 8.9;
  const titleFS = 38;
  const titleLines = estimateLines(sl.title, titleW, titleFS);
  const titleH = titleLines * ((titleFS * 1.14) / 72);
  s.addText(sl.title, {
    x: 0.55, y: 1.5, w: titleW, h: titleH + 0.15,
    fontSize: titleFS, fontFace: F, color: C.inkDeep, bold: true,
    valign: "top", lineSpacingMultiple: 1.14, wrap: true,
  });
  if (sl.subtitle) {
    s.addText(sl.subtitle, {
      x: 0.57, y: 1.5 + titleH + 0.35, w: titleW, h: 0.9,
      fontSize: 15.5, fontFace: F, color: C.steel, valign: "top", lineSpacingMultiple: 1.3, wrap: true,
    });
  }
  if (hasImage) {
    imageSlot(s, 6.55, 1.15, 2.9, 3.9, sl.imageLabel, sl.image);
  }
  pageNum(s, idx, total);
}

function renderBullets(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const top = header(s, sl.chapter, sl.title, sl.subtitle);
  const bottom = 5.05;
  const hasImage = !!sl.image || sl.showImageSlot;
  if (hasImage) {
    bulletList(s, sl.bullets, 0.55, top, 5.55, bottom - top);
    imageSlot(s, 6.35, top, 3.1, bottom - top, sl.imageLabel, sl.image);
  } else {
    bulletList(s, sl.bullets, 0.7, top, 8.65, bottom - top);
  }
  pageNum(s, idx, total);
}

function renderCompare(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const top = header(s, sl.chapter, sl.title, sl.subtitle);
  const bottom = 5.05;
  const colW = 4.3, gap = 0.3;
  const cols = [
    { x: 0.55, label: sl.leftTitle, items: sl.leftItems, tint: C.soft },
    { x: 0.55 + colW + gap, label: sl.rightTitle, items: sl.rightItems, tint: C.softer },
  ];
  cols.forEach((col) => {
    card(s, col.x, top, colW, bottom - top, { fill: col.tint, border: C.border });
    s.addText(col.label, {
      x: col.x + 0.25, y: top + 0.18, w: colW - 0.5, h: 0.42,
      fontSize: 16, fontFace: F, color: C.blue, bold: true,
    });
    bulletList(s, col.items, col.x + 0.28, top + 0.72, colW - 0.56, bottom - top - 0.9);
  });
  pageNum(s, idx, total);
}

function renderProcess(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const top = header(s, sl.chapter, sl.title, sl.subtitle) + 0.1;
  const steps = sl.steps || [];
  const n = steps.length;
  const areaX = 0.6, areaW = 8.8;
  const stepW = areaW / n;
  const circleY = top, circleD = 0.55;

  steps.forEach((st, i) => {
    const cx = areaX + i * stepW + stepW / 2;
    // 연결선
    if (i < n - 1) {
      s.addShape(pres.shapes.LINE, {
        x: cx + circleD / 2, y: circleY + circleD / 2, w: stepW - circleD, h: 0,
        line: { color: C.border, width: 2 },
      });
    }
    s.addShape(pres.shapes.OVAL, {
      x: cx - circleD / 2, y: circleY, w: circleD, h: circleD,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 },
    });
    s.addText(String(i + 1), {
      x: cx - circleD / 2, y: circleY, w: circleD, h: circleD,
      fontSize: 18, fontFace: F, color: "FFFFFF", bold: true, align: "center", valign: "middle",
    });
    const label = typeof st === "string" ? st : st.title;
    const desc = typeof st === "string" ? "" : (st.desc || "");
    card(s, cx - stepW / 2 + 0.12, circleY + circleD + 0.22, stepW - 0.24, 2.6, { fill: C.softer, border: C.border });
    s.addText(label, {
      x: cx - stepW / 2 + 0.28, y: circleY + circleD + 0.4, w: stepW - 0.56, h: 0.55,
      fontSize: 14.5, fontFace: F, color: C.inkDeep, bold: true, align: "center", valign: "top", wrap: true,
    });
    if (desc) {
      s.addText(desc, {
        x: cx - stepW / 2 + 0.28, y: circleY + circleD + 1.0, w: stepW - 0.56, h: 1.7,
        fontSize: 12, fontFace: F, color: C.steel, align: "center", valign: "top",
        lineSpacingMultiple: 1.28, wrap: true,
      });
    }
  });
  pageNum(s, idx, total);
}

function renderTable(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const top = header(s, sl.chapter, sl.title, sl.subtitle);
  const headRow = sl.headers.map((h) => ({
    text: h, options: { fill: { color: C.soft }, color: C.inkDeep, bold: true, fontSize: 13, align: "center", valign: "middle" },
  }));
  const bodyRows = sl.rows.map((row) =>
    row.map((cell) => ({
      text: String(cell), options: { color: C.ink, fontSize: 12.5, align: "left", valign: "middle" },
    }))
  );
  s.addTable([headRow, ...bodyRows], {
    x: 0.55, y: top, w: 8.9, h: 5.05 - top,
    fontFace: F, border: { type: "solid", color: C.border, pt: 1 },
    autoPage: false, valign: "middle", rowH: (5.05 - top) / (bodyRows.length + 1),
  });
  pageNum(s, idx, total);
}

function renderQuote(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  if (sl.chapter) {
    s.addText(sl.chapter, {
      x: 0.6, y: 0.5, w: 8.8, h: 0.35, fontSize: 12.5, fontFace: F, color: C.blue, bold: true, charSpacing: 1,
    });
  }
  card(s, 0.6, 1.15, 8.8, 3.5, { fill: C.soft, border: null });
  s.addText(`“${sl.quote}”`, {
    x: 1.05, y: 1.15, w: 7.9, h: sl.attribution ? 2.75 : 3.5,
    fontSize: 24, fontFace: F, color: C.inkDeep, bold: true, italic: true,
    align: "center", valign: "middle", lineSpacingMultiple: 1.35, wrap: true,
  });
  if (sl.attribution) {
    s.addText(`— ${sl.attribution}`, {
      x: 1.05, y: 3.9, w: 7.9, h: 0.5, fontSize: 14, fontFace: F, color: C.steel, align: "center", bold: true,
    });
  }
  pageNum(s, idx, total);
}

function renderImageFocus(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  const top = header(s, sl.chapter, sl.title, sl.subtitle);
  const captionH = sl.caption ? 0.55 : 0;
  imageSlot(s, 1.5, top, 7.0, 5.05 - top - captionH, sl.imageLabel, sl.image);
  if (sl.caption) {
    s.addText(sl.caption, {
      x: 1.5, y: 5.05 - captionH, w: 7.0, h: captionH,
      fontSize: 12.5, fontFace: F, color: C.steel, align: "center", italic: true,
    });
  }
  pageNum(s, idx, total);
}

function renderClosing(sl, idx, total) {
  const s = pres.addSlide(); bg(s);
  if (sl.chapter) {
    s.addText(sl.chapter, {
      x: 0.6, y: 0.7, w: 8.8, h: 0.35, fontSize: 13, fontFace: F, color: C.blue, bold: true, charSpacing: 1, align: "center",
    });
  }
  s.addText(sl.title, {
    x: 0.6, y: 1.25, w: 8.8, h: 1.0, fontSize: 32, fontFace: F, color: C.inkDeep, bold: true,
    align: "center", valign: "top", wrap: true,
  });
  if (sl.message) {
    s.addText(sl.message, {
      x: 1.0, y: 2.25, w: 8.0, h: 1.35, fontSize: 15.5, fontFace: F, color: C.ink,
      align: "center", valign: "top", lineSpacingMultiple: 1.4, wrap: true,
    });
  }
  if (sl.question) {
    card(s, 0.9, 4.15, 8.2, 0.85, { fill: C.blue, border: null });
    s.addText(sl.question, {
      x: 1.1, y: 4.15, w: 7.8, h: 0.85, fontSize: 16, fontFace: F, color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });
  }
  pageNum(s, idx, total);
}

// =====================================================================
const RENDERERS = {
  cover: renderCover,
  bullets: renderBullets,
  compare: renderCompare,
  process: renderProcess,
  table: renderTable,
  quote: renderQuote,
  image: renderImageFocus,
  closing: renderClosing,
};

const total = c.slides.length;
c.slides.forEach((sl, i) => {
  const fn = RENDERERS[sl.type];
  if (!fn) throw new Error(`알 수 없는 슬라이드 타입: ${sl.type} (${i + 1}번째)`);
  fn(sl, i + 1, total);
});

pres.writeFile({ fileName: OUT })
  .then(() => console.log(`OK -> ${OUT} (${total}장)`))
  .catch((e) => { console.error(e); process.exit(1); });
