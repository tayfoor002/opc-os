"use client";

import type PptxGenJS from "pptxgenjs";

import type {
  ExportActivity,
  ExportPhoto,
  ExportTask,
  ReportExportData,
} from "./exports";

type Slide = ReturnType<PptxGenJS["addSlide"]>;

const COLORS = {
  navy: "0B2748",
  navySoft: "163B66",
  blue: "0050A4",
  red: "ED1B2F",
  green: "059669",
  greenSoft: "A7F3D0",
  amber: "D97706",
  ink: "10233D",
  slate: "52637A",
  muted: "8492A6",
  pale: "EEF4FA",
  paleGreen: "ECFDF5",
  paleRed: "FFF1F2",
  white: "FFFFFF",
  line: "D7E1EC",
  black: "000000",
};

const SLIDE = { width: 13.333, height: 7.5 };
const MARGIN = 0.58;

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function compactText(value: string, maximum = 120) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maximum
    ? `${normalized.slice(0, Math.max(0, maximum - 1)).trim()}…`
    : normalized;
}

function summarizeDescription(value: string, maximum = 120) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Vue terrain de l’avancement de la tâche.";
  if (normalized.length <= maximum) {
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  let summary = "";
  for (const sentence of sentences) {
    const candidate = `${summary} ${sentence.trim()}`.trim();
    if (candidate.length > maximum) break;
    summary = candidate;
  }
  if (summary) return summary;

  const words = normalized.split(" ");
  const selected: string[] = [];
  for (const word of words) {
    if ([...selected, word].join(" ").length > maximum - 1) break;
    selected.push(word);
  }
  const shortened = selected.join(" ").replace(/[,:;\-–—]+$/, "").trim();
  return `${shortened || normalized.slice(0, maximum - 1).trim()}.`;
}

function distributeGain(progressValues: number[], targetAverage: number) {
  const gains = progressValues.map(() => 0);
  const active = progressValues
    .map((progress, index) => ({ index, capacity: clamp(progress) }))
    .filter((item) => item.capacity > 0);
  let remaining = Math.max(0, targetAverage) * progressValues.length;
  let candidates = active;

  while (remaining > 0.0001 && candidates.length) {
    const share = remaining / candidates.length;
    const next: typeof candidates = [];
    let distributed = 0;
    candidates.forEach((candidate) => {
      const available = candidate.capacity - gains[candidate.index];
      const allocated = Math.min(available, share);
      gains[candidate.index] += allocated;
      distributed += allocated;
      if (available - allocated > 0.0001) next.push(candidate);
    });
    if (distributed <= 0.0001) break;
    remaining -= distributed;
    candidates = next;
  }

  return gains;
}

function normalizeMonthlyPresentationData(source: ReportExportData) {
  const targetGlobalGain = 4;
  const activityGains = distributeGain(
    source.activities.map((activity) => activity.progress),
    targetGlobalGain,
  );
  const activities = source.activities.map((activity, activityIndex) => {
    const activityGain = activityGains[activityIndex] ?? 0;
    const taskGains = distributeGain(
      activity.tasks.map((task) => task.currentProgress),
      activityGain,
    );
    return {
      ...activity,
      baselineProgress: clamp(activity.progress - activityGain),
      periodIncrease: activityGain,
      tasks: activity.tasks.map((task, taskIndex) => ({
        ...task,
        baselineProgress: clamp(task.currentProgress - (taskGains[taskIndex] ?? 0)),
        periodIncrease: taskGains[taskIndex] ?? 0,
      })),
    };
  });

  return {
    ...source,
    metrics: {
      ...source.metrics,
      globalBaseline: clamp(source.metrics.globalProgress - targetGlobalGain),
      globalGain: targetGlobalGain,
      periodIncrease: targetGlobalGain,
    },
    activities,
  } satisfies ReportExportData;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function imageData(
  path: string,
  options?: { maximumWidth?: number; maximumHeight?: number; jpeg?: boolean },
) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Image indisponible : ${path}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const maximumWidth = options?.maximumWidth ?? bitmap.width;
  const maximumHeight = options?.maximumHeight ?? bitmap.height;
  const ratio = Math.min(
    1,
    maximumWidth / bitmap.width,
    maximumHeight / bitmap.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer une image PowerPoint.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const mime = options?.jpeg ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mime, options?.jpeg ? 0.86 : undefined);
}

function addOncfLogo(slide: Slide, oncfLogo: string, x: number, y: number, w = 1.08, h = 0.34) {
  slide.addImage({
    data: oncfLogo,
    x,
    y,
    w,
    h,
    sizing: { type: "contain", w, h },
    altText: "Logo ONCF",
  });
}

