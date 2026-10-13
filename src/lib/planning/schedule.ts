export type ScheduleRow = {
  key: string;
  title: string;
  start: string;
  finish: string;
  parent: string;
  predecessors: string[];
  warnings: string[];
};

export function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readDate(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "";
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})(?=T|\s|$)/);
  if (iso) return validDate(iso[1]) ? iso[1] : "";
  const french = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
  if (!french) return "";
  const result = `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  return validDate(result) ? result : "";
}

export function rowErrors(row: ScheduleRow): string[] {
  const errors: string[] = [];
  if (!row.title.trim()) errors.push("Libellé manquant");
  if (!validDate(row.start) || !validDate(row.finish)) errors.push("Dates manquantes ou invalides");
  else if (row.start > row.finish) errors.push("La fin précède le début");
  return errors;
}

export function rowsFromMatrix(matrix: unknown[][]): ScheduleRow[] {
  const aliases = {
    title: ["nom", "name", "task name", "nom de la tache", "tache", "title", "libelle", "activite"],
    start: ["debut", "start", "start date", "date debut", "date de debut"],
    finish: ["fin", "finish", "finish date", "date fin", "date de fin", "end", "end date", "due date"],
    key: ["id", "uid", "code", "wbs", "numero"],
    parent: ["activite parente", "activity", "parent", "parent activity"],
    predecessors: ["predecesseurs", "predecessors", "predecesseur"],
  };
  let header = -1;
  let columns: Record<string, number> = {};
  for (let index = 0; index < Math.min(30, matrix.length); index++) {
    const labels = matrix[index].map(value => normalizeLabel(String(value ?? "")));
    const candidate = Object.fromEntries(Object.entries(aliases).map(([name, options]) => [name, labels.findIndex(label => options.includes(label))]));
    if (candidate.title >= 0 && candidate.start >= 0 && candidate.finish >= 0) { header = index; columns = candidate; break; }
  }
  if (header < 0) throw new Error("Colonnes introuvables : Nom de la tâche, Début et Fin. Renomme ces colonnes puis réimporte le fichier.");
  return matrix.slice(header + 1).filter(row => String(row[columns.title] ?? "").trim()).map(row => ({
    key: String(row[columns.key] ?? `label:${normalizeLabel(String(row[columns.parent] ?? ""))}:${normalizeLabel(String(row[columns.title] ?? ""))}`).trim(),
    title: String(row[columns.title] ?? "").trim(),
    start: readDate(row[columns.start]), finish: readDate(row[columns.finish]),
    parent: String(row[columns.parent] ?? "").trim(),
    predecessors: String(row[columns.predecessors] ?? "").split(/[;,]/).map(value => value.trim()).filter(Boolean),
    warnings: [],
  }));
}

export function rowsFromPdfLines(lines: string[]): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const occurrences = new Map<string, number>();
  for (const line of lines) {
    const matches = [...line.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))\b/g)];
    if (matches.length < 2) continue;
    const title = line.slice(0, matches[0].index).replace(/^\s*\d+\s+/, "").replace(/\s*(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s*$/i, "").replace(/\s+\d+(?:[,.]\d+)?\s*(?:jours?|days?|jrs?|j)\??\s*$/i, "").trim();
    if (!title) continue;
    const label = normalizeLabel(title);
    const occurrence = (occurrences.get(label) ?? 0) + 1;
    occurrences.set(label, occurrence);
    const shortYear = /[/\.\-]\d{2}$/.test(matches[0][0]) && !/^\d{4}-/.test(matches[0][0]);
    const pdfDate = (text: string) => readDate(text.replace(/^(\d{1,2}[/\.\-]\d{1,2}[/\.\-])(\d{2})$/, "$120$2"));
    rows.push({key: `pdf:${label}${occurrence > 1 ? `:occurrence:${occurrence}` : ""}`, title, start: pdfDate(matches[0][0]), finish: pdfDate(matches[1][0]), parent: "", predecessors: [], warnings: ["Extraction PDF : vérifier le libellé et les dates avec le document source.", ...(shortYear ? ["Année sur deux chiffres interprétée entre 2000 et 2099 : vérifier les dates."] : []), ...(occurrence > 1 ? ["Libellé répété : vérifier le bâtiment et l’activité cible. Conserver l’ordre des occurrences lors des réimports."] : [])]});
  }
  return rows;
}

export type PdfTextItem = {str: string; transform: number[]; height: number; width: number};

export function pdfTextLines(items: PdfTextItem[]): string[] {
  // Limit MS Project exports to the table, excluding duplicate labels in the Gantt.
  const finishHeader = items.find(item => normalizeLabel(item.str) === "fin");
  const startHeader = items.find(item => normalizeLabel(item.str) === "debut" && finishHeader && Math.abs(item.transform[5] - finishHeader.transform[5]) < 2);
  const rightEdge = startHeader && finishHeader ? finishHeader.transform[4] + (finishHeader.transform[4] - startHeader.transform[4]) : Infinity;
  const groups: {y: number; items: PdfTextItem[]}[] = [];
  for (const item of items.filter(item => item.str.trim() && item.transform[4] < rightEdge).sort((a,b) => b.transform[5] - a.transform[5])) {
    const y = item.transform[5];
    const last = groups.at(-1);
    // Font baselines vary within one row. Fixed rounding split some rows in two.
    if (last && Math.abs(last.y - y) <= Math.max(0.5, item.height * 0.25)) last.items.push(item);
    else groups.push({y, items: [item]});
  }
  return groups.map(group => group.items.sort((a,b) => a.transform[4] - b.transform[4]).map(item => item.str).join(" "));
}

export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayDistance(start: string, finish: string) {
  return Math.round((Date.parse(`${finish}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

export function exportProjectXml(rows: {id: string; title: string; start: string; finish: string; progress: number; summary?: boolean; level?: number}[]) {
  const escape = (value: string) => value.replace(/[<>&"']/g, char => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;"}[char]!));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project"><Name>OPC OS</Name><ScheduleFromStart>1</ScheduleFromStart><Tasks>${rows.map((row, index) => `<Task><UID>${index + 1}</UID><ID>${index + 1}</ID><Name>${escape(row.title)}</Name><Type>1</Type><IsNull>0</IsNull><Manual>1</Manual><OutlineLevel>${row.level ?? 1}</OutlineLevel><Summary>${row.summary ? 1 : 0}</Summary><Start>${row.start}T08:00:00</Start><Finish>${row.finish}T17:00:00</Finish><PercentComplete>${Math.round(row.progress)}</PercentComplete><Notes>${escape(`OPC OS ID: ${row.id}`)}</Notes></Task>`).join("")}</Tasks></Project>`;
}
