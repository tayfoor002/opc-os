export type PastedPvDocument = {
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location: string;
  objective: string;
  introduction: string;
  participants: Array<{ name: string; company: string; role: string }>;
  agenda_points: Array<{
    subject: string;
    discussion: string;
    decision: string;
    owner: string;
    due_date: string;
    status: "open" | "done";
  }>;
  general_notes: string;
  next_meeting_date: string;
};

const DATE_PATTERN = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/;
const FIELD_PATTERN =
  /^\s*(date|lieu|objet|heure|horaire|prochaine\s+r[ée]union)\s*[:\-]\s*(.+)$/i;
const SECTION_PATTERN =
  /^\s*(participants?|pr[ée]sents?|ordre\s+du\s+jour|points?\s+trait[ée]s?|d[ée]roulement|discussions?|d[ée]cisions?|actions?|observations?|notes?|conclusion)\s*:?[\s]*$/i;

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toIsoDate(value: string) {
  const match = value.match(DATE_PATTERN);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function looksLikeGenericHeading(value: string) {
  return /^(proc[eè]s[- ]verbal|pv|compte[- ]rendu|cr|r[ée]union)(\s+de\s+r[ée]union)?$/i.test(
    value,
  );
}

function stripListPrefix(value: string) {
  return value.replace(/^\s*(?:[-*•▪–—]|\d+[.)-])\s*/, "").trim();
}

function parseParticipant(value: string) {
  const parts = stripListPrefix(value)
    .split(/\s+(?:[-–—|])\s+|\s*;\s*/)
    .map(cleanLine)
    .filter(Boolean);
  return {
    name: parts[0] ?? "",
    company: parts[1] ?? "",
    role: parts.slice(2).join(" — "),
  };
}

function sectionName(value: string) {
  const normalized = value.toLocaleLowerCase("fr");
  if (/participant|pr[ée]sent/.test(normalized)) return "participants";
  if (/ordre du jour|point|d[ée]roulement|discussion/.test(normalized)) {
    return "agenda";
  }
  if (/d[ée]cision|action/.test(normalized)) return "decisions";
  if (/observation|note|conclusion/.test(normalized)) return "notes";
  return "";
}

export function parsePastedPv(
  rawText: string,
  requestedTitle: string,
): PastedPvDocument {
  const normalizedText = rawText.replace(/\r\n?/g, "\n").trim();
  const lines = normalizedText.split("\n");
  const nonEmptyLines = lines.map(cleanLine).filter(Boolean);
  let title = cleanLine(requestedTitle);
  let meetingDate = "";
  let startTime = "";
  let endTime = "";
  let location = "";
  let objective = "";
  let nextMeetingDate = "";
  let activeSection = "";
  const participants: PastedPvDocument["participants"] = [];
  const agendaLines: string[] = [];
  const decisionLines: string[] = [];
  const noteLines: string[] = [];

  for (const originalLine of lines) {
    const line = cleanLine(originalLine);
    if (!line) continue;

    const section = line.match(SECTION_PATTERN);
    if (section) {
      activeSection = sectionName(section[1]);
      continue;
    }

    const field = line.match(FIELD_PATTERN);
    if (field) {
      const label = field[1].toLocaleLowerCase("fr");
      const value = cleanLine(field[2]);
      if (label === "date") meetingDate = toIsoDate(value);
      else if (label === "lieu") location = value;
      else if (label === "objet") objective = value;
      else if (label.startsWith("prochaine")) nextMeetingDate = toIsoDate(value);
      else if (label === "heure" || label === "horaire") {
        const times = value.match(/\b\d{1,2}(?::|h)\d{2}\b/gi) ?? [];
        startTime = times[0]?.replace(/h/i, ":") ?? "";
        endTime = times[1]?.replace(/h/i, ":") ?? "";
      }
      continue;
    }

    if (activeSection === "participants") {
      const participant = parseParticipant(line);
      if (participant.name) participants.push(participant);
    } else if (activeSection === "agenda") agendaLines.push(line);
    else if (activeSection === "decisions") decisionLines.push(line);
    else if (activeSection === "notes") noteLines.push(line);
  }

  if (!title) {
    const candidate = nonEmptyLines.find(
      (line) =>
        !FIELD_PATTERN.test(line) &&
        !SECTION_PATTERN.test(line) &&
        !looksLikeGenericHeading(line),
    );
    title = candidate || "Procès-verbal de réunion";
  }
  if (!meetingDate) {
    meetingDate = toIsoDate(
      nonEmptyLines.find((line) => /\bdate\b/i.test(line)) ?? "",
    );
  }

  const pointSources = agendaLines.length ? agendaLines : decisionLines;
  const agendaPoints = pointSources.map((line, index) => {
    const content = stripListPrefix(line);
    return {
      subject: content || `Point ${index + 1}`,
      discussion: agendaLines.length ? content : "",
      decision: agendaLines.length ? decisionLines[index] ?? "" : content,
      owner: "",
      due_date: "",
      status: "open" as const,
    };
  });

  return {
    title,
    meeting_date: meetingDate,
    start_time: startTime,
    end_time: endTime,
    location,
    objective,
    introduction: normalizedText,
    participants,
    agenda_points: agendaPoints,
    general_notes: noteLines.join("\n"),
    next_meeting_date: nextMeetingDate,
  };
}
