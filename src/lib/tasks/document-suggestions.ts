export type SuggestibleDocument = {
  id: string;
  title: string;
  reference: string | null;
  revision: string | null;
  document_type: string;
  document_subcategory: string | null;
  category: string | null;
  zone_id: string | null;
  phase_id: string | null;
  activity_id: string | null;
};

export type DocumentSuggestionContext = {
  title: string;
  description: string | null;
  workType: string;
  activityId: string | null;
  activityName: string;
  zoneId: string | null;
  phaseId: string | null;
};

const ignoredWords = new Set([
  "avec", "dans", "pour", "des", "les", "une", "sur", "par", "aux",
  "task", "tache", "travaux", "installation", "pose", "realisation",
]);

const domains: Array<{ triggers: string[]; matches: string[] }> = [
  {
    triggers: ["tranche", "excavation", "terrassement", "remblaiement", "buse"],
    matches: ["tranche", "excavation", "terrassement", "remblaiement", "buse", "genie civil", "gc"],
  },
  {
    triggers: ["beton", "coulage", "massif", "ferraillage"],
    matches: ["beton", "coulage", "massif", "ferraillage", "genie civil", "gc"],
  },
  {
    triggers: ["cable", "deroulage", "soufflage", "fibre", "fo", "cdte"],
    matches: ["cable", "deroulage", "soufflage", "fibre", "fo", "cdte", "energie", "telecom"],
  },
  {
    triggers: ["batiment", "guerite", "local technique", "lt", "maconnerie"],
    matches: ["batiment", "guerite", "local technique", "maconnerie", "genie civil", "gc"],
  },
  {
    triggers: ["mat", "potence", "portique", "signal"],
    matches: ["mat", "potence", "portique", "signal", "signalisation"],
  },
  {
    triggers: ["armoire", "poste technique", "equipement"],
    matches: ["armoire", "poste technique", "equipement", "pre cablage", "signalisation"],
  },
];

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function revisionRank(value: string | null) {
  if (!value) return -1;
  const match = normalizeSearchText(value).match(/(?:v|r|rev)?\s*(\d+)/);
  return match ? Number(match[1]) : -1;
}

function latestDocuments(documents: SuggestibleDocument[]) {
  const latest = new Map<string, SuggestibleDocument>();
  for (const document of documents) {
    const key = normalizeSearchText(document.reference || document.title);
    const current = latest.get(key);
    if (!current || revisionRank(document.revision) > revisionRank(current.revision)) {
      latest.set(key, document);
    }
  }
  return [...latest.values()];
}

export function suggestDocumentsForTask(
  documents: SuggestibleDocument[],
  context: DocumentSuggestionContext,
) {
  const contextText = normalizeSearchText(
    `${context.title} ${context.description ?? ""} ${context.activityName} ${context.workType}`,
  );
  const contextTokens = [...new Set(contextText.split(" "))].filter(
    (token) => token.length >= 3 && !ignoredWords.has(token),
  );
  const activeDomains = domains.filter((domain) =>
    domain.triggers.some((trigger) => contextText.includes(trigger)),
  );

  return latestDocuments(
    documents.filter((document) =>
      document.document_type === "plan" || document.document_type === "procedure",
    ),
  )
    .map((document) => {
      const documentText = normalizeSearchText(
        `${document.reference ?? ""} ${document.title} ${document.document_subcategory ?? ""} ${document.category ?? ""}`,
      );
      const sharedTokens = contextTokens.filter((token) =>
        documentText.includes(token),
      );
      const domainMatches = activeDomains.flatMap((domain) => domain.matches)
        .filter((keyword, index, values) => values.indexOf(keyword) === index)
        .filter((keyword) => documentText.includes(keyword));
      let score = sharedTokens.length * 2 + domainMatches.length * 3;
      if (document.activity_id && document.activity_id === context.activityId) score += 8;
      if (document.zone_id && document.zone_id === context.zoneId) score += 3;
      if (document.phase_id && document.phase_id === context.phaseId) score += 2;
      return { document, score, reasons: [...sharedTokens, ...domainMatches] };
    })
    .filter((suggestion) => suggestion.score >= 3)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, 12);
}
