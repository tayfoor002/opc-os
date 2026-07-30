import type { DocumentEditValues } from "@/lib/documents/types";

export type DocumentMetadataInference = {
  values: Partial<DocumentEditValues>;
  detectedFields: string[];
  warning: string | null;
  titleDetectedFromCover: boolean;
};

type PdfInfo = {
  Title?: string;
  Subject?: string;
  Author?: string;
  CreationDate?: string;
  ModDate?: string;
};

type PositionedPdfText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfTextRow = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function cleanFileStem(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function findReference(value: string) {
  const normalized = value
    .replace(/[–—_]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .toUpperCase();
  const compact = normalized.replace(/\s+/g, "");
  const opcReference = compact.match(
    /\bSI1-T-EF-[A-Z0-9]{2,6}-(?:PRQ|PRO|PLC|PLN|PV|PVI|ICP|NDC)-[A-Z0-9]{4}\b/,
  );
  if (opcReference) return opcReference[0];
  const matches =
    normalized.match(
      /\b[A-Z0-9]{2,5}(?:-[A-Z0-9]{1,12}){4,8}\b/g,
    ) ?? [];
  return (
    matches.find((candidate) =>
      /-(?:PRQ|PRO|PLC|PLN|PV|PVI|ICP|NDC)-/.test(candidate),
    ) ??
    matches[0] ??
    ""
  );
}

function referencePrefixPattern(reference: string) {
  const parts = reference.split("-").map((part) =>
    part
      .split("")
      .map((character) => `${character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`)
      .join(""),
  );
  return new RegExp(
    `^\\s*${parts.join("[-–—_\\s]+")}\\s*(?:[-–—_:|]+\\s*)?`,
    "i",
  );
}

function separateTitle(value: string, reference: string, revision: string) {
  let title = value.trim();
  if (reference) title = title.replace(referencePrefixPattern(reference), "");
  if (revision) {
    title = title.replace(
      new RegExp(
        `(?:\\s*[-–—_:|]+\\s*)?(?:REV(?:ISION)?|IND(?:ICE)?)?\\s*${revision}\\s*$`,
        "i",
      ),
      "",
    );
  }
  return title
    .replace(/^[\s\-–—_:|()[\]]+|[\s\-–—_:|()[\]]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findRevision(value: string) {
  const normalized = normalizeSearch(value);
  const explicit = normalized.match(
    /\b(?:REV(?:ISION)?|IND(?:ICE)?)\s*[:.\-]?\s*(V?\d{1,3}|[A-Z])\b/,
  );
  const generic = normalized.match(/\bV\s*0*(\d{1,3})\b/);
  if (generic) {
    return `V${Number(generic[1]).toString().padStart(2, "0")}`;
  }
  if (!explicit) return "";
  const raw = explicit[1];
  return /^\d+$/.test(raw)
    ? `V${Number(raw).toString().padStart(2, "0")}`
    : raw;
}

function revisionRank(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/);
  if (match) return Number(match[0].replace(",", "."));
  const letter = value.trim().toUpperCase().match(/^[A-Z]$/);
  return letter ? letter[0].charCodeAt(0) - 64 : -1;
}

function revisionFromHistoryRow(value: string, reference: string) {
  const explicit = findRevision(value);
  if (explicit) return explicit;
  const remainder = value
    .replace(referencePrefixPattern(reference), "")
    .replace(/^[\s:|_-]+/, "")
    .trim();
  const bare = remainder.match(/^(?:V\s*)?0*(\d{1,3})$|^([A-Z])$/i);
  if (!bare) return "";
  return bare[1]
    ? `V${Number(bare[1]).toString().padStart(2, "0")}`
    : bare[2].toUpperCase();
}

function groupPositionedText(items: PositionedPdfText[]): PdfTextRow[] {
  const rows: Array<{ y: number; items: PositionedPdfText[] }> = [];

  for (const item of items.filter(({ text }) => text.trim())) {
    const row = rows.find(({ y }) => Math.abs(y - item.y) <= 3);
    if (row) {
      row.items.push(item);
      row.y =
        row.items.reduce((sum, current) => sum + current.y, 0) /
        row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .map((row) => {
      const sorted = row.items.slice().sort((left, right) => left.x - right.x);
      const first = sorted[0];
      const last = sorted.at(-1)!;
      return {
        text: sorted
          .map(({ text }) => text.trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
        x: first.x,
        y: row.y,
        width: last.x + last.width - first.x,
        height: Math.max(...sorted.map(({ height }) => height)),
      };
    })
    .sort((left, right) => right.y - left.y);
}

function findReferenceInColumnText(value: string) {
  const compact = value
    .toUpperCase()
    .replace(/[–—_]/g, "-")
    .replace(/\s+/g, "");
  const knownReference = compact.match(
      /SI1-T-EF-[A-Z0-9]{2,8}-(?:PRQ|PRO|PLC|PLN|PV|PVI|ICP|NDC)-[A-Z0-9]{3,6}/,
    )?.[0];
  if (knownReference) return knownReference;
  const direct = findReference(value);
  if (!direct) return "";
  const parts = direct.split("-");
  return parts.length >= 6 &&
    !/^(?:PRQ|PRO|PLC|PLN|PV|PVI|ICP|NDC)$/.test(parts.at(-1) ?? "")
    ? direct
    : "";
}

function metadataFromReferenceColumn(
  items: PositionedPdfText[],
  rows: PdfTextRow[],
) {
  const historyHeading = rows.find((row) =>
    normalizeSearch(row.text).includes("HISTORIQUE DE MODIFICATION"),
  );
  const directHeaders = items.filter((item) => {
    const normalized = normalizeSearch(item.text).replace(/[^A-Z]/g, "");
    return (
      (normalized === "REFERENCE" ||
        normalized === "REFERENCEDOCUMENT" ||
        normalized === "REF") &&
      (!historyHeading ||
        (item.y < historyHeading.y && item.y >= historyHeading.y - 260))
    );
  });
  const fragmentedHeaders: PositionedPdfText[] = [];
  for (const row of rows) {
    if (
      historyHeading &&
      (row.y >= historyHeading.y || row.y < historyHeading.y - 260)
    ) {
      continue;
    }
    const rowItems = items
      .filter((item) => Math.abs(item.y - row.y) <= 3 && item.text.trim())
      .sort((left, right) => left.x - right.x);
    for (let start = 0; start < rowItems.length; start += 1) {
      let combined = "";
      for (
        let end = start;
        end < Math.min(rowItems.length, start + 12);
        end += 1
      ) {
        combined += rowItems[end].text;
        const normalized = normalizeSearch(combined).replace(/[^A-Z]/g, "");
        if (normalized === "REFERENCE" || normalized === "REFERENCEDOCUMENT") {
          const first = rowItems[start];
          const last = rowItems[end];
          fragmentedHeaders.push({
            text: combined,
            x: first.x,
            y: row.y,
            width: last.x + last.width - first.x,
            height: Math.max(
              ...rowItems
                .slice(start, end + 1)
                .map(({ height }) => height),
            ),
          });
          break;
        }
        if (!"REFERENCEDOCUMENT".startsWith(normalized)) {
          break;
        }
      }
    }
  }
  const possibleHeaders = [...directHeaders, ...fragmentedHeaders];

  for (const header of possibleHeaders.sort((left, right) => right.y - left.y)) {
    const sameHeaderRow = items
      .filter(
        (item) =>
          Math.abs(item.y - header.y) <= 6 &&
          item.x > header.x + Math.max(header.width, 8),
      )
      .sort((left, right) => left.x - right.x);
    const revisionHeader =
      sameHeaderRow.find((item) =>
        /REVISION|VERSION|INDICE/.test(normalizeSearch(item.text)),
      ) ?? sameHeaderRow[0];
    const revisionHeaderIndex = revisionHeader
      ? sameHeaderRow.indexOf(revisionHeader)
      : -1;
    const nextHeader =
      revisionHeaderIndex >= 0
        ? sameHeaderRow[revisionHeaderIndex + 1]
        : undefined;
    const revisionCenter = revisionHeader
      ? revisionHeader.x + revisionHeader.width / 2
      : 0;
    const revisionRightBoundary =
      revisionHeader && nextHeader
        ? (revisionCenter + nextHeader.x + nextHeader.width / 2) / 2
        : Number.POSITIVE_INFINITY;
    const rightBoundary = revisionHeader
      ? revisionHeader.x - 2
      : header.x + Math.max(220, header.width * 4);
    // The header label is centered inside the first cell, while the
    // reference value is left-aligned. Keep the complete first column
    // instead of treating the header text position as the cell boundary.
    const leftBoundary = Math.max(
      0,
      header.x - Math.max(80, header.width * 1.8),
    );
    const columnItems = items.filter(
      (item) =>
        item.y < header.y - 2 &&
        item.y >= header.y - 190 &&
        item.x >= leftBoundary &&
        item.x < rightBoundary &&
        item.text.trim(),
    );
    const columnRows = groupPositionedText(columnItems);
    const detectedRows: Array<{
      reference: string;
      revision: string;
      y: number;
    }> = [];

    for (let index = 0; index < columnRows.length; index += 1) {
      const fragments = columnRows
        .slice(index, index + 3)
        .map(({ text }) => text);
      for (let length = 1; length <= fragments.length; length += 1) {
        const combined = fragments.slice(0, length).join("");
        const reference = findReferenceInColumnText(combined);
        if (!reference) continue;
        const referenceY = columnRows[index].y;
        const revisionItems = items.filter(
          (item) =>
            revisionHeader &&
            item.y < revisionHeader.y - 2 &&
            item.y >= revisionHeader.y - 190 &&
            item.x >=
              revisionHeader.x -
                Math.max(20, revisionHeader.width * 0.6) &&
            item.x < revisionRightBoundary &&
            Math.abs(item.y - referenceY) <= 18 &&
            item.text.trim(),
        );
        const revisionText = revisionItems
          .sort((left, right) => left.x - right.x)
          .map(({ text }) => text)
          .join(" ");
        detectedRows.push({
          reference,
          revision:
            findRevision(revisionText) ||
            revisionFromHistoryRow(revisionText, reference),
          y: referenceY,
        });
        break;
      }
    }

    if (detectedRows.length) {
      return detectedRows.sort((left, right) => {
        const revisionOrder =
          revisionRank(right.revision) - revisionRank(left.revision);
        // When revisions are equal or non-numeric, the lower row is the
        // latest entry in the history table.
        return revisionOrder || left.y - right.y;
      })[0];
    }
  }

  return { reference: "", revision: "" };
}

function metadataFromModificationHistory(
  items: PositionedPdfText[],
  rows: PdfTextRow[],
) {
  const columnMetadata = metadataFromReferenceColumn(items, rows);
  if (columnMetadata.reference) {
    return columnMetadata;
  }

  const historyIndex = rows.findIndex((row) =>
    normalizeSearch(row.text).includes("HISTORIQUE DE MODIFICATION"),
  );
  if (historyIndex < 0) {
    return { reference: "", revision: "" };
  }

  const historyHeading = rows[historyIndex];
  const candidates = rows
    .filter(
      (row) =>
        row.y < historyHeading.y - 2 &&
        row.y >= historyHeading.y - 260,
    )
    .map((row) => {
      const reference = findReference(row.text);
      if (!reference) return null;
      let revision = revisionFromHistoryRow(row.text, reference);
      if (!revision) {
        const nearbyText = rows
          .filter(
            (candidate) =>
              Math.abs(candidate.y - row.y) <= 8 &&
              candidate.x > row.x,
          )
          .map((candidate) => candidate.text)
          .join(" ");
        revision = findRevision(nearbyText);
      }
      return { reference, revision, y: row.y };
    })
    .filter(
      (
        candidate,
      ): candidate is { reference: string; revision: string; y: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => {
      const revisionOrder =
        revisionRank(right.revision) - revisionRank(left.revision);
      return revisionOrder || right.y - left.y;
    });

  return candidates[0] ?? { reference: "", revision: "" };
}

function titleFromCover(
  rows: PdfTextRow[],
  pageWidth: number,
  pageHeight: number,
  reference: string,
  revision: string,
) {
  const excluded =
    /HISTORIQUE DE MODIFICATION|REFERENCE|R[ÉE]VISION|VERSION|ALSTOM|AVANZIT|ONCF|PAGE\s+\d/i;
  const historyHeading = rows.find((row) =>
    normalizeSearch(row.text).includes("HISTORIQUE DE"),
  );
  const candidates = rows.filter((row) => {
    const normalized = normalizeSearch(row.text);
    const center = row.x + row.width / 2;
    return (
      row.text.length >= 5 &&
      row.text.length <= 260 &&
      row.y >= pageHeight * 0.2 &&
      row.y <= pageHeight * 0.78 &&
      Math.abs(center - pageWidth / 2) <= pageWidth * 0.32 &&
      (!historyHeading ||
        (row.y > historyHeading.y + 20 &&
          row.y <= historyHeading.y + 160)) &&
      !excluded.test(normalized) &&
      !findReference(row.text)
    );
  });
  if (!candidates.length) return "";

  const largestHeight = Math.max(...candidates.map(({ height }) => height));
  const prominent = candidates.filter(
    ({ height }) => height >= Math.max(10, largestHeight * 0.68),
  );
  const anchor = prominent
    .slice()
    .sort((left, right) => {
      const leftCenter = left.x + left.width / 2;
      const rightCenter = right.x + right.width / 2;
      const leftScore =
        left.height * 4 -
        Math.abs(leftCenter - pageWidth / 2) / 20 -
        (historyHeading ? Math.abs(left.y - historyHeading.y) / 30 : 0);
      const rightScore =
        right.height * 4 -
        Math.abs(rightCenter - pageWidth / 2) / 20 -
        (historyHeading ? Math.abs(right.y - historyHeading.y) / 30 : 0);
      return rightScore - leftScore;
    })[0];
  const titleRows = prominent
    .filter(
      (row) =>
        Math.abs(row.y - anchor.y) <= Math.max(70, anchor.height * 4.5),
    )
    .sort((left, right) => right.y - left.y);
  const title = titleRows.map(({ text }) => text).join(" ");

  return separateTitle(title, reference, revision);
}

function usefulPdfTitle(value: string | undefined) {
  if (!value) return "";
  const cleaned = value.trim();
  if (
    cleaned.length < 4 ||
    /^(microsoft word|document|sans titre|untitled)$/i.test(cleaned)
  ) {
    return "";
  }
  return cleaned;
}

function titleFromText(text: string) {
  const match = text.match(
    /(?:^|\n)\s*(?:TITRE|OBJET|INTITUL[ÉE])\s*[:\-]\s*([^\n]{5,220})/i,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function titleFromFileName(
  fileName: string,
  reference: string,
  revision: string,
) {
  let title = separateTitle(cleanFileStem(fileName), reference, revision);
  title = title
    .replace(/\b(?:REV(?:ISION)?|IND(?:ICE)?)\b/gi, " ")
    .replace(/\b(?:DRAFT|BROUILLON|VALIDE|APPROUVE|REFUSE)\b/gi, " ")
    .replace(/\s*[-–—]\s*$/g, "")
    .replace(/^[\s\-–—()[\]]+|[\s\-–—()[\]]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title || reference || cleanFileStem(fileName);
}

function inferDocumentType(reference: string, content: string) {
  const normalized = normalizeSearch(`${reference} ${content}`);
  if (/(?:^|-)PVI(?:-|$)|\bPVI\b/.test(normalized)) return "pvi";
  if (/(?:^|-)ICP(?:-|$)|\bICP\b/.test(normalized)) return "icp";
  if (/(?:^|-)NDC(?:-|$)|NOTE DE CALCUL/.test(normalized)) return "ndc";
  if (/(?:^|-)PV(?:-|$)|\bPROCES VERBAL\b/.test(normalized)) return "pv";
  if (
    /(?:^|-)(?:PRQ|PRO)(?:-|$)|\bPROCEDURE\b/.test(normalized)
  ) {
    return "procedure";
  }
  if (
    /(?:^|-)(?:PLC|PLN)(?:-|$)|\bPLAN\b|\bSCHEMA\b/.test(normalized)
  ) {
    return "plan";
  }
  return "other";
}

function inferSubcategory(
  type: DocumentEditValues["document_type"],
  content: string,
) {
  const normalized = normalizeSearch(content);
  if (type === "plan") {
    if (/DEROULAGE|TIRAGE/.test(normalized)) return "plan_deroulage";
    if (/\bTCR\b/.test(normalized)) return "tcr_plan";
    if (/GENIE CIVIL|\bGC\b/.test(normalized)) return "gc_plan";
    if (/POSE|IMPLANTATION/.test(normalized)) return "plan_pose";
  }
  if (type === "procedure") {
    if (/VERIFICATION TECHNIQUE|\bVT\b/.test(normalized)) return "vt";
    if (/CAMPAGNE/.test(normalized)) return "installation_campagne";
    if (/POSTE/.test(normalized)) return "installation_poste";
    if (
      /GENIE CIVIL|TERRASSEMENT|BETON|TRANCHEE|MACONNERIE/.test(
        normalized,
      )
    ) {
      return "gc";
    }
  }
  return "";
}

function inferStatus(content: string) {
  const normalized = normalizeSearch(content);
  if (/REFUS|REJET|REJECTED|NON APPROUVE/.test(normalized)) return "Refusé";
  if (
    /BON POUR EXECUTION|VALIDE|APPROUVE|APPROVED|\bVSO\b|\bVAO\b/.test(
      normalized,
    )
  ) {
    return "Validé";
  }
  if (/EN REVUE|EN RELECTURE|A VALIDER|PENDING/.test(normalized)) {
    return "En validation";
  }
  if (/BROUILLON|DRAFT/.test(normalized)) return "Draft";
  return "";
}

function inferExecutionStatus(
  type: DocumentEditValues["document_type"],
  content: string,
) {
  if (type !== "plan") return "not_applicable";
  const normalized = normalizeSearch(content);
  if (/NON BON POUR EXECUTION|REFUS|REJET/.test(normalized)) {
    return "rejected";
  }
  if (/BON POUR EXECUTION|\bBPE\b/.test(normalized)) return "approved";
  return "pending";
}

function parsePdfDate(value: string | undefined) {
  if (!value) return "";
  const pdfDate = value.match(/^D:(\d{4})(\d{2})(\d{2})/);
  if (pdfDate) return `${pdfDate[1]}-${pdfDate[2]}-${pdfDate[3]}`;
  const frenchDate = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (frenchDate) {
    return `${frenchDate[3]}-${frenchDate[2]}-${frenchDate[1]}`;
  }
  return "";
}

function dateFromText(text: string) {
  const match = text.match(
    /(?:DATE DU DOCUMENT|DATE D['’]EMISSION|DATE)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  return parsePdfDate(match?.[1]);
}

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const metadata = await document.getMetadata().catch(() => null);
  const pages: string[] = [];
  let firstPageItems: PositionedPdfText[] = [];
  let firstPageWidth = 0;
  let firstPageHeight = 0;

  for (
    let pageNumber = 1;
    pageNumber <= Math.min(document.numPages, 3);
    pageNumber += 1
  ) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    if (pageNumber === 1) {
      const viewport = page.getViewport({ scale: 1 });
      firstPageWidth = viewport.width;
      firstPageHeight = viewport.height;
      firstPageItems = content.items
        .filter((item) => "str" in item)
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }));
    }
    let pageText = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      pageText += item.str;
      pageText += "hasEOL" in item && item.hasEOL ? "\n" : " ";
    }
    pages.push(pageText);
  }

  return {
    text: pages.join("\n"),
    info: (metadata?.info ?? {}) as PdfInfo,
    firstPageRows: groupPositionedText(firstPageItems),
    firstPageItems,
    firstPageWidth,
    firstPageHeight,
  };
}

export async function inferDocumentMetadata(
  file: File,
): Promise<DocumentMetadataInference> {
  const fileStem = cleanFileStem(file.name);
  let pdfText = "";
  let pdfInfo: PdfInfo = {};
  let firstPageRows: PdfTextRow[] = [];
  let firstPageItems: PositionedPdfText[] = [];
  let firstPageWidth = 0;
  let firstPageHeight = 0;
  let warning: string | null = null;

  try {
    const pdf = await readPdf(file);
    pdfText = pdf.text;
    pdfInfo = pdf.info;
    firstPageRows = pdf.firstPageRows;
    firstPageItems = pdf.firstPageItems;
    firstPageWidth = pdf.firstPageWidth;
    firstPageHeight = pdf.firstPageHeight;
  } catch {
    warning =
      "Le texte interne du PDF n’a pas pu être lu. Les informations ont été déduites depuis le nom du fichier.";
  }

  const source = `${fileStem}\n${pdfInfo.Title ?? ""}\n${
    pdfInfo.Subject ?? ""
  }\n${pdfText}`;
  const historyMetadata = metadataFromModificationHistory(
    firstPageItems,
    firstPageRows,
  );
  const reference = historyMetadata.reference || findReference(source);
  const revision = historyMetadata.revision || findRevision(source);
  const documentType = inferDocumentType(reference, source);
  const coverTitle = titleFromCover(
    firstPageRows,
    firstPageWidth,
    firstPageHeight,
    reference,
    revision,
  );
  const title =
    coverTitle ||
    usefulPdfTitle(pdfInfo.Title) ||
    titleFromText(pdfText) ||
    titleFromFileName(file.name, reference, revision);
  const separatedTitle =
    separateTitle(title, reference, revision) ||
    titleFromFileName(file.name, reference, revision);
  const status = inferStatus(source);
  const companyMatch = normalizeSearch(source).match(
    /\b(ALSTOM|AVANZIT|EQUANS|ONCF)\b/,
  );
  const documentDate =
    dateFromText(pdfText) ||
    parsePdfDate(pdfInfo.CreationDate) ||
    parsePdfDate(pdfInfo.ModDate);
  const subcategory = inferSubcategory(documentType, source);
  const values: Partial<DocumentEditValues> = {
    title: separatedTitle,
    reference,
    revision,
    document_type: documentType,
    document_subcategory: subcategory,
    execution_status: inferExecutionStatus(documentType, source),
  };

  if (status) values.status = status;
  if (companyMatch) values.company = companyMatch[1];
  if (documentDate) values.document_date = documentDate;
  if (documentType !== "other") {
    values.category =
      {
        plan: "Plan",
        procedure: "Procédure",
        pv: "PV",
        icp: "ICP",
        pvi: "PVI",
        ndc: "Note de calcul",
      }[documentType] ?? "";
  }

  const labels: Record<keyof DocumentEditValues, string> = {
    title: "titre",
    reference: "référence",
    revision: "révision",
    status: "statut",
    category: "catégorie",
    document_type: "type",
    document_subcategory: "sous-catégorie",
    execution_status: "statut d’exécution",
    company: "entreprise",
    comments: "commentaires",
    document_date: "date",
    project_id: "projet",
    zone_id: "zone",
    phase_id: "phase",
    activity_id: "activité",
  };

  return {
    values,
    detectedFields: (
      Object.entries(values) as Array<
        [keyof DocumentEditValues, string | undefined]
      >
    )
      .filter(([, value]) => Boolean(value))
      .map(([key]) => labels[key]),
    warning,
    titleDetectedFromCover: Boolean(coverTitle),
  };
}
