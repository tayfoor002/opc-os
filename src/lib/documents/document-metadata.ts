import type { DocumentEditValues } from "@/lib/documents/types";

export type DocumentMetadataInference = {
  values: Partial<DocumentEditValues>;
  detectedFields: string[];
  warning: string | null;
};

type PdfInfo = {
  Title?: string;
  Subject?: string;
  Author?: string;
  CreationDate?: string;
  ModDate?: string;
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
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const metadata = await document.getMetadata().catch(() => null);
  const pages: string[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= Math.min(document.numPages, 3);
    pageNumber += 1
  ) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
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
  };
}

export async function inferDocumentMetadata(
  file: File,
): Promise<DocumentMetadataInference> {
  const fileStem = cleanFileStem(file.name);
  let pdfText = "";
  let pdfInfo: PdfInfo = {};
  let warning: string | null = null;

  try {
    const pdf = await readPdf(file);
    pdfText = pdf.text;
    pdfInfo = pdf.info;
  } catch {
    warning =
      "Le texte interne du PDF n’a pas pu être lu. Les informations ont été déduites depuis le nom du fichier.";
  }

  const source = `${fileStem}\n${pdfInfo.Title ?? ""}\n${
    pdfInfo.Subject ?? ""
  }\n${pdfText}`;
  const reference = findReference(source);
  const revision = findRevision(source);
  const documentType = inferDocumentType(reference, source);
  const title =
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
  };
}
