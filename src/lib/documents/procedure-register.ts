import type { DocumentListItem } from "@/lib/documents/queries";

export type ProcedureRegisterChangeType =
  | "added"
  | "modified"
  | "unchanged";

export type ProcedureRegisterRow = {
  key: string;
  rowNumber: number;
  values: Record<string, string>;
  changeType: ProcedureRegisterChangeType;
  changedColumns: string[];
};

export type ProcedureRegisterSnapshot = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: ProcedureRegisterRow[];
};

export type ProcedureRegisterChangeSummary = {
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  details: string[];
  removedKeys: string[];
};

export type GedDeposit = {
  version: string;
  versionNumber: number;
  date: string | null;
  timestamp: number | null;
};

export type ProcedureDocumentMatch = {
  status: "available" | "outdated" | "missing" | "not_deposited";
  latestDeposit: GedDeposit | null;
  matchedDocument: DocumentListItem | null;
  availableRevision: string | null;
};

const REFERENCE_HEADER = "Réf. Groupement";
const TITLE_HEADER = "Titre";
const GED_HEADER = "Date dépôt GED / AMO / ONCF";

export const PROCEDURE_REGISTER_REQUIRED_HEADERS = [
  REFERENCE_HEADER,
  TITLE_HEADER,
  GED_HEADER,
];

export const EMPTY_CHANGE_SUMMARY: ProcedureRegisterChangeSummary = {
  added: 0,
  modified: 0,
  removed: 0,
  unchanged: 0,
  details: [],
  removedKeys: [],
};

export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function resolveProcedureRegisterHeader(
  headers: string[],
  expected: string,
) {
  const normalizedExpected = normalizeHeader(expected);
  return headers.find(
    (header) => normalizeHeader(header) === normalizedExpected,
  );
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n/g, "\n").trim();
}

function normalizeReference(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeVersion(value: string | null | undefined) {
  const match = value?.toUpperCase().match(/\bV\s*0*(\d{1,3})\b/);
  return match ? `V${Number(match[1]).toString().padStart(2, "0")}` : null;
}

function displayRevision(value: string | null | undefined) {
  return normalizeVersion(value) ?? value?.trim() ?? null;
}

function parseFrenchDate(value: string) {
  const match = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(timestamp)) return null;
  return {
    date: `${day}/${month}/${year}`,
    timestamp,
  };
}

export function getLatestGedDeposit(value: string): GedDeposit | null {
  const deposits: GedDeposit[] = [];
  for (const line of value.split(/\r?\n/)) {
    const versionMatch = line.toUpperCase().match(/\bV\s*0*(\d{1,3})\b/);
    if (!versionMatch) continue;
    const parsedDate = parseFrenchDate(line);
    const versionNumber = Number(versionMatch[1]);
    deposits.push({
      version: `V${versionNumber.toString().padStart(2, "0")}`,
      versionNumber,
      date: parsedDate?.date ?? null,
      timestamp: parsedDate?.timestamp ?? null,
    });
  }

  // The register is chronological inside the GED cell. The last version
  // mentioned is authoritative, even when its deposit date is still blank.
  return deposits.at(-1) ?? null;
}

export async function parseProcedureRegister(
  source: File | ArrayBuffer,
  fileName: string,
): Promise<ProcedureRegisterSnapshot> {
  const XLSX = await import("xlsx");
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Le classeur ne contient aucune feuille.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName],
    {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    },
  );
  const headers = (matrix[0] ?? []).map(cellText);
  const missingHeaders = PROCEDURE_REGISTER_REQUIRED_HEADERS.filter(
    (required) => !resolveProcedureRegisterHeader(headers, required),
  );
  if (missingHeaders.length) {
    throw new Error(
      `Colonnes obligatoires absentes : ${missingHeaders.join(", ")}.`,
    );
  }

  const referenceHeader = resolveProcedureRegisterHeader(
    headers,
    REFERENCE_HEADER,
  )!;
  const rows = matrix
    .slice(1)
    .map((rawRow, index) => {
      const values = Object.fromEntries(
        headers.map((header, columnIndex) => [
          header,
          cellText(rawRow[columnIndex]),
        ]),
      );
      const reference = values[referenceHeader];
      return {
        key:
          normalizeReference(reference) ||
          `LIGNE${String(index + 2).padStart(3, "0")}`,
        rowNumber: index + 2,
        values,
        changeType: "unchanged" as const,
        changedColumns: [],
      };
    })
    .filter((row) => Object.values(row.values).some(Boolean));

  return {
    fileName,
    sheetName,
    headers,
    rows,
  };
}

