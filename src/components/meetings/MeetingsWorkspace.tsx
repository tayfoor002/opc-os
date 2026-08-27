"use client";

import {
  Archive,
  CalendarDays,
  Camera,
  CheckCircle2,
  CirclePlus,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  MapPin,
  RefreshCw,
  Rows3,
  Search,
  Sparkles,
  Table2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { importMeetingTablesFromExcel } from "@/lib/meetings/excel-import";
import { downloadMeetingPdf } from "@/lib/meetings/pdf-export";
import { downloadMeetingWord } from "@/lib/meetings/word-export";
import { createClient } from "@/lib/supabase/client";
import type { CollaboratorOption } from "@/types/organization";
import type {
  MeetingAgendaPoint,
  MeetingCustomTable,
  MeetingMinute,
  MeetingParticipant,
  MeetingPhoto,
  MeetingStatus,
  MeetingType,
} from "@/types/meeting";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { HandwrittenPvImport } from "@/components/meetings/HandwrittenPvImport";
import { PastedPvImport } from "@/components/meetings/PastedPvImport";
import type { PvOcrResult } from "@/lib/meetings/pv-ocr";

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

type PendingMeetingPhoto = {
  id: string;
  file: File;
  caption: string;
  previewUrl: string;
};

type MeetingZone = { id: string; code: string; name: string };

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

function newCustomTable(): MeetingCustomTable {
  return {
    id: crypto.randomUUID(),
    title: "Nouveau tableau",
    columns: ["Colonne 1", "Colonne 2", "Colonne 3"],
    rows: [["", "", ""]],
  };
}

function emptyMeeting(): MeetingForm {
  return {
    zone_id: null,
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
    custom_tables: [],
    photos: [],
    general_notes: "",
    next_meeting_date: "",
    source_file_path: null,
    source_original_name: null,
    source_mime_type: null,
    ocr_confidence: null,
    ocr_warnings: [],
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

function safeStorageFileName(value: string) {
  return cleanFileName(value.replace(/\.[^.]+$/, "")) +
    (value.match(/\.[a-zA-Z0-9]+$/)?.[0].toLowerCase() || ".jpg");
}

export function MeetingsWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [projectId, setProjectId] = useState("");
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [zones, setZones] = useState<MeetingZone[]>([]);
  const [meetings, setMeetings] = useState<MeetingMinute[]>([]);
  const [form, setForm] = useState<MeetingForm>(() => emptyMeeting());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"generator" | "archives">("generator");
  const [participantSearch, setParticipantSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveStatus, setArchiveStatus] = useState<"all" | MeetingStatus>(
    "all",
  );
  const [archiveZone, setArchiveZone] = useState("all");
  const [manualName, setManualName] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [rawPoints, setRawPoints] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);
  const [exportError, setExportError] = useState("");
  const [excelImporting, setExcelImporting] = useState(false);
  const [showOncfLogo, setShowOncfLogo] = useState(false);
  const [meetingPhotoUrls, setMeetingPhotoUrls] = useState<
    Record<string, string>
  >({});
  const [pendingPhotos, setPendingPhotos] = useState<PendingMeetingPhoto[]>([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]);
  const [pendingPvSource, setPendingPvSource] = useState<File | null>(null);
  const [sourcePvUrls, setSourcePvUrls] = useState<Record<string, string>>({});
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

    const [peopleResult, meetingsResult, zonesResult] = await Promise.all([
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
      supabase
        .from("zones")
        .select("id,code,name")
        .eq("project_id", project.data.id)
        .order("sort_order"),
    ]);

    if (peopleResult.error) {
      setError(peopleResult.error.message);
    } else {
      setCollaborators(
        (peopleResult.data ?? []) as unknown as CollaboratorOption[],
      );
    }
    if (zonesResult.error) {
      setError(`Les zones ne sont pas disponibles : ${zonesResult.error.message}`);
    } else {
      setZones((zonesResult.data ?? []) as MeetingZone[]);
    }
    if (meetingsResult.error) {
      setError(
        `Les comptes rendus ne sont pas encore disponibles : ${meetingsResult.error.message}`,
      );
    } else {
      const loadedMeetings = (
        (meetingsResult.data ?? []) as unknown as MeetingMinute[]
      ).map((meeting) => ({
        ...meeting,
        custom_tables: meeting.custom_tables ?? [],
        photos: meeting.photos ?? [],
        ocr_warnings: meeting.ocr_warnings ?? [],
      }));
      setMeetings(loadedMeetings);
      const photoPaths = loadedMeetings.flatMap((meeting) =>
        meeting.photos.map((photo) => photo.file_path).filter(Boolean),
      );
      if (photoPaths.length) {
        const signed = await supabase.storage
          .from("meeting-photos")
          .createSignedUrls(photoPaths, 60 * 60);
        if (!signed.error) {
          setMeetingPhotoUrls(
            Object.fromEntries(
              (signed.data ?? [])
                .filter((item) => item.signedUrl)
                .map((item) => [item.path, item.signedUrl]),
            ),
          );
        }
      } else {
        setMeetingPhotoUrls({});
      }
      const sourcePaths = loadedMeetings
        .map((meeting) => meeting.source_file_path)
        .filter((path): path is string => Boolean(path));
      if (sourcePaths.length) {
        const signedSources = await supabase.storage
          .from("meeting-pv-sources")
          .createSignedUrls(sourcePaths, 60 * 60);
        if (!signedSources.error) {
          setSourcePvUrls(
            Object.fromEntries(
              (signedSources.data ?? [])
                .filter((item) => item.signedUrl)
                .map((item) => [item.path, item.signedUrl]),
            ),
          );
        }
      } else {
        setSourcePvUrls({});
      }
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
    const matchesZone = archiveZone === "all" || meeting.zone_id === archiveZone;
    return matchesSearch && matchesStatus && matchesZone;
  });

  const currentMeeting: MeetingMinute = {
    id: editingId ?? "preview",
    project_id: projectId,
    ...form,
    zone_name: zones.find((zone) => zone.id === form.zone_id)?.name,
    photos: [
      ...form.photos.map((photo) => ({
        ...photo,
        url: meetingPhotoUrls[photo.file_path],
      })),
      ...pendingPhotos.map((photo) => ({
        id: photo.id,
        file_path: "",
        caption: photo.caption,
        url: photo.previewUrl,
      })),
    ],
    created_at: "",
    updated_at: "",
  };

  function startNewMeeting() {
    pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setEditingId(null);
    setForm(emptyMeeting());
    setPendingPhotos([]);
    setRemovedPhotoPaths([]);
    setPendingPvSource(null);
    setRawPoints("");
    setNotice("");
    setError("");
    setView("generator");
  }

  function openMeeting(meeting: MeetingMinute) {
    pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setEditingId(meeting.id);
    setForm({
      title: meeting.title,
      zone_id: meeting.zone_id ?? null,
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
      custom_tables: meeting.custom_tables ?? [],
      photos: meeting.photos ?? [],
      general_notes: meeting.general_notes ?? "",
      next_meeting_date: meeting.next_meeting_date ?? "",
      source_file_path: meeting.source_file_path ?? null,
      source_original_name: meeting.source_original_name ?? null,
      source_mime_type: meeting.source_mime_type ?? null,
      ocr_confidence: meeting.ocr_confidence ?? null,
      ocr_warnings: meeting.ocr_warnings ?? [],
      status: meeting.status,
    });
    setRawPoints("");
    setPendingPhotos([]);
    setRemovedPhotoPaths([]);
    setPendingPvSource(null);
    setNotice("");
    setError("");
    setView("generator");
  }

  function applyPvAnalysis(
    result: PvOcrResult,
    sourceFile: File,
    zoneId: string,
    classification: MeetingType,
  ) {
    setForm((current) => ({
      ...current,
      zone_id: zoneId,
      title: result.title.trim() || current.title || "Procès-verbal de réunion",
      meeting_date: result.meeting_date || current.meeting_date,
      start_time: result.start_time || "",
      end_time: result.end_time || "",
      location: result.location || "",
      meeting_type: classification,
      objective: result.objective || "",
      introduction: result.introduction || "",
      participants: result.participants.map((participant) => ({
        id: crypto.randomUUID(),
        collaborator_id: null,
        name: participant.name,
        company: participant.company,
        role: participant.role,
        manual: true,
      })),
      agenda_points: result.agenda_points.length
        ? result.agenda_points.map((point) => ({
            id: crypto.randomUUID(),
            ...point,
          }))
        : [newPoint()],
      general_notes: result.general_notes || "",
      next_meeting_date: result.next_meeting_date || "",
      source_original_name: sourceFile.name,
      source_mime_type: sourceFile.type,
      ocr_confidence: result.confidence,
      ocr_warnings: [...result.warnings, ...result.uncertain_fragments],
    }));
    setPendingPvSource(sourceFile);
    setNotice(
      `PV lu et classé. Fiabilité estimée : ${Math.round(result.confidence * 100)} %. Vérifiez les passages signalés avant d’archiver.`,
    );
  }

  function applyPastedPv(
    result: PvOcrResult,
    zoneId: string,
    classification: MeetingType,
  ) {
    setForm((current) => ({
      ...current,
      zone_id: zoneId,
      title: result.title.trim() || "Procès-verbal de réunion",
      meeting_date: result.meeting_date || current.meeting_date,
      start_time: result.start_time || "",
      end_time: result.end_time || "",
      location: result.location || "",
      meeting_type: classification,
      objective: result.objective || "",
      introduction: result.introduction,
      participants: result.participants.map((participant) => ({
        id: crypto.randomUUID(),
        collaborator_id: null,
        name: participant.name,
        company: participant.company,
        role: participant.role,
        manual: true,
      })),
      agenda_points: result.agenda_points.length
        ? result.agenda_points.map((point) => ({
            id: crypto.randomUUID(),
            ...point,
          }))
        : [newPoint()],
      general_notes: result.general_notes || "",
      next_meeting_date: result.next_meeting_date || "",
      source_file_path: null,
      source_original_name: null,
      source_mime_type: null,
      ocr_confidence: null,
      ocr_warnings: [],
    }));
    setPendingPvSource(null);
    setNotice(
      "Texte du PV intégré. Vérifiez l’aperçu, puis téléchargez le PDF ou le fichier Word.",
    );
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

  function updateCustomTable(
    tableId: string,
    patch: Partial<MeetingCustomTable>,
  ) {
    setForm((current) => ({
      ...current,
      custom_tables: current.custom_tables.map((table) =>
        table.id === tableId ? { ...table, ...patch } : table,
      ),
    }));
  }

  function addTableColumn(table: MeetingCustomTable) {
    updateCustomTable(table.id, {
      columns: [...table.columns, `Colonne ${table.columns.length + 1}`],
      rows: table.rows.map((row) => [...row, ""]),
    });
  }

  function removeTableColumn(table: MeetingCustomTable, columnIndex: number) {
    if (table.columns.length <= 1) return;
    updateCustomTable(table.id, {
      columns: table.columns.filter((_, index) => index !== columnIndex),
      rows: table.rows.map((row) =>
        row.filter((_, index) => index !== columnIndex),
      ),
    });
  }

  function updateTableCell(
    table: MeetingCustomTable,
    rowIndex: number,
    columnIndex: number,
    value: string,
  ) {
    updateCustomTable(table.id, {
      rows: table.rows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) =>
              currentColumnIndex === columnIndex ? value : cell,
            )
          : row,
      ),
    });
  }

  function addMeetingPhotos(files: File[]) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const validFiles = files.filter((file) => {
      if (!allowedTypes.includes(file.type)) {
        setError("Seules les images JPG, PNG et WebP sont acceptées.");
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError(`La photo « ${file.name} » dépasse 8 Mo.`);
        return false;
      }
      return true;
    });
    if (!validFiles.length) return;

    setPendingPhotos((current) => {
      const available = Math.max(0, 12 - form.photos.length - current.length);
      if (validFiles.length > available) {
        setError("Maximum 12 photos par compte rendu.");
      } else {
        setError("");
      }
      return [
        ...current,
        ...validFiles.slice(0, available).map((file) => ({
          id: crypto.randomUUID(),
          file,
          caption: "",
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });
  }

  function removePendingPhoto(photoId: string) {
    setPendingPhotos((current) => {
      const photo = current.find((item) => item.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== photoId);
    });
  }

  function removeSavedPhoto(photo: MeetingPhoto) {
    setForm((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== photo.id),
    }));
    if (photo.file_path) {
      setRemovedPhotoPaths((current) => [...current, photo.file_path]);
    }
  }

  async function importExcelTables(file: File) {
    setExcelImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await importMeetingTablesFromExcel(file);
      setForm((current) => ({
        ...current,
        custom_tables: [...current.custom_tables, ...result.tables],
      }));
      const warningText = result.warnings.length
        ? ` ${result.warnings.join(" ")}`
        : "";
      setNotice(
        `${result.tables.length} tableau(x) créé(s) depuis ${result.importedSheets} feuille(s) Excel.${warningText}`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Impossible de convertir ce fichier Excel.",
      );
    } finally {
      setExcelImporting(false);
    }
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
      zone_id: form.zone_id || null,
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
      custom_tables: form.custom_tables,
      photos: form.photos.map(({ id, file_path, caption }) => ({
        id,
        file_path,
        caption,
      })),
      general_notes: form.general_notes?.trim() || null,
      next_meeting_date: form.next_meeting_date || null,
      source_file_path: form.source_file_path,
      source_original_name: form.source_original_name,
      source_mime_type: form.source_mime_type,
      ocr_confidence: form.ocr_confidence,
      ocr_warnings: form.ocr_warnings,
      status,
    };
    let sourceArchiveError = "";
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
      let saved = result.data as unknown as MeetingMinute;
      if (pendingPvSource) {
        const previousPath = saved.source_file_path;
        const sourcePath = `${projectId}/${saved.id}/${Date.now()}-${safeStorageFileName(pendingPvSource.name)}`;
        const sourceUpload = await supabase.storage
          .from("meeting-pv-sources")
          .upload(sourcePath, pendingPvSource, {
            contentType: pendingPvSource.type,
            upsert: false,
          });
        if (sourceUpload.error) {
          sourceArchiveError = `Le CR est enregistré, mais le PV original n’a pas été archivé : ${sourceUpload.error.message}`;
        } else {
          const sourceUpdate = await supabase
            .from("meeting_minutes")
            .update({ source_file_path: sourcePath })
            .eq("id", saved.id)
            .select("*")
            .single();
          if (!sourceUpdate.error) {
            saved = sourceUpdate.data as unknown as MeetingMinute;
            if (previousPath && previousPath !== sourcePath) {
              await supabase.storage.from("meeting-pv-sources").remove([previousPath]);
            }
            setPendingPvSource(null);
          } else {
            await supabase.storage.from("meeting-pv-sources").remove([sourcePath]);
            sourceArchiveError = `Le CR est enregistré, mais son PV original n’a pas pu être relié : ${sourceUpdate.error.message}`;
          }
        }
      }
      setEditingId(saved.id);
      const uploadedPhotos: MeetingPhoto[] = [];
      const uploadedPaths: string[] = [];
      for (const photo of pendingPhotos) {
        const path = `${projectId}/${saved.id}/${crypto.randomUUID()}-${safeStorageFileName(photo.file.name)}`;
        const upload = await supabase.storage
          .from("meeting-photos")
          .upload(path, photo.file, {
            contentType: photo.file.type,
            upsert: false,
          });
        if (upload.error) {
          if (uploadedPaths.length) {
            await supabase.storage.from("meeting-photos").remove(uploadedPaths);
          }
          setError(`Impossible d’envoyer les photos : ${upload.error.message}`);
          setSaving(false);
          return;
        }
        uploadedPaths.push(path);
        uploadedPhotos.push({
          id: photo.id,
          file_path: path,
          caption: photo.caption.trim(),
        });
      }

      const mergedPhotos = [...form.photos, ...uploadedPhotos];
      if (uploadedPhotos.length) {
        const photoUpdate = await supabase
          .from("meeting_minutes")
          .update({ photos: mergedPhotos })
          .eq("id", saved.id)
          .select("*")
          .single();
        if (photoUpdate.error) {
          await supabase.storage.from("meeting-photos").remove(uploadedPaths);
          setError(photoUpdate.error.message);
          setSaving(false);
          return;
        }
        saved = photoUpdate.data as unknown as MeetingMinute;
      }
      if (removedPhotoPaths.length) {
        await supabase.storage
          .from("meeting-photos")
          .remove(removedPhotoPaths);
      }
      pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPendingPhotos([]);
      setRemovedPhotoPaths([]);
      setEditingId(saved.id);
      setForm((current) => ({
        ...current,
        photos: mergedPhotos,
        source_file_path: saved.source_file_path ?? current.source_file_path,
        source_original_name:
          saved.source_original_name ?? current.source_original_name,
        source_mime_type: saved.source_mime_type ?? current.source_mime_type,
        status,
      }));
      setNotice(
        status === "finalized"
          ? "Compte rendu finalisé et archivé."
          : "Brouillon enregistré dans les archives.",
      );
      await loadMeetings();
      if (sourceArchiveError) setError(sourceArchiveError);
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
      const photoPaths = (meetingToDelete.photos ?? [])
        .map((photo) => photo.file_path)
        .filter(Boolean);
      if (photoPaths.length) {
        await supabase.storage.from("meeting-photos").remove(photoPaths);
      }
      if (meetingToDelete.source_file_path) {
        await supabase.storage
          .from("meeting-pv-sources")
          .remove([meetingToDelete.source_file_path]);
      }
      if (editingId === meetingToDelete.id) startNewMeeting();
      setMeetingToDelete(null);
      await loadMeetings();
    }
    setDeleting(false);
  }

  async function exportPdf() {
    setExporting("pdf");
    setError("");
    setExportError("");
    try {
      await downloadMeetingPdf(
        currentMeeting,
        `${cleanFileName(form.title || "compte-rendu") || "compte-rendu"}.pdf`,
        showOncfLogo,
      );
    } catch (exportError) {
      const message =
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le PDF.";
      setError(message);
      setExportError(message);
    }
    setExporting(null);
  }

  async function exportWord() {
    setExporting("word");
    setError("");
    setExportError("");
    try {
      await downloadMeetingWord(
        currentMeeting,
        `${cleanFileName(form.title || "compte-rendu") || "compte-rendu"}.docx`,
        showOncfLogo,
      );
    } catch (exportError) {
      const message =
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le document Word.";
      setError(message);
      setExportError(message);
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
            onClick={() => setShowOncfLogo((current) => !current)}
            className={`flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-black ${
              showOncfLogo
                ? "border-[var(--opc-blue)] bg-blue-50 text-[var(--opc-blue)]"
                : "border-[var(--opc-border)] bg-white text-slate-600"
            }`}
          >
            {showOncfLogo ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            Logo ONCF
          </button>
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
            <PastedPvImport zones={zones} onApply={applyPastedPv} />
            <HandwrittenPvImport zones={zones} onApply={applyPvAnalysis} />
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
                <Field label="Zone chantier">
                  <select
                    value={form.zone_id ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, zone_id: event.target.value || null })
                    }
                    className="input"
                  >
                    <option value="">Non classée</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.code ? `${zone.code} — ` : ""}{zone.name}
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
                title="Photos et tableaux"
                icon={<Camera className="h-5 w-5" />}
              />

              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[var(--opc-blue)]">
                      Photos de la réunion
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ajoutez jusqu’à 12 photos avec une légende. Elles seront
                      archivées dans le CR et intégrées aux exports.
                    </p>
                  </div>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-xs font-black text-white">
                    <Camera className="h-4 w-4" /> Ajouter des photos
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        addMeetingPhotos(
                          Array.from(event.target.files ?? []),
                        );
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {form.photos.length || pendingPhotos.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {form.photos.map((photo) => (
                      <article
                        key={photo.id}
                        className="overflow-hidden rounded-xl border border-[var(--opc-border)] bg-white"
                      >
                        <div className="relative aspect-video bg-slate-100">
                          {meetingPhotoUrls[photo.file_path] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={meetingPhotoUrls[photo.file_path]}
                              alt={photo.caption || "Photo de réunion"}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-xs font-bold text-slate-400">
                              Photo enregistrée
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSavedPhoto(photo)}
                            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[var(--opc-red)] shadow"
                            title="Retirer la photo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          value={photo.caption}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              photos: current.photos.map((item) =>
                                item.id === photo.id
                                  ? { ...item, caption: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                          placeholder="Légende de la photo..."
                          className="w-full border-t border-[var(--opc-border)] px-3 py-2 text-xs outline-none"
                        />
                      </article>
                    ))}
                    {pendingPhotos.map((photo) => (
                      <article
                        key={photo.id}
                        className="overflow-hidden rounded-xl border border-blue-200 bg-white"
                      >
                        <div className="relative aspect-video bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.previewUrl}
                            alt={photo.caption || photo.file.name}
                            className="h-full w-full object-contain"
                          />
                          <span className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black uppercase text-white">
                            Nouvelle
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingPhoto(photo.id)}
                            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[var(--opc-red)] shadow"
                            title="Retirer la photo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          value={photo.caption}
                          onChange={(event) =>
                            setPendingPhotos((current) =>
                              current.map((item) =>
                                item.id === photo.id
                                  ? { ...item, caption: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Légende de la photo..."
                          className="w-full border-t border-[var(--opc-border)] px-3 py-2 text-xs outline-none"
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <label className="mt-4 grid min-h-28 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-blue-200 bg-white/70 p-4 text-center">
                    <span>
                      <Camera className="mx-auto h-6 w-6 text-[var(--opc-blue)]" />
                      <span className="mt-2 block text-sm font-black">
                        Cliquez pour joindre des photos
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        JPG, PNG ou WebP — 8 Mo maximum par photo
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        addMeetingPhotos(
                          Array.from(event.target.files ?? []),
                        );
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black text-violet-700">
                      <Table2 className="h-4 w-4" /> Tableaux personnalisés
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Créez des tableaux pour les suivis, quantités, réserves
                      ou décisions détaillées.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label
                      className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700 ${
                        excelImporting ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      {excelImporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4" />
                      )}
                      {excelImporting
                        ? "Conversion..."
                        : "Importer un Excel"}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        disabled={excelImporting}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void importExcelTables(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          custom_tables: [
                            ...current.custom_tables,
                            newCustomTable(),
                          ],
                        }))
                      }
                      className="flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white"
                    >
                      <CirclePlus className="h-4 w-4" /> Tableau manuel
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {form.custom_tables.map((table, tableIndex) => (
                    <article
                      key={table.id}
                      className="rounded-xl border border-violet-200 bg-white p-4"
                    >
                      {table.source === "excel" ? (
                        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-emerald-700">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1">
                            Import Excel
                          </span>
                          <span className="truncate text-slate-400">
                            {table.source_file} — feuille {table.source_sheet}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <input
                          value={table.title}
                          onChange={(event) =>
                            updateCustomTable(table.id, {
                              title: event.target.value,
                            })
                          }
                          className="input min-w-0 flex-1 font-black"
                          placeholder={`Titre du tableau ${tableIndex + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              custom_tables: current.custom_tables.filter(
                                (item) => item.id !== table.id,
                              ),
                            }))
                          }
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-200 text-[var(--opc-red)]"
                          title="Supprimer le tableau"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs">
                          <thead>
                            <tr>
                              {table.columns.map((column, columnIndex) => (
                                <th
                                  key={`${table.id}-column-${columnIndex}`}
                                  className="min-w-36 border border-slate-200 bg-slate-100 p-2"
                                >
                                  <div className="flex items-center gap-1">
                                    <input
                                      value={column}
                                      onChange={(event) =>
                                        updateCustomTable(table.id, {
                                          columns: table.columns.map(
                                            (item, index) =>
                                              index === columnIndex
                                                ? event.target.value
                                                : item,
                                          ),
                                        })
                                      }
                                      className="min-w-0 flex-1 bg-transparent font-black outline-none"
                                    />
                                    {table.columns.length > 1 ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeTableColumn(table, columnIndex)
                                        }
                                        className="text-slate-400 hover:text-[var(--opc-red)]"
                                        title="Supprimer la colonne"
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                </th>
                              ))}
                              <th className="w-10 border border-slate-200 bg-slate-50" />
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row, rowIndex) => (
                              <tr key={`${table.id}-row-${rowIndex}`}>
                                {table.columns.map((_, columnIndex) => (
                                  <td
                                    key={`${table.id}-${rowIndex}-${columnIndex}`}
                                    className="border border-slate-200 p-1"
                                  >
                                    <textarea
                                      rows={2}
                                      value={row[columnIndex] ?? ""}
                                      onChange={(event) =>
                                        updateTableCell(
                                          table,
                                          rowIndex,
                                          columnIndex,
                                          event.target.value,
                                        )
                                      }
                                      className="w-full min-w-32 resize-none rounded-md p-2 outline-none focus:bg-blue-50"
                                    />
                                  </td>
                                ))}
                                <td className="border border-slate-200 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCustomTable(table.id, {
                                        rows: table.rows.filter(
                                          (_, index) => index !== rowIndex,
                                        ),
                                      })
                                    }
                                    className="text-slate-400 hover:text-[var(--opc-red)]"
                                    title="Supprimer la ligne"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateCustomTable(table.id, {
                              rows: [
                                ...table.rows,
                                table.columns.map(() => ""),
                              ],
                            })
                          }
                          className="flex h-9 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-black text-violet-700"
                        >
                          <Rows3 className="h-4 w-4" /> Ajouter une ligne
                        </button>
                        <button
                          type="button"
                          onClick={() => addTableColumn(table)}
                          className="flex h-9 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-black text-violet-700"
                        >
                          <Table2 className="h-4 w-4" /> Ajouter une colonne
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
              <SectionHeading
                number="5"
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
                {exporting === "pdf"
                  ? "Préparation du PDF..."
                  : "Télécharger PDF"}
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
            {exportError ? (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {exportError}
              </p>
            ) : null}
            <MeetingPreview
              meeting={currentMeeting}
              showOncfLogo={showOncfLogo}
            />
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
              <select
                value={archiveZone}
                onChange={(event) => setArchiveZone(event.target.value)}
                className="rounded-xl border border-[var(--opc-border)] bg-white px-3 py-2.5 text-sm font-bold"
              >
                <option value="all">Toutes les zones</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
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
                        {meeting.zone_id ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">
                            {zones.find((zone) => zone.id === meeting.zone_id)?.name || "Zone classée"}
                          </span>
                        ) : null}
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
                    {meeting.source_file_path && sourcePvUrls[meeting.source_file_path] ? (
                      <a
                        href={sourcePvUrls[meeting.source_file_path]}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-black text-slate-600 hover:text-[var(--opc-blue)]"
                      >
                        <FileUp className="h-3.5 w-3.5" /> PV original
                      </a>
                    ) : null}
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
  showOncfLogo,
}: {
  meeting: MeetingMinute;
  showOncfLogo: boolean;
}) {
  return (
    <article
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
          {showOncfLogo ? (
            <p className="mb-2 text-2xl font-black tracking-[0.12em] text-white">
              ONCF
            </p>
          ) : null}
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            MARCHÉ N° 625C07
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

        {meeting.custom_tables.length || meeting.photos.length ? (
          <PreviewSection number="4" title="Photos et tableaux complémentaires">
            {meeting.custom_tables.map((table) => (
              <div key={table.id} className="mb-5">
                <h4 className="mb-2 text-sm font-black text-[var(--opc-blue)]">
                  {table.title || "Tableau"}
                </h4>
                <div
                  data-pdf-table-scroll
                  data-pdf-table-columns={table.columns.length}
                  className="overflow-x-auto rounded-xl border border-[var(--opc-border)]"
                >
                  <table
                    data-pdf-wide-table
                    className="min-w-full border-collapse text-left text-xs"
                    style={{
                      width: `${Math.max(100, table.columns.length * 18)}%`,
                    }}
                  >
                    <thead className="bg-slate-100">
                      <tr>
                        {table.columns.map((column, index) => (
                          <th
                            key={`${table.id}-preview-column-${index}`}
                            className="break-words border-r border-[var(--opc-border)] px-2 py-2 font-black last:border-r-0"
                          >
                            {column || `Colonne ${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr
                          key={`${table.id}-preview-row-${rowIndex}`}
                          className="border-t border-[var(--opc-border)]"
                        >
                          {table.columns.map((_, columnIndex) => (
                            <td
                              key={`${table.id}-preview-${rowIndex}-${columnIndex}`}
                              className="break-words whitespace-pre-wrap border-r border-[var(--opc-border)] px-2 py-2 align-top last:border-r-0"
                            >
                              {row[columnIndex] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {meeting.photos.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {meeting.photos.map((photo, index) => (
                  <figure
                    key={photo.id}
                    className="overflow-hidden rounded-xl border border-[var(--opc-border)] bg-slate-50"
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.caption || `Photo ${index + 1}`}
                        className="aspect-[4/3] w-full object-contain"
                      />
                    ) : (
                      <div className="grid aspect-[4/3] place-items-center text-xs font-bold text-slate-400">
                        Photo indisponible
                      </div>
                    )}
                    <figcaption className="border-t border-[var(--opc-border)] bg-white px-3 py-2 text-xs">
                      <strong>Photo {index + 1}</strong>
                      {photo.caption ? ` — ${photo.caption}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
          </PreviewSection>
        ) : null}

        <PreviewSection
          number={
            meeting.custom_tables.length || meeting.photos.length ? "5" : "4"
          }
          title="Observations générales"
        >
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {meeting.general_notes || "Rien à signaler."}
          </p>
          {meeting.next_meeting_date ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-[var(--opc-red)]">
              Prochaine réunion : {meeting.next_meeting_date}
            </p>
          ) : null}
        </PreviewSection>

        <PreviewSection
          number={
            meeting.custom_tables.length || meeting.photos.length ? "6" : "5"
          }
          title="Validation"
        >
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
