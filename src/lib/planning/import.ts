import { rowsFromMatrix, rowsFromPdfLines, readDate, type ScheduleRow } from "./schedule";

export function parseProjectXml(text: string): ScheduleRow[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Les déclarations externes XML ne sont pas acceptées.");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length || xml.documentElement.localName !== "Project") throw new Error("Fichier XML MS Project invalide.");
  const nodes = Array.from(xml.getElementsByTagNameNS("*", "Task"));
  const field = (node: Element, name: string) => Array.from(node.children).find(child => child.localName === name)?.textContent?.trim() ?? "";
  const names = new Map(nodes.map(node => [field(node, "UID"), field(node, "Name")]));
  const parents: string[] = [];
  const rows: ScheduleRow[] = [];
  for (const node of nodes) {
    if (field(node, "UID") === "0" || field(node, "IsNull") === "1") continue;
    const level = Number(field(node, "OutlineLevel") || "1");
    parents.length = Math.max(0, level - 1);
    if (field(node, "Summary") === "1") { parents[level - 1] = field(node, "Name"); continue; }
    const links = Array.from(node.children).filter(child => child.localName === "PredecessorLink");
    rows.push({key: field(node, "UID"), title: field(node, "Name"), start: readDate(field(node, "Start")), finish: readDate(field(node, "Finish")), parent: parents.filter(Boolean).at(-1) ?? "", predecessors: links.map(link => names.get(field(link, "PredecessorUID")) ?? field(link, "PredecessorUID")), warnings: links.length ? ["Prédécesseurs conservés dans l’aperçu. Les contraintes et calendriers MS Project ne sont pas recalculés."] : []});
  }
  return rows;
}

export async function readScheduleFile(file: File): Promise<{rows: ScheduleRow[]; warnings: string[]}> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Limite : 20 Mo par planning.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "mpp") throw new Error("Le format binaire .mpp nécessite un convertisseur dédié. Dans MS Project, utilise Enregistrer sous → XML, puis importe ce XML ici.");
  let rows: ScheduleRow[] = [];
  const warnings: string[] = [];
  if (extension === "xml") rows = parseProjectXml(await file.text());
  else if (["xlsx", "xls", "csv"].includes(extension ?? "")) {
    const XLSX = await import("xlsx");
    const workbook = extension === "csv"
      ? XLSX.read(await file.text(), {type: "string", raw: true})
      : XLSX.read(await file.arrayBuffer(), {type: "array", cellDates: true, dateNF: "yyyy-mm-dd"});
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("Classeur vide.");
    rows = rowsFromMatrix(XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {header: 1, defval: "", raw: true}));
    if (workbook.SheetNames.length > 1) warnings.push(`Seule la première feuille (${workbook.SheetNames[0]}) a été lue. Exporte les autres feuilles séparément.`);
    warnings.push("Dates textuelles attendues : JJ/MM/AAAA ou AAAA-MM-JJ.");
  } else if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
    try {
      if (pdf.numPages > 80) throw new Error("Le planning PDF dépasse 80 pages. Importe une sélection de pages.");
      const lines: string[] = [];
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
        const content = await (await pdf.getPage(pageIndex)).getTextContent();
        const groups = new Map<number, {x: number; text: string}[]>();
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = Math.round(item.transform[5] / 3) * 3;
          const group = groups.get(y) ?? [];
          group.push({x: item.transform[4], text: item.str}); groups.set(y, group);
        }
        for (const [, items] of [...groups.entries()].sort((a,b) => b[0]-a[0])) lines.push(items.sort((a,b) => a.x-b.x).map(item => item.text).join(" "));
      }
      rows = rowsFromPdfLines(lines);
      warnings.push("PDF : seules les lignes comportant un libellé suivi de deux dates explicites sont détectées. Les barres graphiques, scans, calendriers et dépendances ne sont pas convertis automatiquement.");
    } finally { await pdf.destroy(); }
  } else throw new Error("Formats acceptés : PDF texte, Excel, CSV et XML MS Project.");
  if (!rows.length) throw new Error("Aucune tâche avec dates détectée. Pour un PDF scanné ou purement graphique, utilise un export Excel/XML ou saisis les tâches manuellement. L’OCR n’est pas encore configuré.");
  if (rows.length > 1000) throw new Error("Limite : 1 000 lignes par import.");
  const keys = new Set<string>();
  for (const row of rows) { if (!row.key || keys.has(row.key)) throw new Error("Identifiants source absents ou dupliqués. Corrige le fichier avant l’import."); keys.add(row.key); }
  return {rows, warnings};
}
