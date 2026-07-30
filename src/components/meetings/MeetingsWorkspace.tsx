"use client";

import {
  Archive,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  ClipboardList,
  Download,
  Edit3,
  FileDown,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { downloadReportPdf } from "@/lib/reporting/exports";
import { downloadMeetingWord } from "@/lib/meetings/word-export";
import { createClient } from "@/lib/supabase/client";
import type { CollaboratorOption } from "@/types/organization";
import type {
  MeetingAgendaPoint,
  MeetingMinute,
  MeetingParticipant,
  MeetingStatus,
  MeetingType,
} from "@/types/meeting";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";

const meetingTypeLabels: Record<MeetingType, string> = {
  coordination: "Réunion de coordination",
  site: "Réunion chantier",
  technical: "Réunion technique",
  safety: "Réunion sécurité / EHS",
  client: "Réunion client",
  other: "Autre réunion",
};

type MeetingForm = Omit<
  MeetingMinute,
  "id" | "project_id" | "created_at" | "updated_at"
>;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function newPoint(subject = ""): MeetingAgendaPoint {
  return {
    id: crypto.randomUUID(),
    subject,
    discussion: "",
    decision: "",
    owner: "",
    due_date: "",
    status: "open",
  };
}

function emptyMeeting(): MeetingForm {
  return {
    title: "",
    meeting_date: today(),
    start_time: "",
    end_time: "",
    location: "",
    meeting_type: "coordination",
    objective: "",
    introduction: "",
    participants: [],
    agenda_points: [newPoint()],
    general_notes: "",
    next_meeting_date: "",
    status: "draft",
  };
}

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function MeetingsWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const previewRef = useRef<HTMLElement | null>(null);
  const [projectId, setProjectId] = useState("");
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [meetings, setMeetings] = useState<MeetingMinute[]>([]);
  const [form, setForm] = useState<MeetingForm>(() => emptyMeeting());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"generator" | "archives">("generator");
  const [participantSearch, setParticipantSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveStatus, setArchiveStatus] = useState<"all" | MeetingStatus>(
    "all",
  );
  const [manualName, setManualName] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [rawPoints, setRawPoints] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [meetingToDelete, setMeetingToDelete] =
    useState<MeetingMinute | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadMeetings() {
    setLoading(true);
    setError("");
    const project = await supabase
      .from("projects")
      .select("id")
      .eq("code", "PDD")
      .single();
    if (project.error) {
      setError(project.error.message);
      setLoading(false);
      return;
    }
    setProjectId(project.data.id);

    const [peopleResult, meetingsResult] = await Promise.all([
      supabase
        .from("collaborators")
        .select("id,full_name,company,role,profile,phone")
        .eq("project_id", project.data.id)
        .eq("active", true)
        .order("company")
        .order("full_name"),
      supabase
        .from("meeting_minutes")
        .select("*")
        .eq("project_id", project.data.id)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (peopleResult.error) {
      setError(peopleResult.error.message);
    } else {
      setCollaborators(
        (peopleResult.data ?? []) as unknown as CollaboratorOption[],
      );
    }
    if (meetingsResult.error) {
      setError(
        `Les comptes rendus ne sont pas encore disponibles : ${meetingsResult.error.message}`,
      );
    } else {
      setMeetings(
        (meetingsResult.data ?? []) as unknown as MeetingMinute[],
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote synchronization
    void loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable client
  }, []);

  const visibleCollaborators = collaborators.filter((person) =>
    `${person.full_name} ${person.company} ${person.role}`
      .toLowerCase()
      .includes(participantSearch.toLowerCase()),
  );

  const visibleArchives = meetings.filter((meeting) => {
    const matchesSearch = `${meeting.title} ${meeting.location ?? ""} ${
      meeting.objective ?? ""
    }`
      .toLowerCase()
      .includes(archiveSearch.toLowerCase());
    const matchesStatus =
      archiveStatus === "all" || meeting.status === archiveStatus;
    return matchesSearch && matchesStatus;
  });

  const currentMeeting: MeetingMinute = {
    id: editingId ?? "preview",
    project_id: projectId,
    ...form,
    created_at: "",
    updated_at: "",
  };

  function startNewMeeting() {
    setEditingId(null);
    setForm(emptyMeeting());
    setRawPoints("");
    setNotice("");
    setError("");
    setView("generator");
  }

  function openMeeting(meeting: MeetingMinute) {
    setEditingId(meeting.id);
    setForm({
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      start_time: meeting.start_time ?? "",
      end_time: meeting.end_time ?? "",
      location: meeting.location ?? "",
      meeting_type: meeting.meeting_type,
      objective: meeting.objective ?? "",
      introduction: meeting.introduction ?? "",
      participants: meeting.participants ?? [],
      agenda_points:
        meeting.agenda_points?.length > 0
          ? meeting.agenda_points
          : [newPoint()],
      general_notes: meeting.general_notes ?? "",
      next_meeting_date: meeting.next_meeting_date ?? "",
      status: meeting.status,
    });
    setRawPoints("");
    setNotice("");
    setError("");
    setView("generator");
  }

  function toggleCollaborator(person: CollaboratorOption) {
    const selected = form.participants.some(
      (participant) => participant.collaborator_id === person.id,
    );
    setForm({
      ...form,
      participants: selected
        ? form.participants.filter(
            (participant) => participant.collaborator_id !== person.id,
          )
        : [
            ...form.participants,
            {
              id: crypto.randomUUID(),
              collaborator_id: person.id,
              name: person.full_name,
              company: person.company,
              role: person.role,
              manual: false,
            },
          ],
    });
  }

  function addManualParticipant() {
    if (!manualName.trim()) return;
    setForm({
      ...form,
      participants: [
        ...form.participants,
        {
          id: crypto.randomUUID(),
          collaborator_id: null,
          name: manualName.trim(),
          company: manualCompany.trim() || "Externe",
          role: manualRole.trim(),
          manual: true,
        },
      ],
    });
    setManualName("");
    setManualCompany("");
    setManualRole("");
  }

  function organizeRawPoints() {
    const subjects = rawPoints
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*(?:[-*•]|\d+[.)-]?)\s*/, "")
          .trim(),
      )
      .filter(Boolean);
    if (!subjects.length) return;
    const existingPoints = form.agenda_points.filter(
      (point) =>
        point.subject ||
        point.discussion ||
        point.decision ||
        point.owner ||
        point.due_date,
    );
    setForm({
      ...form,
      agenda_points: [
        ...existingPoints,
        ...subjects.map((subject) => newPoint(subject)),
      ],
    });
    setRawPoints("");
    setNotice(`${subjects.length} point(s) organisé(s) dans le compte rendu.`);
  }

  function updatePoint(
    pointId: string,
    patch: Partial<MeetingAgendaPoint>,
  ) {
    setForm({
      ...form,
      agenda_points: form.agenda_points.map((point) =>
        point.id === pointId ? { ...point, ...patch } : point,
      ),
    });
  }

  async function saveMeeting(status: MeetingStatus) {
    if (!projectId || !form.title.trim() || !form.meeting_date) {
      setError("Le titre et la date de réunion sont obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      project_id: projectId,
      title: form.title.trim(),
      meeting_date: form.meeting_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location?.trim() || null,
      meeting_type: form.meeting_type,
      objective: form.objective?.trim() || null,
      introduction: form.introduction?.trim() || null,
      participants: form.participants,
      agenda_points: form.agenda_points.filter(
        (point) =>
          point.subject.trim() ||
          point.discussion.trim() ||
          point.decision.trim(),
      ),
      general_notes: form.general_notes?.trim() || null,
      next_meeting_date: form.next_meeting_date || null,
      status,
    };
    const result = editingId
      ? await supabase
          .from("meeting_minutes")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single()
      : await supabase
          .from("meeting_minutes")
          .insert(payload)
          .select("*")
          .single();

    if (result.error) {
      setError(result.error.message);
    } else {
      const saved = result.data as unknown as MeetingMinute;
      setEditingId(saved.id);
      setForm((current) => ({ ...current, status }));
      setNotice(
        status === "finalized"
          ? "Compte rendu finalisé et archivé."
          : "Brouillon enregistré dans les archives.",
      );
      await loadMeetings();
    }
    setSaving(false);
  }

  async function deleteMeeting() {
    if (!meetingToDelete) return;
    setDeleting(true);
    const result = await supabase
      .from("meeting_minutes")
      .delete()
      .eq("id", meetingToDelete.id);
    if (result.error) {
      setError(result.error.message);
    } else {
      if (editingId === meetingToDelete.id) startNewMeeting();
      setMeetingToDelete(null);
      await loadMeetings();
    }
    setDeleting(false);
  }

  async function exportPdf() {
    if (!previewRef.current) return;
    setExporting("pdf");
    setError("");
    try {
      await downloadReportPdf(
        previewRef.current,
        `cr-${cleanFileName(form.title || "reunion")}-${form.meeting_date}.pdf`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le PDF.",
      );
    }
    setExporting(null);
  }

  async function exportWord() {
    setExporting("word");
    setError("");
    try {
      await downloadMeetingWord(
        currentMeeting,
        `cr-${cleanFileName(form.title || "reunion")}-${form.meeting_date}.docx`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le document Word.",
      );
    }
    setExporting(null);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
            Gestion des réunions
          </p>
          <h1 className="mt-2 text-4xl font-black">Comptes rendus de réunion</h1>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">
            Préparez, structurez, exportez et archivez les CR du projet PDD.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadMeetings()}
            className="flex h-11 items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-4 text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          <button
            type="button"
            onClick={startNewMeeting}
            className="flex h-11 items-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white"
          >
            <CirclePlus className="h-4 w-4" /> Nouveau CR
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-[var(--opc-border)] bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setView("generator")}
          className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-black ${
            view === "generator"
              ? "bg-[var(--opc-blue)] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ClipboardList className="h-4 w-4" /> Générateur de CR
        </button>
        <button
          type="button"
          onClick={() => setView("archives")}
          className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-black ${
            view === "archives"
              ? "bg-[var(--opc-blue)] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Archive className="h-4 w-4" /> Archives ({meetings.length})
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-80 place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--opc-blue)]" />
        </div>
      ) : null}

      {!loading && view === "generator" ? (
        <div className="mt-6 grid items-start gap-6 2xl:grid-cols-[minmax(420px,0.75fr)_minmax(700px,1.25fr)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
              <SectionHeading
                number="1"
                title="Informations de la réunion"
                icon={<CalendarDays className="h-5 w-5" />}
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Titre du compte rendu" wide>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="Coordination travaux — Zone Casa"
                    className="input"
                  />
                </Field>
                <Field label="Type de réunion">
                  <select
                    value={form.meeting_type}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        meeting_type: event.target.value as MeetingType,
                      })
                    }
                    className="input"
                  >
                    {Object.entries(meetingTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    value={form.meeting_date}
                    onChange={(event) =>
                      setForm({ ...form, meeting_date: event.target.value })
                    }
                    className="input"
                  />
                </Field>
                <Field label="Heure de début">
                  <input
                    type="time"
                    value={form.start_time ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, start_time: event.target.value })
                    }
                    className="input"
                  />
                </Field>
                <Field label="Heure de fin">
                  <input
                    type="time"
                    value={form.end_time ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, end_time: event.target.value })
                    }
                    className="input"
                  />
                </Field>
                <Field label="Lieu" wide>
                  <input
                    value={form.location ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    placeholder="Base vie, chantier, Teams..."
                    className="input"
                  />
                </Field>
                <Field label="Objet / objectif" wide>
                  <textarea
                    rows={3}
                    value={form.objective ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, objective: event.target.value })
                    }
                    placeholder="But principal et résultats attendus de la réunion..."
                    className="input resize-none"
                  />
                </Field>
                <Field label="Contexte / introduction" wide>
                  <textarea
                    rows={3}
                    value={form.introduction ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, introduction: event.target.value })
                    }
                    placeholder="Contexte utile avant les points examinés..."
                    className="input resize-none"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
              <SectionHeading
                number="2"
                title="Participants"
                icon={<Users className="h-5 w-5" />}
              />
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={participantSearch}
                  onChange={(event) => setParticipantSearch(event.target.value)}
                  placeholder="Rechercher dans l’organigramme..."
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
                />
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-[var(--opc-border)] p-2">
                {visibleCollaborators.map((person) => {
                  const checked = form.participants.some(
                    (participant) => participant.collaborator_id === person.id,
                  );
                  return (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCollaborator(person)}
                        className="h-4 w-4 accent-[var(--opc-blue)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">
                          {person.full_name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {person.company} — {person.role}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-[var(--opc-blue)]">
                  <UserPlus className="h-4 w-4" /> Ajouter un participant externe
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <input
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Nom complet"
                    className="input"
                  />
                  <input
                    value={manualCompany}
                    onChange={(event) => setManualCompany(event.target.value)}
                    placeholder="Organisme"
                    className="input"
                  />
                  <input
                    value={manualRole}
                    onChange={(event) => setManualRole(event.target.value)}
                    placeholder="Fonction"
                    className="input"
                  />
                </div>
                <button
                  type="button"
                  onClick={addManualParticipant}
                  disabled={!manualName.trim()}
                  className="mt-3 h-10 rounded-xl bg-[var(--opc-blue)] px-4 text-xs font-black text-white disabled:opacity-50"
                >
                  Ajouter à la réunion
                </button>
              </div>
              {form.participants.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {form.participants.map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          participants: form.participants.filter(
                            (item) => item.id !== participant.id,
                          ),
                        })
                      }
                      title="Retirer ce participant"
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-[var(--opc-red)]"
                    >
                      {participant.name} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
              <SectionHeading
                number="3"
                title="Points et décisions"
                icon={<Sparkles className="h-5 w-5" />}
              />
              <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <p className="text-sm font-black text-violet-700">
                  Organiser mes notes en points de réunion
                </p>
                <p className="mt-1 text-xs text-violet-600">
                  Écrivez un point par ligne. Le générateur les transformera en
                  sections numérotées prêtes à compléter.
                </p>
                <textarea
                  rows={5}
                  value={rawPoints}
                  onChange={(event) => setRawPoints(event.target.value)}
                  placeholder={"Avancement GC zone Casa\nValidation du plan EXE\nBesoin matériel semaine prochaine"}
                  className="input mt-3 resize-none"
                />
                <button
                  type="button"
                  onClick={organizeRawPoints}
                  disabled={!rawPoints.trim()}
                  className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" /> Organiser les points
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {form.agenda_points.map((point, index) => (
                  <article
                    key={point.id}
                    className="rounded-xl border border-[var(--opc-border)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-[var(--opc-blue)]">
                        Point {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            agenda_points: form.agenda_points.filter(
                              (item) => item.id !== point.id,
                            ),
                          })
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-[var(--opc-red)]"
                        aria-label={`Supprimer le point ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="Sujet" wide>
                        <input
                          value={point.subject}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              subject: event.target.value,
                            })
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="Échanges / constat" wide>
                        <textarea
                          rows={3}
                          value={point.discussion}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              discussion: event.target.value,
                            })
                          }
                          className="input resize-none"
                        />
                      </Field>
                      <Field label="Décision / action" wide>
                        <textarea
                          rows={3}
                          value={point.decision}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              decision: event.target.value,
                            })
                          }
                          className="input resize-none"
                        />
                      </Field>
                      <Field label="Responsable">
                        <input
                          list="meeting-participant-names"
                          value={point.owner}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              owner: event.target.value,
                            })
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="Échéance">
                        <input
                          type="date"
                          value={point.due_date}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              due_date: event.target.value,
                            })
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="État">
                        <select
                          value={point.status}
                          onChange={(event) =>
                            updatePoint(point.id, {
                              status: event.target.value as "open" | "done",
                            })
                          }
                          className="input"
                        >
                          <option value="open">Action ouverte</option>
                          <option value="done">Action clôturée</option>
                        </select>
                      </Field>
                    </div>
                  </article>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    agenda_points: [...form.agenda_points, newPoint()],
                  })
                }
                className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-blue-200 px-4 text-xs font-black text-[var(--opc-blue)] hover:bg-blue-50"
              >
                <CirclePlus className="h-4 w-4" /> Ajouter un point
              </button>
            </section>

            <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
              <SectionHeading
                number="4"
                title="Clôture du CR"
                icon={<CheckCircle2 className="h-5 w-5" />}
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Observations générales" wide>
                  <textarea
                    rows={4}
                    value={form.general_notes ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, general_notes: event.target.value })
                    }
                    className="input resize-none"
                    placeholder="Risques, réserves, informations complémentaires..."
                  />
                </Field>
                <Field label="Date de la prochaine réunion">
                  <input
                    type="date"
                    min={form.meeting_date}
                    value={form.next_meeting_date ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        next_meeting_date: event.target.value,
                      })
                    }
                    className="input"
                  />
                </Field>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveMeeting("draft")}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--opc-border)] px-4 text-sm font-black text-slate-600 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Edit3 className="h-4 w-4" />
                  )}
                  Enregistrer le brouillon
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveMeeting("finalized")}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Finaliser et archiver
                </button>
              </div>
            </section>
          </div>

          <div className="2xl:sticky 2xl:top-28">
            <div className="mb-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => void exportPdf()}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white disabled:opacity-50"
              >
                {exporting === "pdf" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Télécharger PDF
              </button>
              <button
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => void exportWord()}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-sm font-black text-white disabled:opacity-50"
              >
                {exporting === "word" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Télécharger Word
              </button>
            </div>
            <MeetingPreview meeting={currentMeeting} previewRef={previewRef} />
          </div>
        </div>
      ) : null}

      {!loading && view === "archives" ? (
        <section className="mt-6 rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-xl font-black">Archives des comptes rendus</h2>
              <p className="mt-1 text-sm text-slate-500">
                Chaque brouillon et CR finalisé reste consultable et modifiable.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={archiveSearch}
                  onChange={(event) => setArchiveSearch(event.target.value)}
                  placeholder="Rechercher un CR..."
                  className="min-w-56 bg-transparent py-2.5 text-sm outline-none"
                />
              </div>
              <select
                value={archiveStatus}
                onChange={(event) =>
                  setArchiveStatus(
                    event.target.value as "all" | MeetingStatus,
                  )
                }
                className="rounded-xl border border-[var(--opc-border)] bg-white px-3 py-2.5 text-sm font-bold"
              >
                <option value="all">Tous les statuts</option>
                <option value="draft">Brouillons</option>
                <option value="finalized">Finalisés</option>
              </select>
            </div>
          </div>

          {visibleArchives.length ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {visibleArchives.map((meeting) => (
                <article
                  key={meeting.id}
                  className="rounded-2xl border border-[var(--opc-border)] p-5 transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            meeting.status === "finalized"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {meeting.status === "finalized"
                            ? "Finalisé"
                            : "Brouillon"}
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {meetingTypeLabels[meeting.meeting_type]}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-lg font-black">
                        {meeting.title}
                      </h3>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openMeeting(meeting)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] text-slate-600 hover:bg-blue-50 hover:text-[var(--opc-blue)]"
                        title="Consulter ou modifier"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeetingToDelete(meeting)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-[var(--opc-red)] hover:bg-red-50"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                    <p className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-[var(--opc-blue)]" />
                      {meeting.meeting_date}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[var(--opc-blue)]" />
                      {meeting.location || "Lieu non renseigné"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-[var(--opc-blue)]" />
                      {meeting.participants.length} participant(s)
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                    <span>{meeting.agenda_points.length} point(s) traité(s)</span>
                    <button
                      type="button"
                      onClick={() => openMeeting(meeting)}
                      className="font-black text-[var(--opc-blue)]"
                    >
                      Ouvrir le compte rendu →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Archive className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-black text-slate-600">
                Aucun compte rendu archivé
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Créez votre premier CR depuis le générateur.
              </p>
            </div>
          )}
        </section>
      ) : null}

      <datalist id="meeting-participant-names">
        {form.participants.map((participant) => (
          <option key={participant.id} value={participant.name} />
        ))}
      </datalist>

      <ConfirmDeleteDialog
        open={Boolean(meetingToDelete)}
        title="Supprimer ce compte rendu ?"
        description="Le compte rendu et toutes ses informations archivées seront définitivement supprimés."
        subject={meetingToDelete?.title}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open) setMeetingToDelete(null);
        }}
        onConfirm={deleteMeeting}
      />
    </div>
  );
}

function MeetingPreview({
  meeting,
  previewRef,
}: {
  meeting: MeetingMinute;
  previewRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <article
      ref={previewRef}
      className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-lg"
    >
      <header className="grid min-h-28 grid-cols-[150px_1fr_150px] items-center gap-4 bg-[var(--opc-red)] px-5 py-4 text-white">
        <div className="flex h-16 items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/alstom-logo.png"
            alt="Alstom"
            className="h-auto max-h-11 w-auto max-w-full object-contain brightness-0 invert"
          />
        </div>
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            MARCHÉ N° 625C07 PDD
          </p>
          <p className="mt-2 text-base font-black uppercase">
            PROGRAMME DE DÉVELOPPEMENT
          </p>
        </div>
        <div className="flex h-16 items-center justify-center p-2">
          <span className="text-2xl font-black tracking-[0.12em] text-white">
            AVANZIT
          </span>
        </div>
      </header>

      <div className="border-b border-[var(--opc-border)] px-7 py-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
          Compte rendu de réunion
        </p>
        <h2 className="mt-2 text-2xl font-black uppercase text-[var(--opc-ink)]">
          {meeting.title || "Titre de la réunion"}
        </h2>
        <p className="mt-2 font-bold text-[var(--opc-blue)]">
          {meetingTypeLabels[meeting.meeting_type]}
        </p>
      </div>

      <div className="p-7">
        <div className="grid gap-3 rounded-xl border border-[var(--opc-border)] bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <p>
            <strong>Date</strong>
            <br />
            {meeting.meeting_date || "—"}
          </p>
          <p>
            <strong>Horaire</strong>
            <br />
            {[meeting.start_time, meeting.end_time].filter(Boolean).join(" — ") ||
              "—"}
          </p>
          <p>
            <strong>Lieu</strong>
            <br />
            {meeting.location || "—"}
          </p>
          <p>
            <strong>Statut</strong>
            <br />
            {meeting.status === "finalized" ? "Finalisé" : "Brouillon"}
          </p>
        </div>

        <PreviewSection number="1" title="Objet de la réunion">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {meeting.objective || "Objet à renseigner."}
          </p>
          {meeting.introduction ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {meeting.introduction}
            </p>
          ) : null}
        </PreviewSection>

        <PreviewSection number="2" title="Participants">
          {meeting.participants.length ? (
            <div className="overflow-hidden rounded-xl border border-[var(--opc-border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 font-black">Nom</th>
                    <th className="px-3 py-2 font-black">Organisme</th>
                    <th className="px-3 py-2 font-black">Fonction</th>
                  </tr>
                </thead>
                <tbody>
                  {meeting.participants.map((participant) => (
                    <tr
                      key={participant.id}
                      className="border-t border-[var(--opc-border)]"
                    >
                      <td className="px-3 py-2 font-bold">{participant.name}</td>
                      <td className="px-3 py-2">{participant.company || "—"}</td>
                      <td className="px-3 py-2">{participant.role || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Aucun participant sélectionné.</p>
          )}
        </PreviewSection>

        <PreviewSection
          number="3"
          title="Points examinés, décisions et plan d’action"
        >
          {meeting.agenda_points.length ? (
            <div className="space-y-3">
              {meeting.agenda_points.map((point, index) => (
                <article
                  key={point.id}
                  className="overflow-hidden rounded-xl border border-[var(--opc-border)]"
                >
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                    <p className="font-black text-[var(--opc-ink)]">
                      {index + 1}. {point.subject || "Point à compléter"}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                        point.status === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {point.status === "done" ? "Clôturé" : "Ouvert"}
                    </span>
                  </div>
                  <div className="grid gap-3 p-4 text-xs md:grid-cols-2">
                    <div>
                      <p className="font-black uppercase text-slate-400">
                        Échanges / constat
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-5 text-slate-600">
                        {point.discussion || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-black uppercase text-slate-400">
                        Décision / action
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-5 text-slate-600">
                        {point.decision || "—"}
                      </p>
                    </div>
                    <p>
                      <strong>Responsable :</strong> {point.owner || "—"}
                    </p>
                    <p>
                      <strong>Échéance :</strong> {point.due_date || "—"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Aucun point ajouté.</p>
          )}
        </PreviewSection>

        <PreviewSection number="4" title="Observations générales">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {meeting.general_notes || "Rien à signaler."}
          </p>
          {meeting.next_meeting_date ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-[var(--opc-red)]">
              Prochaine réunion : {meeting.next_meeting_date}
            </p>
          ) : null}
        </PreviewSection>

        <PreviewSection number="5" title="Validation">
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--opc-border)] text-center text-xs">
            {["Établi par", "Vérifié par", "Approuvé par"].map((label) => (
              <div
                key={label}
                className="min-h-24 border-r border-[var(--opc-border)] p-3 last:border-r-0"
              >
                <p className="font-black">{label}</p>
                <p className="mt-12 text-slate-400">Nom / signature</p>
              </div>
            ))}
          </div>
        </PreviewSection>
      </div>
    </article>
  );
}

function PreviewSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-base font-black uppercase">
        {number}. {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SectionHeading({
  number,
  title,
  icon,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 font-black text-[var(--opc-blue)]">
        {number}
      </span>
      <span className="text-[var(--opc-blue)]">{icon}</span>
      <h2 className="text-lg font-black">{title}</h2>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
