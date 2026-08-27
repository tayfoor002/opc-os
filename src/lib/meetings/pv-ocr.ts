import type { MeetingType } from "@/types/meeting";

export type PvOcrParticipant = {
  name: string;
  company: string;
  role: string;
};

export type PvOcrAgendaPoint = {
  subject: string;
  discussion: string;
  decision: string;
  owner: string;
  due_date: string;
  status: "open" | "done";
};

export type PvOcrResult = {
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location: string;
  meeting_type: MeetingType;
  objective: string;
  introduction: string;
  participants: PvOcrParticipant[];
  agenda_points: PvOcrAgendaPoint[];
  general_notes: string;
  next_meeting_date: string;
  confidence: number;
  warnings: string[];
  uncertain_fragments: string[];
  page_count: number;
};

const MAX_PDF_PAGES = 12;
const MAX_IMAGE_SIDE = 2400;

function enhanceCanvas(source: HTMLCanvasElement) {
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Traitement de l’image indisponible.");
  context.drawImage(source, 0, 0);

  const pixels = context.getImageData(0, 0, output.width, output.height);
  const luminances = new Uint8Array(pixels.data.length / 4);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = Math.round(
      pixels.data[index] * 0.299 +
        pixels.data[index + 1] * 0.587 +
        pixels.data[index + 2] * 0.114,
    );
    luminances[index / 4] = value;
    histogram[value] += 1;
  }

  const total = luminances.length;
  const percentile = (ratio: number) => {
    const target = total * ratio;
    let sum = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      sum += histogram[value];
      if (sum >= target) return value;
    }
    return 255;
  };
  const low = percentile(0.02);
  const high = Math.max(low + 25, percentile(0.98));

  for (let index = 0; index < pixels.data.length; index += 4) {
    const stretched = Math.max(
      0,
      Math.min(255, ((luminances[index / 4] - low) * 255) / (high - low)),
    );
    // Preserve grey pencil strokes while whitening paper and reinforcing ink.
    const enhanced = stretched > 212
      ? 255
      : stretched < 78
        ? Math.max(0, stretched * 0.72)
        : Math.max(0, stretched * 0.9 - 5);
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function canvasToJpeg(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], name, { type: "image/jpeg" }))
          : reject(new Error("Impossible de préparer le scan.")),
      "image/jpeg",
      0.9,
    ),
  );
}

async function imageToCanvas(file: File) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Lecture de l’image indisponible.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function createEnhancedPvPages(
  file: File,
  onProgress?: (label: string) => void,
) {
  if (file.type !== "application/pdf") {
    onProgress?.("Amélioration du contraste et de la netteté…");
    const canvas = await imageToCanvas(file);
    return [await canvasToJpeg(enhanceCanvas(canvas), "page-1-renforcee.jpg")];
  }

  onProgress?.("Lecture des pages du PDF…");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const count = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    onProgress?.(`Renforcement de la page ${pageNumber}/${count}…`);
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_IMAGE_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Rendu du PDF indisponible.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(
      await canvasToJpeg(
        enhanceCanvas(canvas),
        `page-${pageNumber}-renforcee.jpg`,
      ),
    );
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

export async function analyzeHandwrittenPv(
  file: File,
  zoneName: string,
  classification: MeetingType,
  onProgress?: (label: string) => void,
) {
  const enhancedPages = await createEnhancedPvPages(file, onProgress);
  onProgress?.("Lecture attentive du manuscrit et contrôle des incohérences…");
  const data = new FormData();
  data.append("file", file);
  data.append("zone", zoneName);
  data.append("classification", classification);
  enhancedPages.forEach((page) => data.append("enhanced_pages", page));

  const response = await fetch("/api/meetings/ocr-pv", {
    method: "POST",
    body: data,
  });
  const payload = (await response.json()) as
    | { result: PvOcrResult }
    | { error: string };
  if (!response.ok || !("result" in payload)) {
    throw new Error(
      "error" in payload ? payload.error : "Analyse du PV impossible.",
    );
  }
  return payload.result;
}
