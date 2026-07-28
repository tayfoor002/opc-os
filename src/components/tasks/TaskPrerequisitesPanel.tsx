"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  FileCheck2,
  HardHat,
  Loader2,
  PackageCheck,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string; code?: string };
type Person = Option & { company: string; role: string };
type Tool = Option & {
  asset_type: "tool" | "machine";
  condition: string;
  calibration_required: boolean;
  next_calibration_date: string | null;
  technical_sheet_reference: string | null;
  technical_sheet_valid_until: string | null;
  inspection_valid_until: string | null;
};
type Equipment = Option & {
  equipment_type: "material" | "equipment";
  status: string;
};
type Link = {
  id: string;
  label: string;
  meta?: string;
  satisfied?: boolean;
  canValidate?: boolean;
};
type Status = {
  total_requirements: number;
  missing_certifications: number;
  missing_documents: number;
  invalid_tools: number;
  invalid_equipment: number;
  missing_manual_items: number;
};
type PendingDelete = {
  table: string;
  column: string;
  value: string;
  subject: string;
};

const today = new Date().toISOString().slice(0, 10);

export function TaskPrerequisitesPanel({
  taskId,
  projectId,
  alstomSupervisorId,
  avanzitSiteManagerId,
  onStatusChange,
}: {
  taskId: string;
  projectId: string;
  alstomSupervisorId: string;
  avanzitSiteManagerId: string;
  onStatusChange?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tools, setTools] = useState<Tool[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [documents, setDocuments] = useState<Option[]>([]);
  const [certificationSuggestions, setCertificationSuggestions] = useState<
    string[]
  >([]);
  const [personnelLinks, setPersonnelLinks] = useState<Link[]>([]);
  const [certificationLinks, setCertificationLinks] = useState<Link[]>([]);
  const [toolLinks, setToolLinks] = useState<Link[]>([]);
  const [equipmentLinks, setEquipmentLinks] = useState<Link[]>([]);
  const [documentLinks, setDocumentLinks] = useState<Link[]>([]);
  const [manualLinks, setManualLinks] = useState<Link[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [certificationPersonId, setCertificationPersonId] = useState("");
  const [certificationName, setCertificationName] = useState("");
  const [toolId, setToolId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [documentLabel, setDocumentLabel] = useState("");
  const [documentType, setDocumentType] = useState("plan");
  const [manualLabel, setManualLabel] = useState("");
  const [manualCategory, setManualCategory] = useState("safety");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    const [
      peopleResult,
      toolsResult,
      equipmentResult,
      documentsResult,
      certificationCatalogResult,
      certificationsResult,
      taskToolsResult,
      taskEquipmentResult,
      requirementsResult,
      manualResult,
      statusResult,
    ] = await Promise.all([
      supabase
        .from("collaborators")
        .select("id,full_name,company,role")
        .eq("project_id", projectId)
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("quality_tools")
        .select(
          "id,code,name,asset_type,condition,calibration_required,next_calibration_date,technical_sheet_reference,technical_sheet_valid_until,inspection_valid_until",
        )
        .eq("project_id", projectId)
        .order("name"),
      supabase
        .from("project_equipment")
        .select("id,code,name,equipment_type,status")
        .eq("project_id", projectId)
        .order("name"),
      supabase
        .from("documents")
        .select("id,title")
        .eq("project_id", projectId)
        .order("title"),
      supabase
        .from("collaborator_certifications")
        .select("certification_name,collaborator_id,valid_until")
        .eq("project_id", projectId)
        .order("certification_name"),
      supabase
        .from("task_required_certifications")
        .select(
          "id,certification_name,notes,collaborator_id,validated,collaborators(full_name,company)",
        )
        .eq("task_id", taskId),
      supabase
        .from("task_tools")
        .select(
          "tool_id,validated,quality_tools(name,asset_type,condition,calibration_required,next_calibration_date)",
        )
        .eq("task_id", taskId),
      supabase
        .from("task_equipment")
        .select(
          "equipment_id,usage_status,quantity,validated,project_equipment(name,equipment_type,status)",
        )
        .eq("task_id", taskId),
      supabase
        .from("task_document_requirements")
        .select("id,label,requirement_type,document_id,validated")
        .eq("task_id", taskId),
      supabase
        .from("task_prerequisite_items")
        .select("id,label,category,satisfied")
        .eq("task_id", taskId),
      supabase
        .from("task_prerequisite_status")
        .select(
          "total_requirements,missing_certifications,missing_documents,invalid_tools,invalid_equipment,missing_manual_items",
        )
        .eq("task_id", taskId)
        .maybeSingle(),
    ]);

    const firstError = [
      peopleResult.error,
      toolsResult.error,
      equipmentResult.error,
      documentsResult.error,
      certificationCatalogResult.error,
      certificationsResult.error,
      taskToolsResult.error,
      taskEquipmentResult.error,
      requirementsResult.error,
      manualResult.error,
      statusResult.error,
    ].find(Boolean);
    if (firstError) {
      setError(
        `Prérequis indisponibles. Exécutez la migration 007_operational_prerequisites.sql : ${firstError?.message}`,
      );
      setLoading(false);
      return;
    }

    const loadedPeople = (peopleResult.data ?? []).map((person) => ({
        id: person.id,
        name: person.full_name,
        company: person.company,
        role: person.role,
      }));
    setTools((toolsResult.data ?? []) as Tool[]);
    setEquipment((equipmentResult.data ?? []) as Equipment[]);
    setDocuments(
      (documentsResult.data ?? []).map((document) => ({
        id: document.id,
        name: document.title,
      })),
    );
    setCertificationSuggestions([
      ...new Set(
        (certificationCatalogResult.data ?? []).map(
          (item) => item.certification_name,
        ),
      ),
    ]);
    const automaticPersonnel = [
      alstomSupervisorId,
      avanzitSiteManagerId,
    ]
      .filter(Boolean)
      .map((personId) => loadedPeople.find((person) => person.id === personId))
      .filter((person): person is Person => Boolean(person))
      .map((person) => ({
        id: person.id,
        label: person.name,
        meta: `${person.company} - ${person.role} · Affecté dans la tâche`,
      }));
    setPersonnelLinks(automaticPersonnel);
    setCertificationLinks(
      (certificationsResult.data ?? []).map((item) => {
        const person = Array.isArray(item.collaborators)
          ? item.collaborators[0]
          : item.collaborators;
        const qualificationIsValid = (
          certificationCatalogResult.data ?? []
        ).some(
          (certification) =>
            certification.collaborator_id === item.collaborator_id &&
            certification.certification_name.toLowerCase() ===
              item.certification_name.toLowerCase() &&
            (!certification.valid_until ||
              certification.valid_until >= today),
        );
        return {
          id: item.id,
          label: item.certification_name,
          meta: `${person?.full_name ?? "Personnel non défini"} · ${
            person?.company ?? ""
          }${item.notes ? ` · ${item.notes}` : ""}`,
          satisfied: item.validated,
          canValidate: Boolean(item.collaborator_id) && qualificationIsValid,
        };
      }),
    );
    setToolLinks(
      (taskToolsResult.data ?? []).map((link) => {
        const tool = Array.isArray(link.quality_tools)
          ? link.quality_tools[0]
          : link.quality_tools;
        const calibrated =
          !tool?.calibration_required ||
          Boolean(
            tool.next_calibration_date && tool.next_calibration_date >= today,
          );
        return {
          id: link.tool_id,
          label: tool?.name ?? "Outillage",
          meta: `${tool?.asset_type === "machine" ? "Engin" : "Outillage"} - ${
            tool?.condition === "serviceable" && calibrated
              ? "Conforme"
              : "Non conforme"
          }`,
          satisfied: link.validated,
          canValidate:
            tool?.condition === "serviceable" && calibrated,
        };
      }),
    );
    setEquipmentLinks(
      (taskEquipmentResult.data ?? []).map((link) => {
        const item = Array.isArray(link.project_equipment)
          ? link.project_equipment[0]
          : link.project_equipment;
        return {
          id: link.equipment_id,
          label: item?.name ?? "Équipement",
          meta: `${item?.equipment_type ?? "material"} - ${link.usage_status} - Qté ${link.quantity}`,
          satisfied: link.validated,
          canValidate: item?.status !== "out_of_service",
        };
      }),
    );
    setDocumentLinks(
      (requirementsResult.data ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        meta: `${item.requirement_type} - ${
          item.document_id ? "Disponible" : "Manquant"
        }`,
        satisfied: item.validated,
        canValidate: Boolean(item.document_id),
      })),
    );
    setManualLinks(
      (manualResult.data ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        meta: item.category,
        satisfied: item.satisfied,
      })),
    );
    setStatus(statusResult.data as Status | null);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- task prerequisites synchronization
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    taskId,
    projectId,
    alstomSupervisorId,
    avanzitSiteManagerId,
  ]);

  async function insert(table: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    const result = await supabase.from(table).insert(payload);
    if (result.error) setError(result.error.message);
    else {
      await load();
      onStatusChange?.();
    }
    setSaving(false);
  }

  async function toggleValidation(
    table: string,
    column: string,
    value: string,
    validated: boolean,
  ) {
    setSaving(true);
    setError("");
    const result = await supabase
      .from(table)
      .update({ validated })
      .eq(column, value)
      .eq("task_id", taskId);
    if (result.error) setError(result.error.message);
    else {
      await load();
      onStatusChange?.();
    }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setSaving(true);
    const result = await supabase
      .from(pendingDelete.table)
      .delete()
      .eq(pendingDelete.column, pendingDelete.value)
      .eq("task_id", taskId);
    if (result.error) setError(result.error.message);
    else {
      setPendingDelete(null);
      await load();
      onStatusChange?.();
    }
    setSaving(false);
  }

  const missing =
    (status?.missing_certifications ?? 0) +
    (status?.missing_documents ?? 0) +
    (status?.invalid_tools ?? 0) +
    (status?.invalid_equipment ?? 0) +
    (status?.missing_manual_items ?? 0);
  const configured = Boolean(status?.total_requirements);
  const compliant = configured && missing === 0;

  if (loading) {
    return (
      <div className="grid min-h-44 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--opc-blue)]" />
      </div>
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-[var(--opc-border)] bg-slate-50 p-4">
      <div
        className={`rounded-2xl border p-4 ${
          compliant
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {compliant ? (
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-red-700" />
            )}
            <div>
              <h3 className="font-black">
                {compliant
                  ? "Prérequis conformes - tâche autorisée"
                  : configured
                    ? "Prérequis non conformes"
                    : "Prérequis à configurer"}
              </h3>
              <p className="text-xs text-slate-600">
                {status?.total_requirements ?? 0} contrôle(s), {missing} anomalie(s)
              </p>
            </div>
          </div>
          {!compliant ? (
            <div className="flex flex-wrap gap-2 text-xs font-bold text-red-700">
              {status?.missing_certifications ? (
                <span>{status.missing_certifications} habilitation(s)</span>
              ) : null}
              {status?.missing_documents ? (
                <span>{status.missing_documents} document(s)</span>
              ) : null}
              {status?.invalid_tools ? (
                <span>{status.invalid_tools} outil(s)/engin(s)</span>
              ) : null}
              {status?.invalid_equipment ? (
                <span>{status.invalid_equipment} équipement(s)</span>
              ) : null}
              {status?.missing_manual_items ? (
                <span>{status.missing_manual_items} autre(s)</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-700">
        <p className="font-black text-[var(--opc-blue)]">
          Comment la checklist devient conforme ?
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">
          <li>
            Affectez le personnel puis choisissez une habilitation existante
            dans sa fiche Organization.
          </li>
          <li>
            Liez les plans/procédures et choisissez les outillages ou engins :
            leurs dates sont contrôlées automatiquement.
          </li>
          <li>
            Pour les contrôles manuels, cochez la case une fois le contrôle
            réellement réalisé.
          </li>
        </ol>
        <p className="mt-2 font-bold">
          Le bandeau passe au vert uniquement lorsque toutes les exigences sont
          satisfaites.
        </p>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl bg-red-100 p-3 text-xs font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-4">
          <h4 className="flex items-center gap-2 font-black">
            <HardHat className="h-4 w-4 text-[var(--opc-blue)]" />
            Personnel affecté automatiquement
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Cette liste reprend les responsables Alstom et Avanzit choisis plus
            haut dans la tâche.
          </p>
          <LinkList links={personnelLinks} />
        </div>

        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-4">
          <h4 className="flex items-center gap-2 font-black">
            <BadgeCheck className="h-4 w-4 text-[var(--opc-blue)]" />
            Habilitations requises par personne
          </h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              value={certificationPersonId}
              onChange={(event) =>
                setCertificationPersonId(event.target.value)
              }
              className="input"
            >
              <option value="">Choisir Alstom ou Avanzit...</option>
              {personnelLinks.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label} — {person.meta}
                </option>
              ))}
            </select>
            <input
              value={certificationName}
              onChange={(event) => setCertificationName(event.target.value)}
              placeholder="Ex. Habilitation électrique B1"
              list={
                certificationSuggestions.length
                  ? "certification-suggestions"
                  : undefined
              }
              className="input"
            />
            {certificationSuggestions.length ? (
              <datalist id="certification-suggestions">
                {certificationSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            ) : null}
            <button
              type="button"
              disabled={
                saving ||
                !certificationPersonId ||
                !certificationName.trim()
              }
              onClick={() => {
                void insert("task_required_certifications", {
                  task_id: taskId,
                  collaborator_id: certificationPersonId,
                  certification_name: certificationName.trim(),
                });
                setCertificationName("");
              }}
              className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--opc-blue)] text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <LinkList
            links={certificationLinks}
            onToggle={(link, checked) =>
              void toggleValidation(
                "task_required_certifications",
                "id",
                link.id,
                checked,
              )
            }
            onDelete={(link) =>
              setPendingDelete({
                table: "task_required_certifications",
                column: "id",
                value: link.id,
                subject: link.label,
              })
            }
          />
        </div>

        <PrerequisiteBlock
          icon={Wrench}
          title="Outillages et engins"
          links={toolLinks}
          options={tools
            .filter((tool) => !toolLinks.some((link) => link.id === tool.id))
            .map((tool) => ({
              id: tool.id,
              name: `${tool.name} - ${
                tool.asset_type === "machine" ? "Engin" : "Outillage"
              }`,
            }))}
          value={toolId}
          onValueChange={setToolId}
          onAdd={() => {
            if (!toolId) return;
            void insert("task_tools", { task_id: taskId, tool_id: toolId });
            setToolId("");
          }}
          onDelete={(link) =>
            setPendingDelete({
              table: "task_tools",
              column: "tool_id",
              value: link.id,
              subject: link.label,
            })
          }
          onToggle={(link, checked) =>
            void toggleValidation(
              "task_tools",
              "tool_id",
              link.id,
              checked,
            )
          }
        />

        <PrerequisiteBlock
          icon={PackageCheck}
          title="Équipements / matériaux"
          links={equipmentLinks}
          options={equipment
            .filter(
              (item) => !equipmentLinks.some((link) => link.id === item.id),
            )
            .map((item) => ({
              id: item.id,
              name: `${item.name} - ${item.status}`,
            }))}
          value={equipmentId}
          onValueChange={setEquipmentId}
          onAdd={() => {
            if (!equipmentId) return;
            void insert("task_equipment", {
              task_id: taskId,
              equipment_id: equipmentId,
            });
            setEquipmentId("");
          }}
          onDelete={(link) =>
            setPendingDelete({
              table: "task_equipment",
              column: "equipment_id",
              value: link.id,
              subject: link.label,
            })
          }
          onToggle={(link, checked) =>
            void toggleValidation(
              "task_equipment",
              "equipment_id",
              link.id,
              checked,
            )
          }
        />

        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-4">
          <h4 className="flex items-center gap-2 font-black">
            <FileCheck2 className="h-4 w-4 text-[var(--opc-blue)]" />
            Plans, procédures et documents
          </h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr]">
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              className="input"
            >
              <option value="plan">Plan</option>
              <option value="procedure">Procédure</option>
              <option value="method">Mode opératoire</option>
              <option value="permit">Autorisation</option>
              <option value="other">Autre</option>
            </select>
            <input
              value={documentLabel}
              onChange={(event) => setDocumentLabel(event.target.value)}
              placeholder="Document requis (ex. Plan d’exécution validé)"
              className="input"
            />
            <select
              value={documentId}
              onChange={(event) => {
                const nextId = event.target.value;
                setDocumentId(nextId);
                const selected = documents.find((item) => item.id === nextId);
                if (selected && !documentLabel.trim()) {
                  setDocumentLabel(selected.name);
                }
              }}
              className="input"
            >
              <option value="">Aucun fichier lié pour le moment</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saving || (!documentLabel.trim() && !documentId)}
              onClick={() => {
                const document = documents.find((item) => item.id === documentId);
                const label = documentLabel.trim() || document?.name;
                if (!label) return;
                void insert("task_document_requirements", {
                  task_id: taskId,
                  document_id: documentId || null,
                  requirement_type: documentType,
                  label,
                });
                setDocumentId("");
                setDocumentLabel("");
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-sm font-black text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Ajouter le prérequis
            </button>
          </div>
          <LinkList
            links={documentLinks}
            onToggle={(link, checked) =>
              void toggleValidation(
                "task_document_requirements",
                "id",
                link.id,
                checked,
              )
            }
            onDelete={(link) =>
              setPendingDelete({
                table: "task_document_requirements",
                column: "id",
                value: link.id,
                subject: link.label,
              })
            }
          />
        </div>

        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-4">
          <h4 className="flex items-center gap-2 font-black">
            <ShieldCheck className="h-4 w-4 text-[var(--opc-blue)]" />
            Autres contrôles normatifs
          </h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_auto]">
            <select
              value={manualCategory}
              onChange={(event) => setManualCategory(event.target.value)}
              className="input"
            >
              <option value="safety">Sécurité</option>
              <option value="personnel">Personnel</option>
              <option value="document">Document</option>
              <option value="material">Matériel</option>
              <option value="other">Autre</option>
            </select>
            <input
              value={manualLabel}
              onChange={(event) => setManualLabel(event.target.value)}
              placeholder="Ex. Balisage de la zone réalisé"
              className="input"
            />
            <button
              type="button"
              disabled={saving || !manualLabel.trim()}
              onClick={() => {
                void insert("task_prerequisite_items", {
                  task_id: taskId,
                  category: manualCategory,
                  label: manualLabel.trim(),
                });
                setManualLabel("");
              }}
              className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--opc-blue)] text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {manualLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(link.satisfied)}
                  onChange={async (event) => {
                    await supabase
                      .from("task_prerequisite_items")
                      .update({ satisfied: event.target.checked })
                      .eq("id", link.id);
                    await load();
                    onStatusChange?.();
                  }}
                  className="h-5 w-5 accent-emerald-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{link.label}</p>
                  <p className="text-xs text-slate-500">
                    {link.meta} ·{" "}
                    {link.satisfied ? "Validé" : "À valider manuellement"}
                  </p>
                </div>
                <DeleteButton
                  onClick={() =>
                    setPendingDelete({
                      table: "task_prerequisite_items",
                      column: "id",
                      value: link.id,
                      subject: link.label,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={Boolean(pendingDelete)}
        title="Retirer ce prérequis ?"
        description="Le calcul de conformité de la tâche sera immédiatement mis à jour."
        subject={pendingDelete?.subject}
        deleting={saving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />
      <style jsx>{`.input{width:100%;border:1px solid var(--opc-border);border-radius:.75rem;background:white;padding:.65rem .75rem;font-size:.8rem;outline:none}`}</style>
    </section>
  );
}

function PrerequisiteBlock({
  icon: Icon,
  title,
  links,
  options,
  value,
  onValueChange,
  onAdd,
  onDelete,
  onToggle,
}: {
  icon: typeof Wrench;
  title: string;
  links: Link[];
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (link: Link) => void;
  onToggle?: (link: Link, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-4">
      <h4 className="flex items-center gap-2 font-black">
        <Icon className="h-4 w-4 text-[var(--opc-blue)]" /> {title}
      </h4>
      <div className="mt-3 flex gap-2">
        <select
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm"
        >
          <option value="">Sélectionner...</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAdd}
          disabled={!value}
          className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--opc-blue)] text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <LinkList links={links} onDelete={onDelete} onToggle={onToggle} />
    </div>
  );
}

function LinkList({
  links,
  onDelete,
  onToggle,
}: {
  links: Link[];
  onDelete?: (link: Link) => void;
  onToggle?: (link: Link, checked: boolean) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {links.map((link) => (
        <div
          key={link.id}
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm"
        >
          {onToggle ? (
            <input
              type="checkbox"
              checked={Boolean(link.satisfied)}
              disabled={!link.canValidate}
              onChange={(event) => onToggle(link, event.target.checked)}
              className="h-5 w-5 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Valider ${link.label}`}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-bold">{link.label}</p>
            {link.meta ? (
              <p className="text-xs text-slate-500">{link.meta}</p>
            ) : null}
            {onToggle ? (
              <p
                className={`mt-1 text-[10px] font-black ${
                  link.satisfied ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {link.satisfied
                  ? "Validation confirmée"
                  : link.canValidate
                    ? "À cocher après contrôle"
                    : "Validation impossible : corrigez l’élément"}
              </p>
            ) : null}
          </div>
          {onDelete ? (
            <DeleteButton onClick={() => onDelete(link)} />
          ) : null}
        </div>
      ))}
      {!links.length ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
          Aucun élément configuré.
        </p>
      ) : null}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