export function compareProcedureRegisters(
  previous: ProcedureRegisterSnapshot,
  current: ProcedureRegisterSnapshot,
) {
  const previousByKey = new Map(previous.rows.map((row) => [row.key, row]));
  const currentKeys = new Set(current.rows.map((row) => row.key));
  const summary: ProcedureRegisterChangeSummary = {
    ...EMPTY_CHANGE_SUMMARY,
    details: [],
    removedKeys: [],
  };

  const rows = current.rows.map((row) => {
    const previousRow = previousByKey.get(row.key);
    if (!previousRow) {
      summary.added += 1;
      summary.details.push(
        `${row.values[resolveProcedureRegisterHeader(current.headers, REFERENCE_HEADER)!] || row.key} ajoutée`,
      );
      return {
        ...row,
        changeType: "added" as const,
        changedColumns: [...current.headers],
      };
    }

    const changedColumns = current.headers.filter(
      (header) => {
        const previousHeader =
          resolveProcedureRegisterHeader(previous.headers, header) ?? header;
        return (
          cellText(row.values[header]) !==
          cellText(previousRow.values[previousHeader])
        );
      },
    );
    if (!changedColumns.length) {
      summary.unchanged += 1;
      return row;
    }

    summary.modified += 1;
    const reference =
      row.values[
        resolveProcedureRegisterHeader(current.headers, REFERENCE_HEADER)!
      ] || row.key;
    summary.details.push(
      `${reference} : ${changedColumns.slice(0, 3).join(", ")}${
        changedColumns.length > 3
          ? ` et ${changedColumns.length - 3} autre(s)`
          : ""
      }`,
    );
    return {
      ...row,
      changeType: "modified" as const,
      changedColumns,
    };
  });

  for (const row of previous.rows) {
    if (currentKeys.has(row.key)) continue;
    summary.removed += 1;
    summary.removedKeys.push(
      row.values[
        resolveProcedureRegisterHeader(previous.headers, REFERENCE_HEADER)!
      ] || row.key,
    );
  }

  return {
    snapshot: { ...current, rows },
    summary,
  };
}

export function matchProcedureDocument(
  row: ProcedureRegisterRow,
  headers: string[],
  documents: DocumentListItem[],
): ProcedureDocumentMatch {
  const referenceHeader = resolveProcedureRegisterHeader(
    headers,
    REFERENCE_HEADER,
  )!;
  const gedHeader = resolveProcedureRegisterHeader(headers, GED_HEADER)!;
  const reference = normalizeReference(row.values[referenceHeader] ?? "");
  const latestDeposit = getLatestGedDeposit(row.values[gedHeader] ?? "");

  if (!latestDeposit) {
    return {
      status: "not_deposited",
      latestDeposit: null,
      matchedDocument: null,
      availableRevision: null,
    };
  }

  const candidates = documents
    .filter(
      (document) =>
        document.document_type === "procedure" &&
        normalizeReference(document.reference ?? "") === reference,
    )
    .sort(
      (left, right) =>
        (Number(normalizeVersion(right.revision)?.slice(1)) || -1) -
          (Number(normalizeVersion(left.revision)?.slice(1)) || -1) ||
        Date.parse(right.created_at) - Date.parse(left.created_at),
    );
  const exactMatch =
    candidates.find(
      (document) =>
        normalizeVersion(document.revision) === latestDeposit.version,
    ) ?? null;

  if (exactMatch) {
    return {
      status: "available",
      latestDeposit,
      matchedDocument: exactMatch,
      availableRevision: displayRevision(exactMatch.revision),
    };
  }

  if (candidates[0]) {
    return {
      status: "outdated",
      latestDeposit,
      matchedDocument: candidates[0],
      availableRevision: displayRevision(candidates[0].revision),
    };
  }

  return {
    status: "missing",
    latestDeposit,
    matchedDocument: null,
    availableRevision: null,
  };
}
