type PdfTextSnapshot = {
  pageCount: number;
  lines: string[];
};

function normalizeLine(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function comparisonKey(value: string): string {
  return normalizeLine(value)
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function usefulLines(lines: string[]): string[] {
  const seen = new Set<string>();

  return lines.filter((line) => {
    const key = comparisonKey(line);
    if (key.length < 8 || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function extractPdfText(bytes: Uint8Array): Promise<PdfTextSnapshot> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;
  const lines: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let currentLine = "";
      let previousY: number | null = null;

      for (const item of content.items) {
        if (!("str" in item)) {
          continue;
        }
        const y = item.transform[5];
        if (previousY !== null && Math.abs(previousY - y) > 2 && currentLine) {
          lines.push(normalizeLine(currentLine));
          currentLine = "";
        }
        currentLine += `${currentLine ? " " : ""}${item.str}`;
        previousY = y;
      }

      if (currentLine) {
        lines.push(normalizeLine(currentLine));
      }
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return {
    pageCount: pdf.numPages,
    lines: usefulLines(lines),
  };
}

function similarity(left: string, right: string): number {
  const leftWords = new Set(comparisonKey(left).split(" ").filter(Boolean));
  const rightWords = new Set(comparisonKey(right).split(" ").filter(Boolean));
  const union = new Set([...leftWords, ...rightWords]);
  if (!union.size) {
    return 0;
  }
  const intersection = [...leftWords].filter((word) =>
    rightWords.has(word),
  ).length;
  return intersection / union.size;
}

function shortened(value: string): string {
  return value.length <= 220 ? value : `${value.slice(0, 217)}…`;
}

export async function comparePdfVersions(input: {
  previousBytes: Uint8Array;
  nextFile: File;
  previousRevision: string | null;
  nextRevision: string | null;
}): Promise<string> {
  const [previous, next] = await Promise.all([
    extractPdfText(input.previousBytes),
    input.nextFile.arrayBuffer().then((buffer) =>
      extractPdfText(new Uint8Array(buffer)),
    ),
  ]);
  const previousByKey = new Map(
    previous.lines.map((line) => [comparisonKey(line), line]),
  );
  const nextByKey = new Map(
    next.lines.map((line) => [comparisonKey(line), line]),
  );
  const removed = previous.lines.filter(
    (line) => !nextByKey.has(comparisonKey(line)),
  );
  const added = next.lines.filter(
    (line) => !previousByKey.has(comparisonKey(line)),
  );
  const usedAdded = new Set<number>();
  const modifications: Array<{ before: string; after: string }> = [];
  const remainingRemoved: string[] = [];

  for (const before of removed) {
    let bestIndex = -1;
    let bestScore = 0;
    added.forEach((after, index) => {
      if (usedAdded.has(index)) {
        return;
      }
      const score = similarity(before, after);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 0.42) {
      modifications.push({ before, after: added[bestIndex] });
      usedAdded.add(bestIndex);
    } else {
      remainingRemoved.push(before);
    }
  }

  const remainingAdded = added.filter((_, index) => !usedAdded.has(index));
  const previousLabel = input.previousRevision || "ancienne version";
  const nextLabel = input.nextRevision || "nouvelle version";
  const sections = [
    `COMPARAISON AUTOMATIQUE ${previousLabel} → ${nextLabel}`,
    `Pages : ${previous.pageCount} → ${next.pageCount}.`,
  ];

  if (!previous.lines.length || !next.lines.length) {
    sections.push(
      "Le contenu textuel n’a pas pu être comparé complètement (PDF scanné ou texte non extractible). La comparaison est limitée au nombre de pages.",
    );
    return sections.join("\n");
  }

  if (!modifications.length && !remainingAdded.length && !remainingRemoved.length) {
    sections.push("Aucune différence textuelle significative détectée.");
    return sections.join("\n");
  }

  if (modifications.length) {
    sections.push(
      "Modifications essentielles :",
      ...modifications
        .slice(0, 6)
        .map(
          ({ before, after }) =>
            `• Avant : ${shortened(before)}\n  Après : ${shortened(after)}`,
        ),
    );
  }
  if (remainingAdded.length) {
    sections.push(
      "Ajouts détectés :",
      ...remainingAdded.slice(0, 6).map((line) => `• ${shortened(line)}`),
    );
  }
  if (remainingRemoved.length) {
    sections.push(
      "Éléments retirés :",
      ...remainingRemoved.slice(0, 6).map((line) => `• ${shortened(line)}`),
    );
  }

  return sections.join("\n").slice(0, 3400);
}
