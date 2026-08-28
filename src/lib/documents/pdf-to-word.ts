import {
  generatePvWordBlob,
  type GeneratedPv,
} from "@/lib/documents/pv-generator";

type PdfLine = { text: string; page: number; y: number };
type PdfTextItem = { str: string; transform: number[]; width: number };
type PositionedItem = { text: string; x: number; page: number };

function normalizeLine(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function linesFromItems(items: PdfTextItem[], page: number): PdfLine[] {
  const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5] ?? 0;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (row) row.items.push(item);
    else rows.push({ y, items: [item] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.items.sort(
        (left, right) => (left.transform[4] ?? 0) - (right.transform[4] ?? 0),
      );
      let text = "";
      let previousEnd = 0;
      for (const item of ordered) {
        const x = item.transform[4] ?? 0;
        if (text && x - previousEnd > 2) text += " ";
        text += item.str;
        previousEnd = x + (item.width || 0);
      }
      return { text: normalizeLine(text), page, y: row.y };
    })
    .filter(({ text }) => {
      if (!text || /^Page\s+\d+\s*\/\s*\d+$/i.test(text)) return false;
      return !/^MARCHÉ N°.*PROGRAMME DE DÉVELOPPEMENT$/i.test(text);
    });
}

function sectionIndex(lines: PdfLine[], pattern: RegExp) {
  return lines.findIndex(({ text }) => pattern.test(text));
}

function paragraphText(lines: PdfLine[]) {
  const blocks: string[] = [];
  let current = "";
  let previous: PdfLine | null = null;
  for (const line of lines) {
    const startsNewBlock =
      previous && (line.page !== previous.page || previous.y - line.y > 19);
    if (startsNewBlock && current) {
      blocks.push(current.trim());
      current = "";
    }
    current += `${current ? " " : ""}${line.text}`;
    previous = line;
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks.join("\n\n");
}

function metadata(lines: PdfLine[]) {
  const result = {
    date: "",
    classification: "",
    project: "Projet PDD",
    company: "",
    zone: "",
    location: "",
    startTime: "",
    endTime: "",
  };
  for (const { text } of lines) {
    let match = text.match(/^Date\s*(.*?)\s+Classement\s*(.*)$/i);
    if (match) {
      result.date = match[1].trim();
      result.classification = match[2].trim();
      continue;
    }
    match = text.match(/^Projet\s*(.*?)\s+Entreprise\s*(.*)$/i);
    if (match) {
      result.project = match[1].trim() || result.project;
      result.company = match[2].trim();
      continue;
    }
    match = text.match(/^Zone\s*(.*?)\s+Lieu\s*(.*)$/i);
    if (match) {
      result.zone = match[1].trim();
      result.location = match[2].trim();
      continue;
    }
    match = text.match(/^Horaire\s*(.*)$/i);
    if (match) {
      const times = match[1].match(/\b\d{1,2}(?::|h)\d{2}\b/gi) ?? [];
      result.startTime = times[0]?.replace(/h/i, ":") ?? "";
      result.endTime = times[1]?.replace(/h/i, ":") ?? "";
    }
  }
  return result;
}

function signatories(items: PositionedItem[]): GeneratedPv["signatories"] {
  const companies = ["ONCF", "ALSTOM", "AVANZIT"] as const;
  return companies.map((company, index) => {
    const inColumn = (item: PositionedItem) => {
      const column = item.x < 198 ? 0 : item.x < 397 ? 1 : 2;
      return column === index;
    };
    const name = items.find(
      (item) => inColumn(item) && /^Nom et prénom\s*:/i.test(item.text),
    )?.text.replace(/^Nom et prénom\s*:\s*/i, "") ?? "";
    const role = items.find(
      (item) => inColumn(item) && /^Fonction\s*:/i.test(item.text),
    )?.text.replace(/^Fonction\s*:\s*/i, "") ?? "";
    return { company, name, role };
  });
}

export async function convertPdfBlobToEditableWord(pdfBlob: Blob): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
  const lines: PdfLine[] = [];
  const positionedItems: PositionedItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is typeof item & PdfTextItem => "str" in item,
      );
      lines.push(...linesFromItems(items, pageNumber));
      positionedItems.push(
        ...items.map((item) => ({
          text: normalizeLine(item.str),
          x: item.transform[4] ?? 0,
          page: pageNumber,
        })),
      );
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  if (!lines.length) throw new Error("Ce PDF ne contient pas de texte numérique modifiable.");

  const titleIndex = sectionIndex(lines, /^PROCÈS[- ]VERBAL$/i);
  const firstMetadataIndex = lines.findIndex(({ text }) => /^Date\b/i.test(text));
  const objectIndex = sectionIndex(lines, /^1\.\s+OBJET DU PROCÈS-VERBAL/i);
  const contentIndex = sectionIndex(lines, /^2\.\s+CONTENU DU PROCÈS-VERBAL/i);
  const signaturesIndex = sectionIndex(lines, /^3\.\s+VISA ET SIGNATURES/i);
  if (objectIndex < 0 || contentIndex < 0 || signaturesIndex < 0) {
    throw new Error("La structure OPC OS de ce PV n’a pas pu être reconnue.");
  }

  const info = metadata(lines.slice(Math.max(0, firstMetadataIndex), objectIndex));
  const title = lines
    .slice(titleIndex + 1, firstMetadataIndex > titleIndex ? firstMetadataIndex : objectIndex)
    .map(({ text }) => text)
    .join(" ")
    .trim() || "Procès-verbal";
  const objective = paragraphText(lines.slice(objectIndex + 1, contentIndex));
  const introduction = paragraphText(lines.slice(contentIndex + 1, signaturesIndex));
  const generatedPv: GeneratedPv = {
    title,
    meeting_date: info.date,
    start_time: info.startTime,
    end_time: info.endTime,
    location: info.location,
    objective,
    introduction,
    participants: [],
    agenda_points: [],
    general_notes: "",
    next_meeting_date: "",
    reference: "",
    zone_name: info.zone,
    classification: info.classification,
    project_name: info.project,
    issuer_company: info.company,
    show_logos: { oncf: true, alstom: true, avanzit: true },
    signatories: signatories(positionedItems),
  };
  return generatePvWordBlob(generatedPv);
}
