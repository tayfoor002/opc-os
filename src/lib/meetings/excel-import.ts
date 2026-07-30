import type { MeetingCustomTable } from "@/types/meeting";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

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
  const rows = rawRows.map((row) => row.map(cellText));
  const firstDataRow = rows.findIndex((row) =>
    row.some((cell) => !isEmpty(cell)),
  );
  if (firstDataRow < 0) return [];
  let lastDataRow = rows.length - 1;
  while (
    lastDataRow > firstDataRow &&
    !rows[lastDataRow].some((cell) => !isEmpty(cell))
  ) {
    lastDataRow -= 1;
  }

  const usedRows = rows.slice(firstDataRow, lastDataRow + 1);
  const maximumColumns = Math.max(...usedRows.map((row) => row.length));
  let firstDataColumn = 0;
  while (
    firstDataColumn < maximumColumns &&
    !usedRows.some((row) => !isEmpty(row[firstDataColumn] ?? ""))
  ) {
    firstDataColumn += 1;
  }
  let lastDataColumn = maximumColumns - 1;
  while (
    lastDataColumn > firstDataColumn &&
    !usedRows.some((row) => !isEmpty(row[lastDataColumn] ?? ""))
  ) {
    lastDataColumn -= 1;
  }

  return usedRows.map((row) =>
    Array.from(
      { length: lastDataColumn - firstDataColumn + 1 },
      (_, offset) => row[firstDataColumn + offset] ?? "",
    ),
  );
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
      blankrows: true,
    });
    let rows = normalizeMatrix(rawRows);
    if (!rows.length) continue;

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
      );

    if (!dataRows.some((row) => row.some((cell) => !isEmpty(cell)))) {
      warnings.push(`« ${sheetName} » ne contient aucune ligne de données.`);
      continue;
    }

    tables.push({
      id: crypto.randomUUID(),
      title: tableTitle,
      columns,
      rows: dataRows,
      source: "excel",
      source_file: file.name,
      source_sheet: sheetName,
    });
    importedSheets += 1;
  }

  if (!tables.length) {
    throw new Error("Aucun tableau exploitable n’a été trouvé dans ce fichier.");
  }

  return { tables, importedSheets, warnings };
}
