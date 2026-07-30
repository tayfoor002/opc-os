import type { MeetingCustomTable } from "@/types/meeting";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_SHEET_ROWS = 500;
const MAX_SHEET_COLUMNS = 40;
const REPORT_COLUMNS_PER_TABLE = 6;

type ExcelImportResult = {
  tables: MeetingCustomTable[];
  importedSheets: number;
  warnings: string[];
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n/g, "\n").trim();
}

function isEmpty(value: string) {
  return value.trim() === "";
}

function normalizeMatrix(rawRows: unknown[][]): string[][] {
  const rows = rawRows
    .map((row) => row.map(cellText))
    .filter((row) => row.some((cell) => !isEmpty(cell)));
  if (!rows.length) return [];

  const maximumColumns = Math.max(...rows.map((row) => row.length));
  const activeColumns = Array.from({ length: maximumColumns }, (_, index) =>
    rows.some((row) => !isEmpty(row[index] ?? "")) ? index : -1,
  ).filter((index) => index >= 0);

  return rows.map((row) => activeColumns.map((index) => row[index] ?? ""));
}

function uniqueHeaders(row: string[]): string[] {
  const occurrences = new Map<string, number>();
  return row.map((value, index) => {
    const base = value || `Colonne ${index + 1}`;
    const count = (occurrences.get(base.toLowerCase()) ?? 0) + 1;
    occurrences.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function splitWideTable(
  fileName: string,
  sheetName: string,
  title: string,
  columns: string[],
  rows: string[][],
): MeetingCustomTable[] {
  if (columns.length <= REPORT_COLUMNS_PER_TABLE) {
    return [
      {
        id: crypto.randomUUID(),
        title,
        columns,
        rows,
        source: "excel",
        source_file: fileName,
        source_sheet: sheetName,
      },
    ];
  }

  const tables: MeetingCustomTable[] = [];
  const dataColumnsPerPart = REPORT_COLUMNS_PER_TABLE - 1;
  const parts = Math.ceil((columns.length - 1) / dataColumnsPerPart);

  for (let part = 0; part < parts; part += 1) {
    const start = 1 + part * dataColumnsPerPart;
    const indexes = [
      0,
      ...Array.from(
        {
          length: Math.min(
            dataColumnsPerPart,
            Math.max(0, columns.length - start),
          ),
        },
        (_, offset) => start + offset,
      ),
    ];
    tables.push({
      id: crypto.randomUUID(),
      title: `${title} — partie ${part + 1}/${parts}`,
      columns: indexes.map((index) => columns[index]),
      rows: rows.map((row) => indexes.map((index) => row[index] ?? "")),
      source: "excel",
      source_file: fileName,
      source_sheet: sheetName,
    });
  }

  return tables;
}

export async function importMeetingTablesFromExcel(
  file: File,
): Promise<ExcelImportResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Le fichier Excel dépasse la limite de 15 Mo.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xls", "xlsm"].includes(extension)) {
    throw new Error("Sélectionnez un fichier Excel XLSX, XLS ou XLSM.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const tables: MeetingCustomTable[] = [];
  const warnings: string[] = [];
  let importedSheets = 0;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    let rows = normalizeMatrix(rawRows);
    if (!rows.length) continue;
    if (rows.length > MAX_SHEET_ROWS) {
      throw new Error(
        `La feuille « ${sheetName} » contient plus de ${MAX_SHEET_ROWS} lignes utiles. Réduisez-la avant l’import dans un CR.`,
      );
    }
    if (rows[0].length > MAX_SHEET_COLUMNS) {
      throw new Error(
        `La feuille « ${sheetName} » contient plus de ${MAX_SHEET_COLUMNS} colonnes utiles. Réduisez-la avant l’import dans un CR.`,
      );
    }

    let tableTitle = sheetName;
    const firstRowValues = rows[0].filter((cell) => !isEmpty(cell));
    const secondRowValues = rows[1]?.filter((cell) => !isEmpty(cell)) ?? [];
    if (firstRowValues.length === 1 && secondRowValues.length >= 2) {
      tableTitle = `${sheetName} — ${firstRowValues[0]}`;
      rows = rows.slice(1);
    }
    if (!rows.length) continue;

    const columns = uniqueHeaders(rows[0]);
    const dataRows = rows
      .slice(1)
      .map((row) =>
        Array.from({ length: columns.length }, (_, index) => row[index] ?? ""),
      )
      .filter((row) => row.some((cell) => !isEmpty(cell)));

    if (!dataRows.length) {
      warnings.push(`« ${sheetName} » ne contient aucune ligne de données.`);
      continue;
    }

    tables.push(
      ...splitWideTable(
        file.name,
        sheetName,
        tableTitle,
        columns,
        dataRows,
      ),
    );
    importedSheets += 1;
  }

  if (!tables.length) {
    throw new Error("Aucun tableau exploitable n’a été trouvé dans ce fichier.");
  }

  return { tables, importedSheets, warnings };
}
