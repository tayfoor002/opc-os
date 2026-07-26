const STORAGE_PATH_MARKERS = [
  "/storage/v1/object/public/documents/",
  "/storage/v1/object/sign/documents/",
  "/storage/v1/object/authenticated/documents/",
  "/storage/v1/object/documents/",
];

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getDocumentStoragePathCandidates(fileUrl: string): string[] {
  const candidates = new Set<string>();

  function addCandidate(value: string) {
    const cleaned = decodePath(value)
      .split("?")[0]
      .replace(/^\/+/, "")
      .trim();

    if (!cleaned) {
      return;
    }

    candidates.add(cleaned);

    if (cleaned.startsWith("documents/")) {
      candidates.add(cleaned.slice("documents/".length));
    }
  }

  addCandidate(fileUrl);

  try {
    const pathname = new URL(fileUrl).pathname;

    for (const marker of STORAGE_PATH_MARKERS) {
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        addCandidate(pathname.slice(markerIndex + marker.length));
      }
    }
  } catch {
    // Bucket-relative paths are expected and do not need URL parsing.
  }

  return [...candidates];
}