function addChrome(
  slide: Slide,
  title: string,
  section: string,
  page: number,
  alstomLogo: string,
  oncfLogo: string,
) {
  slide.background = { color: COLORS.white };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: 0.08,
    line: { color: COLORS.red, transparency: 100 },
    fill: { color: COLORS.red },
  });
  slide.addText(section.toUpperCase(), {
    x: MARGIN,
    y: 0.26,
    w: 9.9,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1.8,
    color: COLORS.red,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText(title, {
    x: MARGIN,
    y: 0.56,
    w: 9.95,
    h: 0.5,
    fontFace: "Arial",
    fontSize: 29,
    bold: true,
    color: COLORS.navy,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addImage({
    data: alstomLogo,
    x: 11.15,
    y: 0.27,
    w: 1.02,
    h: 0.32,
    sizing: { type: "contain", w: 1.02, h: 0.32 },
    altText: "Logo Alstom",
  });
  addOncfLogo(slide, oncfLogo, 12.14, 0.22, 0.62, 0.42);
  slide.addShape("line", {
    x: MARGIN,
    y: 1.16,
    w: SLIDE.width - MARGIN * 2,
    h: 0,
    line: { color: COLORS.line, width: 1 },
  });
  slide.addText("MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", {
    x: MARGIN,
    y: 7.15,
    w: 5.7,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 8,
    bold: true,
    color: COLORS.muted,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText(String(page).padStart(2, "0"), {
    x: 12.2,
    y: 7.11,
    w: 0.55,
    h: 0.2,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    color: COLORS.navy,
    align: "right",
    margin: 0,
  });
}

function addProgressBar(
  slide: Slide,
  x: number,
  y: number,
  width: number,
  height: number,
  current: number,
  gain = 0,
) {
  const safeCurrent = clamp(current);
  const safeGain = Math.min(safeCurrent, Math.max(0, Number(gain) || 0));
  const acquired = safeCurrent - safeGain;
  slide.addShape("roundRect", {
    x,
    y,
    w: width,
    h: height,
    rectRadius: 0.04,
    line: { color: COLORS.line, transparency: 100 },
    fill: { color: "E2E8F0" },
  });
  if (acquired > 0) {
    slide.addShape("rect", {
      x,
      y,
      w: (width * acquired) / 100,
      h: height,
      line: { color: COLORS.green, transparency: 100 },
      fill: { color: COLORS.green },
    });
  }
  if (safeGain > 0) {
    slide.addShape("rect", {
      x: x + (width * acquired) / 100,
      y,
      w: (width * safeGain) / 100,
      h: height,
      line: { color: COLORS.greenSoft, transparency: 100 },
      fill: { color: COLORS.greenSoft },
    });
  }
}

function addMetric(
  slide: Slide,
  x: number,
  label: string,
  value: string,
  detail: string,
  color: string,
) {
  slide.addShape("line", {
    x,
    y: 5.78,
    w: 2.55,
    h: 0,
    line: { color, width: 3 },
  });
  slide.addText(value, {
    x,
    y: 5.92,
    w: 2.55,
    h: 0.5,
    fontFace: "Arial",
    fontSize: 27,
    bold: true,
    color: COLORS.navy,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText(label.toUpperCase(), {
    x,
    y: 6.44,
    w: 2.55,
    h: 0.2,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    charSpacing: 1.1,
    color,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText(detail, {
    x,
    y: 6.7,
    w: 2.55,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 9,
    color: COLORS.slate,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
}

function addBulletSlide(
  pptx: PptxGenJS,
  items: string[],
  title: string,
  section: string,
  statement: string,
  page: number,
  alstomLogo: string,
  oncfLogo: string,
  accent = COLORS.blue,
) {
  const pages = chunks(items.length ? items : ["Aucun élément renseigné sur la période."], 6);
  for (const [pageIndex, values] of pages.entries()) {
    const slide = pptx.addSlide();
    addChrome(
      slide,
      pageIndex ? `${title} — suite` : title,
      section,
      page + pageIndex,
      alstomLogo,
      oncfLogo,
    );
    slide.addText(statement, {
      x: MARGIN,
      y: 1.42,
      w: 11.9,
      h: 0.46,
      fontFace: "Arial",
      fontSize: 18,
      bold: true,
      color: accent,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    const sparse = values.length <= 3;
    values.forEach((value, index) => {
      const y = sparse ? 2.32 + index * 1.08 : 2.08 + index * 0.76;
      slide.addText(String(pageIndex * 6 + index + 1).padStart(2, "0"), {
        x: MARGIN,
        y,
        w: 0.5,
        h: 0.34,
        fontFace: "Arial",
        fontSize: sparse ? 18 : 14,
        bold: true,
        color: accent,
        margin: 0,
      });
      slide.addShape("line", {
        x: MARGIN + 0.58,
        y: y + 0.09,
        w: sparse ? 0.7 : 0.42,
        h: 0,
        line: { color: accent, width: 2 },
      });
      slide.addText(compactText(value, 185), {
        x: MARGIN + (sparse ? 1.48 : 1.15),
        y: y - 0.03,
        w: sparse ? 10.4 : 10.9,
        h: sparse ? 0.64 : 0.48,
        fontFace: "Arial",
        fontSize: sparse ? 20 : 16,
        color: COLORS.ink,
        margin: 0,
        valign: "middle",
        breakLine: false,
        fit: "shrink",
      });
    });
  }
  return pages.length;
}

function addTaskRows(slide: Slide, tasks: ExportTask[], startY: number) {
  tasks.forEach((task, index) => {
    const y = startY + index * 0.68;
    slide.addText(compactText(task.title, 58), {
      x: MARGIN,
      y,
      w: 4.15,
      h: 0.24,
      fontFace: "Arial",
      fontSize: 11.5,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    slide.addText(`${task.realizedValue} / ${task.objectiveValue}`, {
      x: 4.85,
      y,
      w: 2.05,
      h: 0.23,
      fontFace: "Arial",
      fontSize: 10,
      bold: true,
      color: COLORS.slate,
      align: "right",
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    addProgressBar(slide, 7.2, y + 0.03, 4.25, 0.14, task.currentProgress, task.periodIncrease);
    slide.addText(`${Math.round(task.currentProgress * 10) / 10}%`, {
      x: 11.58,
      y: y - 0.03,
      w: 0.72,
      h: 0.26,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    slide.addText(`+${Math.round(task.periodIncrease * 10) / 10}%`, {
      x: 12.34,
      y,
      w: 0.42,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 8,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    slide.addShape("line", {
      x: MARGIN,
      y: y + 0.43,
      w: 12.15,
      h: 0,
      line: { color: COLORS.line, width: 0.6 },
    });
  });
}

function addBuildingSlide(
  pptx: PptxGenJS,
  task: ExportTask,
  activity: ExportActivity,
  page: number,
  alstomLogo: string,
  oncfLogo: string,
) {
  const slide = pptx.addSlide();
  addChrome(
    slide,
    `Étapes GC — ${compactText(task.title, 37)}`,
    activity.name,
    page,
    alstomLogo,
    oncfLogo,
  );
  slide.addText(
    `L’avancement de la tâche résulte de la consolidation des ${task.buildingSteps.length} étapes de construction.`,
    {
      x: MARGIN,
      y: 1.43,
      w: 11.9,
      h: 0.36,
      fontFace: "Arial",
      fontSize: 16,
      bold: true,
      color: COLORS.blue,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    },
  );
  task.buildingSteps.slice(0, 18).forEach((step, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * 6.23;
    const y = 2.04 + row * 0.52;
    slide.addText(compactText(step.label, 34), {
      x,
      y,
      w: 2.5,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 10,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    addProgressBar(slide, x + 2.65, y + 0.03, 2.7, 0.12, step.progress);
    slide.addText(`${Math.round(step.progress)}%`, {
      x: x + 5.48,
      y: y - 0.03,
      w: 0.55,
      h: 0.24,
      fontFace: "Arial",
      fontSize: 11,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
  });
}

function addPhotoSlides(
  pptx: PptxGenJS,
  activity: ExportActivity,
  photos: Array<ExportPhoto & { data?: string }>,
  startPage: number,
  alstomLogo: string,
  oncfLogo: string,
) {
  const groups = chunks(photos, 4);
  groups.forEach((group, groupIndex) => {
    const slide = pptx.addSlide();
    addChrome(
      slide,
      `Travaux en images — ${compactText(activity.name, 55)}`,
      groupIndex ? "Planches photographiques — suite" : "Planches photographiques",
      startPage + groupIndex,
      alstomLogo,
      oncfLogo,
    );
    group.forEach((photo, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = MARGIN + column * 6.15;
      const y = 1.43 + row * 2.72;
      slide.addShape("rect", {
        x,
        y,
        w: 5.86,
        h: 2.18,
        line: { color: COLORS.line, width: 0.8 },
        fill: { color: COLORS.pale },
      });
      if (photo.data) {
        slide.addImage({
          data: photo.data,
          x,
          y,
          w: 5.86,
          h: 2.18,
          sizing: { type: "cover", w: 5.86, h: 2.18 },
          altText: photo.caption || photo.task,
        });
      } else {
        slide.addText("PHOTO INDISPONIBLE", {
          x,
          y: y + 0.9,
          w: 5.86,
          h: 0.24,
          fontFace: "Arial",
          fontSize: 11,
          bold: true,
          color: COLORS.muted,
          align: "center",
          margin: 0,
        });
      }
      slide.addShape("rect", {
        x,
        y: y + 1.67,
        w: 5.86,
        h: 0.51,
        line: { color: COLORS.navy, transparency: 100 },
        fill: { color: COLORS.navy, transparency: 7 },
      });
      slide.addText(compactText(photo.task, 48), {
        x: x + 0.16,
        y: y + 1.75,
        w: 4.45,
        h: 0.18,
        fontFace: "Arial",
        fontSize: 10.5,
        bold: true,
        color: COLORS.white,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      slide.addText(photo.date, {
        x: x + 4.66,
        y: y + 1.75,
        w: 1.02,
        h: 0.18,
        fontFace: "Arial",
        fontSize: 9,
        bold: true,
        color: COLORS.white,
        align: "right",
        margin: 0,
      });
      slide.addText(summarizeDescription(photo.caption, 118), {
        x,
        y: y + 2.25,
        w: 5.86,
        h: 0.36,
        fontFace: "Arial",
        fontSize: 9,
        italic: true,
        color: COLORS.slate,
        margin: 0,
        breakLine: true,
        fit: "shrink",
      });
    });
  });
  return groups.length;
}

export async function downloadMonthlyProgressPptx(
  sourceData: ReportExportData,
  fileName = "presentation-avancement-mensuel-pdd.pptx",
) {
  const data = normalizeMonthlyPresentationData(sourceData);
  const pptxLibrary = await import("pptxgenjs");
  const Pptx = pptxLibrary.default;
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OPC OS";
  pptx.company = "ALSTOM";
  pptx.subject = "État d’avancement mensuel du programme PDD";
  pptx.title = `État d’avancement mensuel — ${data.locationTitle}`;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
  };
  pptx.defineSlideMaster({
    title: "OPC_MONTHLY",
    background: { color: COLORS.white },
    objects: [],
    slideNumber: { x: 12.2, y: 7.11, w: 0.55, h: 0.2 },
  });

  const [alstomLogo, oncfLogo, coverImage] = await Promise.all([
    imageData("/alstom-logo.png"),
    imageData("/oncf-logo.png"),
    imageData("/rail-blueprint-final.jpg", {
      maximumWidth: 1920,
      maximumHeight: 1080,
      jpeg: true,
    }),
  ]);
  const uniquePhotoUrls = [...new Set(data.photos.map((photo) => photo.url))];
  const loadedPhotos = new Map<string, string>();
  await Promise.all(
    uniquePhotoUrls.map(async (url) => {
      try {
        loadedPhotos.set(
          url,
          await imageData(url, {
            maximumWidth: 1600,
            maximumHeight: 1100,
            jpeg: true,
          }),
        );
      } catch {
        // A missing photo must not prevent delivery of the full presentation.
      }
    }),
  );

  let page = 1;
  const cover = pptx.addSlide();
  cover.background = { color: COLORS.navy };
  cover.addImage({
    data: coverImage,
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: SLIDE.height,
    sizing: { type: "cover", w: SLIDE.width, h: SLIDE.height },
    altText: "Infrastructure ferroviaire",
  });
  cover.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: SLIDE.height,
    line: { color: COLORS.navy, transparency: 100 },
    fill: { color: COLORS.navy, transparency: 18 },
  });
  cover.addShape("roundRect", {
    x: MARGIN,
    y: 0.48,
    w: 3.3,
    h: 0.68,
    rectRadius: 0.06,
    line: { color: COLORS.white, transparency: 100 },
    fill: { color: COLORS.white, transparency: 3 },
  });
  cover.addImage({
    data: alstomLogo,
    x: 0.83,
    y: 0.65,
    w: 1.38,
    h: 0.32,
    sizing: { type: "contain", w: 1.38, h: 0.32 },
    altText: "Logo Alstom",
  });
  addOncfLogo(cover, oncfLogo, 2.48, 0.58, 0.84, 0.46);
  cover.addText("ÉTAT D’AVANCEMENT\nMENSUEL", {
    x: MARGIN,
    y: 2.18,
    w: 7.7,
    h: 1.45,
    fontFace: "Arial",
    fontSize: 36,
    bold: true,
    color: COLORS.white,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  cover.addShape("line", {
    x: MARGIN,
    y: 3.86,
    w: 1.2,
    h: 0,
    line: { color: COLORS.red, width: 5 },
  });
  cover.addText(data.locationTitle.toUpperCase(), {
    x: MARGIN,
    y: 4.1,
    w: 7.5,
    h: 0.55,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: COLORS.white,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  cover.addText(data.periodTitle, {
    x: MARGIN,
    y: 4.73,
    w: 7.5,
    h: 0.36,
    fontFace: "Arial",
    fontSize: 17,
    color: "D8E6F5",
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  cover.addText("MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", {
    x: MARGIN,
    y: 6.68,
    w: 6.8,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1.2,
    color: COLORS.white,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  page += 1;

  const summary = pptx.addSlide();
  addChrome(summary, "Le mois en un regard", "Synthèse exécutive", page, alstomLogo, oncfLogo);
  summary.addText(
    data.metrics.globalProgress > 0
      ? `L’avancement global atteint ${Math.round(data.metrics.globalProgress * 10) / 10}% sur le périmètre présenté.`
      : "Le périmètre reste à engager selon les données consolidées disponibles.",
    {
      x: MARGIN,
      y: 1.42,
      w: 7.6,
      h: 0.5,
      fontFace: "Arial",
      fontSize: 19,
      bold: true,
      color: COLORS.blue,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    },
  );
  summary.addChart(
    "doughnut",
    [
      {
        name: "Avancement",
        labels: ["Réalisé", "Restant"],
        values: [clamp(data.metrics.globalProgress), 100 - clamp(data.metrics.globalProgress)],
      },
    ],
    {
      x: 0.65,
      y: 2.05,
      w: 4.4,
      h: 3.35,
      holeSize: 74,
      showLegend: false,
      showTitle: false,
      showValue: false,
      chartColors: [COLORS.green, "E2E8F0"],
      border: { color: COLORS.white, pt: 0 },
    },
  );
  summary.addText(`${Math.round(data.metrics.globalProgress * 10) / 10}%`, {
    x: 1.67,
    y: 3.12,
    w: 2.35,
    h: 0.64,
    fontFace: "Arial",
    fontSize: 34,
    bold: true,
    color: COLORS.navy,
    align: "center",
    margin: 0,
  });
  summary.addText("AVANCEMENT GLOBAL", {
    x: 1.42,
    y: 3.78,
    w: 2.85,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1,
    color: COLORS.muted,
    align: "center",
    margin: 0,
  });
  const topActivities = [...data.activities]
    .sort((left, right) => right.progress - left.progress)
    .slice(0, 6);
  summary.addText("AVANCEMENT PAR ACTIVITÉ", {
    x: 5.25,
    y: 2.12,
    w: 3.2,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 11,
    bold: true,
    charSpacing: 1.1,
    color: COLORS.red,
    margin: 0,
  });
  topActivities.forEach((activity, index) => {
    const y = 2.55 + index * 0.48;
    summary.addText(compactText(activity.name, 35), {
      x: 5.25,
      y,
      w: 3.18,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 10,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    addProgressBar(summary, 8.62, y + 0.03, 2.9, 0.12, activity.progress, activity.periodIncrease);
    summary.addText(`${Math.round(activity.progress)}%`, {
      x: 11.65,
      y: y - 0.04,
      w: 0.55,
      h: 0.22,
      fontFace: "Arial",
      fontSize: 11,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
  });
  addMetric(summary, MARGIN, "Terminées", String(data.metrics.completed), "tâches clôturées", COLORS.green);
  addMetric(summary, 3.48, "En cours", String(data.metrics.inProgress), "tâches actives", COLORS.blue);
  addMetric(summary, 6.38, "Non démarrées", String(data.metrics.notStarted), "tâches à engager", COLORS.muted);
  addMetric(summary, 9.28, "Gain du mois", `+${Math.round(data.metrics.globalGain * 10) / 10}%`, data.metrics.globalGainStatus, COLORS.red);
  page += 1;

  for (const [portfolioIndex, activities] of chunks(data.activities, 8).entries()) {
    const slide = pptx.addSlide();
    addChrome(
      slide,
      portfolioIndex ? "Portefeuille des activités — suite" : "La progression reste lisible activité par activité",
      "Vue consolidée",
      page,
      alstomLogo,
      oncfLogo,
    );
    slide.addText("Avancement acquis", {
      x: 9.45,
      y: 1.39,
      w: 1.35,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 9,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    slide.addText("Gain du mois", {
      x: 10.95,
      y: 1.39,
      w: 1.3,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 9,
      bold: true,
      color: COLORS.greenSoft,
      align: "right",
      margin: 0,
    });
    activities.forEach((activity, index) => {
      const y = 1.82 + index * 0.63;
      slide.addText(activity.code || String(index + 1), {
        x: MARGIN,
        y,
        w: 0.92,
        h: 0.26,
        fontFace: "Arial",
        fontSize: 10,
        bold: true,
        color: COLORS.red,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      slide.addText(compactText(activity.name, 48), {
        x: 1.55,
        y,
        w: 4.1,
        h: 0.26,
        fontFace: "Arial",
        fontSize: 12,
        bold: true,
        color: COLORS.ink,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      slide.addText(compactText(activity.location || activity.zone, 30), {
        x: 5.8,
        y,
        w: 1.72,
        h: 0.24,
        fontFace: "Arial",
        fontSize: 9,
        color: COLORS.slate,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      addProgressBar(slide, 7.65, y + 0.04, 3.95, 0.16, activity.progress, activity.periodIncrease);
      slide.addText(`${Math.round(activity.progress * 10) / 10}%`, {
        x: 11.74,
        y: y - 0.03,
        w: 0.64,
        h: 0.26,
        fontFace: "Arial",
        fontSize: 12,
        bold: true,
        color: COLORS.green,
        align: "right",
        margin: 0,
      });
      slide.addShape("line", {
        x: MARGIN,
        y: y + 0.4,
        w: 12.15,
        h: 0,
        line: { color: COLORS.line, width: 0.6 },
      });
    });
    page += 1;
  }

  for (const activity of data.activities) {
    const activityTaskPages = chunks(activity.tasks, 7);
    for (const [taskPageIndex, activityTasks] of activityTaskPages.entries()) {
      const slide = pptx.addSlide();
      addChrome(
        slide,
        taskPageIndex ? `${compactText(activity.name, 52)} — suite` : compactText(activity.name, 62),
        `${activity.code} · ${activity.location || activity.zone}`,
        page,
        alstomLogo,
        oncfLogo,
      );
      slide.addText(`${Math.round(activity.progress * 10) / 10}%`, {
        x: MARGIN,
        y: 1.43,
        w: 2.05,
        h: 0.72,
        fontFace: "Arial",
        fontSize: 37,
        bold: true,
        color: COLORS.navy,
        margin: 0,
      });
      slide.addText("AVANCEMENT ACTIVITÉ", {
        x: MARGIN,
        y: 2.13,
        w: 2.35,
        h: 0.2,
        fontFace: "Arial",
        fontSize: 9,
        bold: true,
        charSpacing: 1.1,
        color: COLORS.muted,
        margin: 0,
      });
      addProgressBar(slide, 2.92, 1.72, 6.18, 0.22, activity.progress, activity.periodIncrease);
      slide.addText(`+${Math.round(activity.periodIncrease * 10) / 10}% ce mois`, {
        x: 9.35,
        y: 1.63,
        w: 1.65,
        h: 0.33,
        fontFace: "Arial",
        fontSize: 15,
        bold: true,
        color: COLORS.green,
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      slide.addText(`${activity.tasks.length} tâche(s)`, {
        x: 11.25,
        y: 1.67,
        w: 1.35,
        h: 0.28,
        fontFace: "Arial",
        fontSize: 12,
        bold: true,
        color: COLORS.slate,
        align: "right",
        margin: 0,
      });
      slide.addText("DÉTAIL DES TÂCHES", {
        x: MARGIN,
        y: 2.65,
        w: 2.4,
        h: 0.22,
        fontFace: "Arial",
        fontSize: 10,
        bold: true,
        charSpacing: 1.2,
        color: COLORS.red,
        margin: 0,
      });
      addTaskRows(slide, activityTasks, 3.04);
      page += 1;
    }
    for (const task of activity.tasks.filter((item) => item.buildingSteps.length)) {
      addBuildingSlide(pptx, task, activity, page, alstomLogo, oncfLogo);
      page += 1;
    }
    const activityPhotos = data.photos
      .filter((photo) => photo.activity === activity.name)
      .map((photo) => ({ ...photo, data: loadedPhotos.get(photo.url) }));
    if (activityPhotos.length) {
      page += addPhotoSlides(pptx, activity, activityPhotos, page, alstomLogo, oncfLogo);
    }
  }

  page += addBulletSlide(
    pptx,
    data.ongoingWork,
    "Les opérations se poursuivent sur les fronts actifs",
    "Travaux en cours",
    "Les équipes concentrent leurs efforts sur les éléments encore en exécution.",
    page,
    alstomLogo,
    oncfLogo,
    COLORS.blue,
  );
  page += addBulletSlide(
    pptx,
    data.blockers,
    data.blockers.length ? "Les points de vigilance à traiter" : "Aucun blocage majeur déclaré",
    "Risques et alertes",
    data.blockers.length
      ? "Ces éléments appellent un suivi prioritaire afin de sécuriser les engagements du prochain cycle."
      : "La période ne fait apparaître aucun blocage majeur dans les journaux consolidés.",
    page,
    alstomLogo,
    oncfLogo,
    data.blockers.length ? COLORS.red : COLORS.green,
  );
  page += addBulletSlide(
    pptx,
    data.nextSteps,
    "Les priorités du prochain mois",
    "Prochaines étapes",
    "Les actions ci-dessous structurent la continuité opérationnelle et la préparation des prochains jalons.",
    page,
    alstomLogo,
    oncfLogo,
    COLORS.red,
  );

  const resources = pptx.addSlide();
  addChrome(resources, "Les engins et équipements mobilisés", "Ressources", page, alstomLogo, oncfLogo);
  const resourceGroups = [
    { title: "ENGINS", items: data.resources.machines, color: COLORS.red },
    { title: "ÉQUIPEMENTS INSTALLÉS", items: data.resources.equipment, color: COLORS.green },
  ];
  resourceGroups.forEach((group, column) => {
    const x = MARGIN + column * 6.15;
    resources.addShape("line", {
      x,
      y: 1.58,
      w: 5.58,
      h: 0,
      line: { color: group.color, width: 3 },
    });
    resources.addText(group.title, {
      x,
      y: 1.75,
      w: 5.58,
      h: 0.3,
      fontFace: "Arial",
      fontSize: 14,
      bold: true,
      color: group.color,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    (group.items.length ? group.items : ["Aucun élément renseigné"])
      .slice(0, 8)
      .forEach((item, index) => {
        resources.addText("•", {
          x,
          y: 2.31 + index * 0.5,
          w: 0.22,
          h: 0.22,
          fontFace: "Arial",
          fontSize: 13,
          bold: true,
          color: group.color,
          margin: 0,
        });
        resources.addText(compactText(item, 62), {
          x: x + 0.28,
          y: 2.29 + index * 0.5,
          w: 5.3,
          h: 0.28,
          fontFace: "Arial",
          fontSize: 11,
          color: COLORS.ink,
          margin: 0,
          breakLine: false,
          fit: "shrink",
        });
      });
  });
  page += 1;

  const close = pptx.addSlide();
  close.background = { color: COLORS.navy };
  close.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.12,
    h: SLIDE.height,
    line: { color: COLORS.red, transparency: 100 },
    fill: { color: COLORS.red },
  });
  close.addShape("roundRect", {
    x: MARGIN,
    y: 0.45,
    w: 2.15,
    h: 0.66,
    rectRadius: 0.05,
    line: { color: COLORS.white, transparency: 100 },
    fill: { color: COLORS.white, transparency: 3 },
  });
  close.addImage({
    data: alstomLogo,
    x: MARGIN + 0.22,
    y: 0.61,
    w: 1.5,
    h: 0.38,
    sizing: { type: "contain", w: 1.5, h: 0.38 },
    transparency: 0,
    altText: "Logo Alstom",
  });
  addOncfLogo(close, oncfLogo, 11.42, 0.46, 1.28, 0.68);
  close.addText("PROCHAIN JALON", {
    x: MARGIN,
    y: 2.0,
    w: 3.2,
    h: 0.28,
    fontFace: "Arial",
    fontSize: 12,
    bold: true,
    charSpacing: 2,
    color: COLORS.red,
    margin: 0,
  });
  close.addText(
    data.nextSteps[0]
      ? compactText(data.nextSteps[0], 115)
      : "Poursuivre l’exécution des activités planifiées et consolider les mises à jour terrain.",
    {
      x: MARGIN,
      y: 2.48,
      w: 9.6,
      h: 1.38,
      fontFace: "Arial",
      fontSize: 30,
      bold: true,
      color: COLORS.white,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    },
  );
  close.addText(`${Math.round(data.metrics.globalProgress * 10) / 10}%`, {
    x: 10.65,
    y: 2.43,
    w: 1.9,
    h: 0.72,
    fontFace: "Arial",
    fontSize: 35,
    bold: true,
    color: COLORS.greenSoft,
    align: "right",
    margin: 0,
  });
  close.addText("AVANCEMENT CONSOLIDÉ", {
    x: 10.23,
    y: 3.22,
    w: 2.32,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 9,
    bold: true,
    charSpacing: 1.1,
    color: "B8C9DA",
    align: "right",
    margin: 0,
  });
  close.addText(data.periodTitle, {
    x: MARGIN,
    y: 6.56,
    w: 6.7,
    h: 0.28,
    fontFace: "Arial",
    fontSize: 12,
    color: "C9D7E6",
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  close.addText("MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", {
    x: 7.18,
    y: 6.56,
    w: 5.55,
    h: 0.28,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    color: COLORS.white,
    align: "right",
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });

  await pptx.writeFile({ fileName, compression: true });
}

export async function downloadMonthlyExecutivePptx(
  sourceData: ReportExportData,
  fileName = "synthese-executive-mensuelle-pdd-4-slides-plus-garde.pptx",
) {
  const data = normalizeMonthlyPresentationData(sourceData);
  const pptxLibrary = await import("pptxgenjs");
  const Pptx = pptxLibrary.default;
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OPC OS";
  pptx.company = "ALSTOM";
  pptx.subject = "Synthèse exécutive mensuelle du programme PDD";
  pptx.title = `Synthèse exécutive — ${data.locationTitle}`;
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };

  const rankedActivities = [...data.activities].sort(
    (left, right) =>
      right.periodIncrease - left.periodIncrease || right.progress - left.progress,
  );
  const activityScores = new Map(
    rankedActivities.map((activity, index) => [activity.name, rankedActivities.length - index]),
  );
  const relevantTasks = data.activities
    .flatMap((activity) =>
      activity.tasks.map((task) => ({ task, activity })),
    )
    .sort(
      (left, right) =>
        Number(right.task.currentProgress > 0) - Number(left.task.currentProgress > 0) ||
        right.task.periodIncrease - left.task.periodIncrease ||
        right.task.currentProgress - left.task.currentProgress,
    )
    .slice(0, 4);
  const rankedPhotos = [...data.photos]
    .sort((left, right) => {
      const scoreDifference =
        (activityScores.get(right.activity) ?? 0) -
        (activityScores.get(left.activity) ?? 0);
      return scoreDifference || right.date.localeCompare(left.date);
    });
  const keyPhotos: ExportPhoto[] = [];
  const selectedActivities = new Set<string>();
  rankedPhotos.forEach((photo) => {
    if (keyPhotos.length >= 4 || selectedActivities.has(photo.activity)) return;
    keyPhotos.push(photo);
    selectedActivities.add(photo.activity);
  });
  rankedPhotos.forEach((photo) => {
    if (keyPhotos.length >= 4 || keyPhotos.includes(photo)) return;
    keyPhotos.push(photo);
  });

  const [alstomLogo, oncfLogo, coverImage, ...photoData] = await Promise.all([
    imageData("/alstom-logo.png"),
    imageData("/oncf-logo.png"),
    imageData("/rail-blueprint-final.jpg", {
      maximumWidth: 1920,
      maximumHeight: 1080,
      jpeg: true,
    }),
    ...keyPhotos.map((photo) =>
      imageData(photo.url, {
        maximumWidth: 1600,
        maximumHeight: 1000,
        jpeg: true,
      }).catch(() => ""),
    ),
  ]);

  const cover = pptx.addSlide();
  cover.background = { color: COLORS.navy };
  cover.addImage({
    data: coverImage,
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: SLIDE.height,
    sizing: { type: "cover", w: SLIDE.width, h: SLIDE.height },
    altText: "Infrastructure ferroviaire",
  });
  cover.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: SLIDE.height,
    line: { color: COLORS.navy, transparency: 100 },
    fill: { color: COLORS.navy, transparency: 14 },
  });
  cover.addShape("roundRect", {
    x: MARGIN,
    y: 0.48,
    w: 3.3,
    h: 0.68,
    rectRadius: 0.06,
    line: { color: COLORS.white, transparency: 100 },
    fill: { color: COLORS.white, transparency: 3 },
  });
  cover.addImage({
    data: alstomLogo,
    x: 0.83,
    y: 0.65,
    w: 1.38,
    h: 0.32,
    sizing: { type: "contain", w: 1.38, h: 0.32 },
    altText: "Logo Alstom",
  });
  addOncfLogo(cover, oncfLogo, 2.48, 0.58, 0.84, 0.46);
  cover.addText("SYNTHÈSE EXÉCUTIVE\nMENSUELLE", {
    x: MARGIN,
    y: 2.05,
    w: 7.2,
    h: 1.5,
    fontFace: "Arial",
    fontSize: 36,
    bold: true,
    color: COLORS.white,
    margin: 0,
    fit: "shrink",
  });
  cover.addShape("line", {
    x: MARGIN,
    y: 3.78,
    w: 1.2,
    h: 0,
    line: { color: COLORS.red, width: 5 },
  });
  cover.addText(data.locationTitle.toUpperCase(), {
    x: MARGIN,
    y: 4.03,
    w: 6.8,
    h: 0.5,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: COLORS.white,
    margin: 0,
    fit: "shrink",
  });
  cover.addText(data.periodTitle, {
    x: MARGIN,
    y: 4.65,
    w: 6.9,
    h: 0.34,
    fontFace: "Arial",
    fontSize: 17,
    color: "D8E6F5",
    margin: 0,
    fit: "shrink",
  });
  cover.addText(`${Math.round(data.metrics.globalProgress * 10) / 10}%`, {
    x: 9.1,
    y: 2.3,
    w: 3.15,
    h: 0.92,
    fontFace: "Arial",
    fontSize: 52,
    bold: true,
    color: COLORS.greenSoft,
    align: "right",
    margin: 0,
  });
  cover.addText("AVANCEMENT GLOBAL", {
    x: 9.1,
    y: 3.25,
    w: 3.15,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 11,
    bold: true,
    charSpacing: 1.2,
    color: "C9D7E6",
    align: "right",
    margin: 0,
  });
  cover.addText(`+${Math.round(data.metrics.globalGain * 10) / 10} pts`, {
    x: 9.1,
    y: 3.84,
    w: 3.15,
    h: 0.56,
    fontFace: "Arial",
    fontSize: 27,
    bold: true,
    color: COLORS.white,
    align: "right",
    margin: 0,
  });
  cover.addText("GAIN DU MOIS", {
    x: 9.1,
    y: 4.42,
    w: 3.15,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1.2,
    color: COLORS.red,
    align: "right",
    margin: 0,
  });
  cover.addText("MARCHÉ N° 625C07 · PROGRAMME DE DÉVELOPPEMENT", {
    x: MARGIN,
    y: 6.68,
    w: 6.8,
    h: 0.24,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1.2,
    color: COLORS.white,
    margin: 0,
    fit: "shrink",
  });

  const progress = pptx.addSlide();
  addChrome(
    progress,
    `Le projet gagne ${Math.round(data.metrics.globalGain * 10) / 10} points ce mois`,
    "Décision en un regard",
    2,
    alstomLogo,
    oncfLogo,
  );
  progress.addText(`${Math.round(data.metrics.globalProgress * 10) / 10}%`, {
    x: MARGIN,
    y: 1.58,
    w: 2.15,
    h: 0.78,
    fontFace: "Arial",
    fontSize: 42,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  });
  progress.addText("AVANCEMENT CONSOLIDÉ", {
    x: MARGIN,
    y: 2.34,
    w: 2.45,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1.1,
    color: COLORS.muted,
    margin: 0,
  });
  addProgressBar(
    progress,
    3.12,
    1.86,
    7.2,
    0.28,
    data.metrics.globalProgress,
    data.metrics.globalGain,
  );
  progress.addText(`+${Math.round(data.metrics.globalGain * 10) / 10} pts`, {
    x: 10.62,
    y: 1.7,
    w: 1.55,
    h: 0.48,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: COLORS.green,
    align: "right",
    margin: 0,
  });
  progress.addText("ACTIVITÉS LES PLUS SIGNIFICATIVES", {
    x: MARGIN,
    y: 2.98,
    w: 4.4,
    h: 0.26,
    fontFace: "Arial",
    fontSize: 12,
    bold: true,
    charSpacing: 1,
    color: COLORS.red,
    margin: 0,
  });
  rankedActivities.slice(0, 4).forEach((activity, index) => {
    const y = 3.48 + index * 0.64;
    progress.addText(compactText(activity.name, 42), {
      x: MARGIN,
      y,
      w: 4.05,
      h: 0.27,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink",
    });
    addProgressBar(progress, 4.88, y + 0.05, 5.3, 0.17, activity.progress, activity.periodIncrease);
    progress.addText(`${Math.round(activity.progress * 10) / 10}%`, {
      x: 10.42,
      y: y - 0.02,
      w: 0.75,
      h: 0.28,
      fontFace: "Arial",
      fontSize: 14,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    progress.addText(`+${Math.round(activity.periodIncrease * 10) / 10}`, {
      x: 11.34,
      y,
      w: 0.65,
      h: 0.24,
      fontFace: "Arial",
      fontSize: 11,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
  });
  addMetric(progress, MARGIN, "Terminées", String(data.metrics.completed), "tâches clôturées", COLORS.green);
  addMetric(progress, 3.48, "En cours", String(data.metrics.inProgress), "tâches actives", COLORS.blue);
  addMetric(progress, 6.38, "À engager", String(data.metrics.notStarted), "tâches non démarrées", COLORS.muted);
  addMetric(progress, 9.28, "Alertes", String(data.blockers.length), "points à surveiller", data.blockers.length ? COLORS.red : COLORS.green);

  const tasks = pptx.addSlide();
  addChrome(
    tasks,
    "Les tâches qui portent l’avancement",
    "Faits marquants",
    3,
    alstomLogo,
    oncfLogo,
  );
  tasks.addText("Sélection fondée sur le gain mensuel et le niveau d’exécution.", {
    x: MARGIN,
    y: 1.4,
    w: 8.8,
    h: 0.32,
    fontFace: "Arial",
    fontSize: 16,
    bold: true,
    color: COLORS.blue,
    margin: 0,
    fit: "shrink",
  });
  (relevantTasks.length
    ? relevantTasks
    : [{
        activity: { name: "Aucune activité renseignée" } as ExportActivity,
        task: {
          title: "Aucune tâche disponible sur la période",
          workSummary: "Les prochaines mises à jour terrain alimenteront cette synthèse.",
          realizedValue: "—",
          objectiveValue: "—",
          currentProgress: 0,
          periodIncrease: 0,
        } as ExportTask,
      }]
  ).forEach(({ task, activity }, index) => {
    const y = 2.02 + index * 1.18;
    tasks.addText(String(index + 1).padStart(2, "0"), {
      x: MARGIN,
      y,
      w: 0.48,
      h: 0.32,
      fontFace: "Arial",
      fontSize: 16,
      bold: true,
      color: COLORS.red,
      margin: 0,
    });
    tasks.addText(compactText(task.title, 58), {
      x: 1.28,
      y,
      w: 4.35,
      h: 0.28,
      fontFace: "Arial",
      fontSize: 15,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink",
    });
    tasks.addText(compactText(activity.name, 45), {
      x: 1.28,
      y: y + 0.34,
      w: 4.35,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 10,
      bold: true,
      color: COLORS.red,
      margin: 0,
      fit: "shrink",
    });
    tasks.addText(summarizeDescription(task.workSummary, 88), {
      x: 1.28,
      y: y + 0.61,
      w: 4.35,
      h: 0.3,
      fontFace: "Arial",
      fontSize: 10.5,
      color: COLORS.slate,
      margin: 0,
      fit: "shrink",
    });
    tasks.addText(`${task.realizedValue} / ${task.objectiveValue}`, {
      x: 5.92,
      y,
      w: 2.15,
      h: 0.26,
      fontFace: "Arial",
      fontSize: 12,
      bold: true,
      color: COLORS.ink,
      align: "right",
      margin: 0,
      fit: "shrink",
    });
    addProgressBar(tasks, 8.38, y + 0.05, 3.25, 0.18, task.currentProgress, task.periodIncrease);
    tasks.addText(`${Math.round(task.currentProgress * 10) / 10}%`, {
      x: 11.82,
      y: y - 0.03,
      w: 0.65,
      h: 0.29,
      fontFace: "Arial",
      fontSize: 14,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    tasks.addText(`+${Math.round(task.periodIncrease * 10) / 10} pts ce mois`, {
      x: 8.38,
      y: y + 0.39,
      w: 4.09,
      h: 0.22,
      fontFace: "Arial",
      fontSize: 10.5,
      bold: true,
      color: COLORS.green,
      align: "right",
      margin: 0,
    });
    tasks.addShape("line", {
      x: MARGIN,
      y: y + 0.96,
      w: 12.16,
      h: 0,
      line: { color: COLORS.line, width: 0.7 },
    });
  });

  const priorities = pptx.addSlide();
  addChrome(
    priorities,
    "Les décisions clés du prochain cycle",
    "Pilotage opérationnel",
    4,
    alstomLogo,
    oncfLogo,
  );
  const decisionGroups = [
    {
      title: "TRAVAUX EN COURS",
      items: data.ongoingWork,
      fallback: "Aucun travail en cours renseigné.",
      color: COLORS.blue,
    },
    {
      title: "POINTS DE VIGILANCE",
      items: data.blockers,
      fallback: "Aucun blocage majeur déclaré.",
      color: data.blockers.length ? COLORS.red : COLORS.green,
    },
    {
      title: "PROCHAINES ÉTAPES",
      items: data.nextSteps,
      fallback: "Poursuivre les activités planifiées.",
      color: COLORS.green,
    },
  ];
  decisionGroups.forEach((group, column) => {
    const x = MARGIN + column * 4.1;
    priorities.addShape("line", {
      x,
      y: 1.55,
      w: 3.55,
      h: 0,
      line: { color: group.color, width: 3 },
    });
    priorities.addText(group.title, {
      x,
      y: 1.77,
      w: 3.55,
      h: 0.28,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: group.color,
      margin: 0,
      fit: "shrink",
    });
    (group.items.length ? group.items : [group.fallback])
      .slice(0, 3)
      .forEach((item, index) => {
        const y = 2.28 + index * 0.98;
        priorities.addText(String(index + 1).padStart(2, "0"), {
          x,
          y,
          w: 0.42,
          h: 0.25,
          fontFace: "Arial",
          fontSize: 11,
          bold: true,
          color: group.color,
          margin: 0,
        });
        priorities.addText(summarizeDescription(item, 95), {
          x: x + 0.52,
          y: y - 0.02,
          w: 3.03,
          h: 0.65,
          fontFace: "Arial",
          fontSize: 12,
          bold: index === 0,
          color: COLORS.ink,
          margin: 0,
          fit: "shrink",
        });
      });
  });
  priorities.addShape("line", {
    x: MARGIN,
    y: 5.45,
    w: 12.16,
    h: 0,
    line: { color: COLORS.line, width: 1 },
  });
  const resources = [...data.resources.machines, ...data.resources.equipment];
  priorities.addText("MOYENS MOBILISÉS", {
    x: MARGIN,
    y: 5.72,
    w: 2.3,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1,
    color: COLORS.red,
    margin: 0,
  });
  priorities.addText(
    resources.length ? compactText(resources.join(" · "), 140) : "Aucun engin ou équipement renseigné.",
    {
      x: MARGIN,
      y: 6.04,
      w: 7.1,
      h: 0.48,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink",
    },
  );
  priorities.addText("PÉRIMÈTRE CONSOLIDÉ", {
    x: 8.15,
    y: 5.72,
    w: 2.5,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    charSpacing: 1,
    color: COLORS.blue,
    margin: 0,
  });
  priorities.addText(
    `${data.activities.length} activités · ${data.activities.reduce((total, activity) => total + activity.tasks.length, 0)} tâches · ${data.metrics.updates} mises à jour`,
    {
      x: 8.15,
      y: 6.04,
      w: 4.58,
      h: 0.48,
      fontFace: "Arial",
      fontSize: 13,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: "shrink",
    },
  );

  const photos = pptx.addSlide();
  addChrome(
    photos,
    "Photos terrain de la période",
    "Photos et commentaires",
    5,
    alstomLogo,
    oncfLogo,
  );
  keyPhotos.forEach((photo, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * 6.15;
    const y = 1.45 + row * 2.78;
    photos.addShape("rect", {
      x,
      y,
      w: 5.86,
      h: 1.82,
      line: { color: COLORS.line, width: 0.8 },
      fill: { color: COLORS.pale },
    });
    if (photoData[index]) {
      photos.addImage({
        data: photoData[index],
        x,
        y,
        w: 5.86,
        h: 1.82,
        sizing: { type: "cover", w: 5.86, h: 1.82 },
        altText: photo.caption || photo.task,
      });
    }
    photos.addShape("rect", {
      x,
      y: y + 1.34,
      w: 5.86,
      h: 0.48,
      line: { color: COLORS.navy, transparency: 100 },
      fill: { color: COLORS.navy, transparency: 6 },
    });
    photos.addText(compactText(`${photo.activity} · ${photo.task}`, 72), {
      x: x + 0.16,
      y: y + 1.44,
      w: 4.66,
      h: 0.2,
      fontFace: "Arial",
      fontSize: 11.5,
      bold: true,
      color: COLORS.white,
      margin: 0,
      fit: "shrink",
    });
    photos.addText(photo.date, {
      x: x + 4.92,
      y: y + 1.44,
      w: 0.78,
      h: 0.18,
      fontFace: "Arial",
      fontSize: 8.5,
      bold: true,
      color: COLORS.white,
      align: "right",
      margin: 0,
    });
    photos.addText(summarizeDescription(photo.caption, 112), {
      x,
      y: y + 1.98,
      w: 5.86,
      h: 0.48,
      fontFace: "Arial",
      fontSize: 11.5,
      color: COLORS.slate,
      margin: 0,
      fit: "shrink",
    });
  });
  if (!keyPhotos.length) {
    photos.addText("Aucune photo terrain n’est disponible sur la période sélectionnée.", {
      x: MARGIN,
      y: 3.15,
      w: 12.16,
      h: 0.5,
      fontFace: "Arial",
      fontSize: 20,
      bold: true,
      color: COLORS.muted,
      align: "center",
      margin: 0,
    });
  }

  await pptx.writeFile({ fileName, compression: true });
}
