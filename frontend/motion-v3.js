// Drop-in motionFrame replacement. Compatible with existing SVG and Canvas renderers.
import { fps } from "./design";
import { hand, profileAvatar } from "./brand";

const W = 1080,
  H = 1350,
  paper = "#FBF7EF",
  green = "#2D492D",
  lime = "#D9FF74",
  rust = "#B64A29",
  ink = "#171B17";
const sans = "Arial, sans-serif",
  mono = "Consolas, monospace",
  serif = "Georgia, serif";
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 4);
const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const noise = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const cache = new Map();
let measure;
function lines(value, width, size, weight, family, maxRows, maxHeight) {
  const key = JSON.stringify([
    value,
    width,
    size,
    weight,
    family,
    maxRows,
    maxHeight,
  ]);
  if (cache.has(key)) return cache.get(key);
  measure ??= new OffscreenCanvas(1, 1).getContext("2d");
  const words = String(value ?? "")
    .trim()
    .split(/\s+/);
  let rows;
  for (; size > 0; size = Math.max(1, size - 2)) {
    measure.font = `normal ${weight} ${size}px ${family}`;
    rows = [""];
    for (const word of words) {
      const i = rows.length - 1,
        next = rows[i] ? rows[i] + " " + word : word;
      if (rows[i] && measure.measureText(next).width > width) rows.push(word);
      else rows[i] = next;
    }
    if (
      size === 1 ||
      (rows.length <= maxRows &&
        rows.length * size * 1.03 <= maxHeight &&
        rows.every((r) => measure.measureText(r).width <= width))
    )
      break;
  }
  const result = { rows, size };
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}
function sceneType(s, i, n) {
  if (i === 0) return "intro";
  if (i === n - 1) return "outro";
  if (s.kind === "quote") return "quote";
  if (s.kind === "project") return "project";
  if (s.kind === "humor") return "humor";
  if (s.kind !== "stat") return "story";
  if (/signatur|emoji/i.test(s.title)) return "emoji";
  if (/hemmaplan|kanal/i.test(s.title)) return "channel";
  if (/svit|dagar/i.test(s.title) && /dagar/i.test(s.value)) return "calendar";
  return "number";
}
function render(stats, scenes, i, local) {
  const s = scenes[i],
    t = Math.max(0, local) / fps,
    type = s.graphic ? "figure" : sceneType(s, i, scenes.length),
    e = [];
  const P = paper, G = green, L = lime, R = rust;
  const schemes = {
    intro: [G, L],
    outro: [P, G],
    quote: [ink, L],
    project: [P, G],
    humor: [L, ink],
    story: [R, P],
    emoji: [L, G],
    channel: [G, P],
    calendar: [P, G],
    number: [L, ink],
  };
  const [bg, fg] = type === "figure" ? [[L, ink], [P, G], [R, P], [G, P]][i % 4] : schemes[type];
  const rect = (x, y, width, height, fill, rx = 0) => {
    if (width > 0 && height > 0)
      e.push({ tag: "rect", props: { x, y, width, height, fill, rx } });
  };
  const text = (
    value,
    x,
    y,
    fontSize,
    fill = fg,
    fontWeight = 700,
    fontFamily = sans,
    opacity = 1,
  ) =>
    e.push({
      tag: "text",
      props: {
        x,
        y,
        fontSize,
        fill,
        fontWeight,
        fontFamily,
        fontStyle: "normal",
        opacity: clamp(opacity),
      },
      value: String(value ?? ""),
    });
  const path = (pts, stroke, strokeWidth) =>
    e.push({
      tag: "path",
      props: {
        d: pts.map(([x, y], j) => `${j ? "L" : "M"}${x} ${y}`).join(" "),
        fill: "none",
        stroke,
        strokeWidth,
      },
    });
  const block = (
    value,
    x,
    y,
    width,
    size,
    rows = 3,
    delay = 0,
    color = fg,
    weight = 700,
    family = sans,
    maxHeight = 1190 - y,
  ) => {
    const fit = lines(value, width, size, weight, family, rows, maxHeight);
    fit.rows.forEach((r, j) => {
      const p = ease((t - delay - j * 0.075) / 0.35);
      text(
        r,
        x + (1 - p) * 55,
        y + fit.size * (j + 1) * 1.03 + (1 - p) * 35,
        fit.size,
        color,
        weight,
        family,
        p,
      );
    });
  };
  const enter = (delay = 0) => ease((t - delay) / 0.45);
  rect(0, 0, W, H, bg);
  // All elements are simple renderer-compatible primitives; no DOM-only animation.
  if (type === "figure") {
    const accent = bg === G ? L : bg === P ? R : fg;
    const muted = bg === G ? "#526950" : bg === R ? "#CA755B" : bg === P ? "#D9DCCD" : "#ADC85F";
    block(s.title, 60, 154, 960, 73, 1, 0, fg);
    const value = s.quantity.toLocaleString("sv-SE");
    const fit = lines(value, 960, 238, 900, sans, 1, 270);
    text(value, 53, 555, fit.size, fg, 900);
    block(s.unit, 63, 575, 950, 69, 1);
    if (s.graphic === "months" && Object.keys(stats.months).length) {
      const months = Object.entries(stats.months).sort();
      const tallest = Math.max(1, ...months.map(([,n])=>n));
      const pitch = 950/months.length;
      const labels = ["JAN","FEB","MAR","APR","MAJ","JUN","JUL","AUG","SEP","OKT","NOV","DEC"];
      months.forEach(([month,n], j)=>{
        const h = 238*n/tallest*enter(j*.03);
        rect(65+j*pitch, 997-h, Math.min(92,pitch*.75), h, n===tallest ? accent : muted, 4);
        text(labels[Number(month.slice(-2))-1], 65+j*pitch, 1040, 26, fg, 600, mono);
      });
    } else if (["streak","days","share"].includes(s.graphic)) {
      const share = s.graphic === "share";
      const count = share ? 100 : Math.min(366, s.quantity);
      const cols = share ? 20 : Math.max(4, Math.ceil(Math.sqrt(count*3.5)));
      const rows = Math.ceil(count/cols);
      for (let j=0; j<count; j++) {
        const stepX=950/cols, stepY=Math.min(80,250/rows);
        const p=enter(.45*j/count);
        rect(65+(j%cols)*stepX, 751+Math.floor(j/cols)*stepY,
          Math.max(2,stepX-5)*p, Math.max(2,stepY-5)*p,
          share && j>=s.ratio ? muted : accent, 5);
      }
    } else {
      // A decorative waveform; the count above carries the measured value.
      for (let j=0; j<44; j++) {
        const h=35+154*(.5+.5*Math.sin(j*.34-t*3));
        rect(65+j*21.6, 870-h/2, 13, h*enter(j*.009), accent, 6);
      }
    }
    block(s.detail, 65, 1084, 950, 48, 2, .18, fg, 400);
  } else if (type === "intro") {
    for (let j = 0; j < 11; j++) {
      const p = enter(j * 0.035);
      rect(
        -W + W * p + Math.sin(t * 2 + j) * 32,
        170 + j * 92,
        W + 64,
        70,
        j % 2 ? G : L,
      );
    }
    rect(0, 295, W, 640, G);
    block("OPENSVERIGE", 58, 310, 970, 114, 1, 0.1, L, 900);
    block("2026", 45, 520, 576, 248, 1, 0.25, L, 900);
    e.push({tag:"image",props:{href:hand,x:559+45*(1-enter(.15)),y:421+8*Math.sin(t*1.5),width:530,height:530}});
    rect(0, 925, W, 300, L);
    profileAvatar(e,stats,63,974,137,G,L);
    block(stats.name, 231, 963, 789, 120, 2, 0.4, G, 900, sans, 153);
    text("ETT ÅR AV IDÉER, KOD OCH KAOS", 62, 1180, 32, G, 600, mono);
  } else if (type === "number") {
    const match = /^(\d[\d\s\u00a0\u202f]*)(.*)$/u.exec(s.value),
      n = match ? Number(match[1].replace(/\s/g, "")) : 0;
    for (let j = 0; j < 8; j++) {
      let p = enter(j * 0.04);
      const h = (220 + 80 * Math.sin(t * 3 + j * 0.85)) * p;
      rect(65 + j * 120, 605 - h, 99, h, j % 2 ? G : ink, 12);
    }
    block(s.title, 60, 155, 960, 78, 2, 0, ink);
    const val = match
      ? Math.round(n * ease((t - 0.13) / 0.95)).toLocaleString("sv-SE")
      : s.value;
    block(val, 48, 610, 980, 270, 2, 0.1, ink, 900);
    if (match) block(match[2].trim(), 65, 920, 950, 74, 1, 0.3, ink);
    block(s.detail, 65, 1045, 950, 49, 3, 0.4, ink, 400);
  } else if (type === "calendar") {
    block(s.title, 60, 150, 960, 80, 2);
    const count = Number.parseInt(s.value, 10) || 0;
    for (let j = 0; j < 70; j++) {
      const p = enter((0.04 * j) / 2);
      const on = j < Math.min(count, 70);
      const lift = on ? 5 * Math.sin(t * 1.8 - (j % 10) * 0.55 - Math.floor(j / 10) * 0.7) * p : 0;
      rect(
        63 + (j % 10) * 96,
        350 + Math.floor(j / 10) * 67 - lift,
        78 * p,
        49 * p,
        on ? G : "#DEDCD0",
        8,
      );
    }
    block(s.value, 58, 850, 960, 175, 2, 0.3, G, 900);
    block(s.detail, 65, 1090, 950, 49, 2, 0.4, G, 400);
  } else if (type === "channel") {
    block(s.title, 62, 150, 950, 80, 2);
    for (let j = 0; j < 3; j++) {
      const p = enter(j * 0.12);
      const drift = 8 * Math.sin(t * 1.5 + j * 1.4) * p;
      rect(
        (j % 2 ? 1 : -1) * (1 - p) * W,
        345 + j * 165 + drift,
        W,
        145,
        j === 1 ? L : P,
      );
      block(
        s.value,
        45 + (j % 2 ? 25 : 0),
        350 + j * 165,
        990,
        112,
        1,
        0.1 + j * 0.12,
        G,
        900,
        mono,
      );
    }
    block(s.detail, 62, 935, 950, 83, 3, 0.4, P);
  } else if (type === "emoji") {
    for (let j = 0; j < 30; j++) {
      const p = enter(j * 0.018),
        x = 60 + noise(j) * 950,
        y = 200 + noise(j + 90) * 670;
      text(
        s.value,
        x,
        y - (1 - p) * 300 + Math.sin(t * 2 + j) * 16,
        50 + noise(j + 50) * 75,
        G,
        700,
        sans,
        p * 0.28,
      );
    }
    block(s.title, 60, 150, 960, 76, 2);
    rect(220, 385, 640, 510, G, 40);
    block(s.value, 365, 455, 400, 260, 1, 0.1, L);
    block(s.detail, 64, 980, 950, 95, 2, 0.35, G);
  } else if (type === "quote") {
    text("“", 35, 560 + 9 * Math.sin(t * 1.6), 440, L, 400, serif, 0.6);
    block(s.title, 62, 150, 960, 60, 2, 0, P, 600, mono);
    block(
      String(s.value).replace(/^[”"“]|[”"“]$/g, ""),
      60,
      470,
      950,
      132,
      5,
      0.1,
      P,
      900,
    );
    rect(65, 1130, 950 * enter(0.4), 12, L);
  } else if (type === "project") {
    block(s.title, 60, 150, 960, 68, 2);
    for (let j = 2; j >= 0; j--) {
      let p = enter((2 - j) * 0.11),
        x = 74 + j * 82 + (1 - p) * W;
      rect(
        x + Math.sin(t * 1.7 + j) * 12,
        335 + j * 32 + Math.sin(t * 2 + j) * 9,
        810 - j * 80,
        370,
        j === 0 ? G : j === 1 ? R : L,
        22,
      );
    }
    // Anchor the code and cursor to the face of the moving front card.
    const faceX = 74 + (1 - enter(0.22)) * W + 12 * Math.sin(t * 1.7);
    const faceY = 335 + 9 * Math.sin(t * 2);
    text("</>", faceX + 36, faceY + 240, 150, L, 800, mono, enter(0.25));
    const cursorWidth = 47 * (0.65 + 0.35 * Math.cos(t * 4)) * enter(0.35);
    rect(faceX + 325, faceY + 248, cursorWidth, 9, L, 3);
    for (let row = 0; row < 3; row++) {
      const typed = 0.5 + 0.5 * Math.sin(t * 1.8 - row);
      const width = (108 + 80 * typed - row * 16) * enter(0.35 + row * 0.08);
      rect(faceX + 464 + row * 25, faceY + 144 + row * 44, width, 9, L, 4);
    }
    block(s.value, 60, 745, 960, 112, 3, 0.25, G, 900, sans, 285);
    block(s.detail, 64, 1050, 950, 48, 3, 0.42, G, 400);
  } else if (type === "outro") {
    block("DET HÄR VAR", 62, 145, 960, 90, 1, 0, G, 900);
    profileAvatar(e,stats,63,302,116,G,P);
    block(stats.name, 201, 280, 559, 105, 2, 0.12, G, 900,sans,188);
    e.push({tag:"image",props:{href:hand,x:761+6*Math.sin(t),y:205+11*Math.sin(t*1.4),width:258,height:258}});
    const entries = Object.entries(stats.months || {}).sort(),
      max = Math.max(1, ...entries.map((x) => x[1]));
    const pitch = 950 / Math.max(1, entries.length);
    entries.forEach(([m, n], j) => {
      const h = ((320 * n) / max) * enter(0.1 + j * 0.035);
      rect(65 + j * pitch, 875 - h, pitch * 0.72, h, n === max ? R : G, 8);
      text(m.slice(-2), 65 + j * pitch, 925, 28, G, 600, mono);
    });
    block(s.detail, 62, 955, 950, 78, 3, 0.4, G, 900);
    text("VI HAR BARA BÖRJAT.", 65, 1200, 43, G, 700, mono);
  } else {
    block(s.title, 62, 150, 960, 66, 2);
    for (let j = 0; j < 8; j++) {
      const p = enter(j * 0.05);
      // A ripple travels along the printed lines; the margins stay pinned.
      const points = [];
      for (let k = 0; k <= 32; k++) {
        const u = p * k / 32;
        const phase = 2 * Math.PI * (u - t / 4.8) + j * 0.22;
        const wave = type === "humor" ? 19 * Math.sin(2 * phase) : 27 * Math.sin(phase);
        const offset = Math.sin(Math.PI * u) ** 2 * wave * p;
        points.push([65 + 950 * u, 345 + j * 34 + offset]);
      }
      path(points, type === "humor" ? G : P, 15);
    }
    block(s.value, 60, 680, 960, 114, 3, 0.12, fg, 900, sans, 310);
    block(s.detail, 65, 1010, 950, 48, 3, 0.35, fg, 400);
  }
  // Quiet editorial frame; source remains available in ScriptPreview.
  if (s.source && type !== "intro" && type !== "outro") {
    const label = lines(s.source, 950, 25, 500, mono, 1, 34);
    text(label.rows[0], 65, 1222, label.size, fg, 500, mono, enter(0.5));
  }
  e.push({tag:"image",props:{href:hand,x:46,y:16,width:90,height:90}});
  text("OpenSverige.se", 144, 82, 47, fg, 800, sans);
  text("WRAPPED / 2026", 747, 79, 30, fg, 600, mono);
  rect(62, 116, 956, 3, fg);
  const pitch = 950 / scenes.length;
  for (let j = 0; j < scenes.length; j++)
    rect(
      65 + j * pitch,
      1250,
      Math.max(1, pitch - 6),
      5,
      j <= i ? fg : bg === P ? "#D6D1C4" : bg,
    );
  profileAvatar(e,stats,65,1268,61,fg,bg);
  const footer = lines(stats.name, 676, 39, 700, sans, 1, 46);
  text(footer.rows[0], 142, 1310, footer.size, fg, 700, sans);
  text(
    `${String(i + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}`,
    860,
    1302,
    29,
    fg,
    500,
    mono,
  );
  return e;
}
export function motionFrame(stats, scenes, frame) {
  if (!scenes.length) return [];
  const i = Math.max(
      0,
      scenes.findLastIndex((s) => s.start <= frame),
    ),
    s = scenes[i],
    local = frame - s.start;
  const transition = Math.min(Math.round(fps * 0.32), Math.floor(s.frames / 3));
  const layer = (index, f, y = 0) => ({
    elements: render(stats, scenes, index, f),
    scale: 1,
    y,
    opacity: 1,
    radius: null,
  });
  if (i === scenes.length - 1 || !transition || local < s.frames - transition)
    return [layer(i, local + (i ? Math.round(fps * 0.32) : 0))];
  const next = local - s.frames + transition,
    p = smooth(next / Math.max(1, transition - 1));
  // Vertical push, supported by both existing renderers; avoids crossfade mush.
  const dir = i % 2 === 0 ? 1 : -1;
  return [
    layer(i, local + (i ? Math.round(fps * 0.32) : 0), -dir * H * p),
    layer(i + 1, next, dir * H * (1 - p)),
  ];
}
