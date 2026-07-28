"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CirclePlus,
  ClipboardCheck,
  Construction,
  Gauge,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { createClient } from "@/lib/supabase/client";

type AssetType = "tool" | "machine";
type AssetCondition = "serviceable" | "maintenance" | "out_of_service";
type AssetFilter = "all" | AssetType;

type Tool = {
  id: string;
  code: string;
  name: string;
  asset_type: AssetType;
  category: string | null;
  serial_number: string | null;
  location: string | null;
  responsible: string | null;
  condition: AssetCondition;
  calibration_required: boolean;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  certificate_reference: string | null;
  technical_sheet_reference: string | null;
  technical_sheet_valid_until: string | null;
  inspection_date: string | null;
  inspection_valid_until: string | null;
  operator_authorization_required: boolean;
};

type NCR = {
  id: string;
  status: string;
};

type AssetForm = {
  code: string;
  name: string;
  asset_type: AssetType;
  category: string;
  serial_number: string;
  location: string;
  responsible: string;
  condition: AssetCondition;
  calibration_required: boolean;
  last_calibration_date: string;
  next_calibration_date: string;
  certificate_reference: string;
  technical_sheet_reference: string;
  technical_sheet_valid_until: string;
  inspection_date: string;
  inspection_valid_until: string;
  operator_authorization_required: boolean;
};

const EMPTY_FORM: AssetForm = {
  code: "",
  name: "",
  asset_type: "tool",
  category: "",
  serial_number: "",
  location: "",
  responsible: "",
  condition: "serviceable",
  calibration_required: false,
  last_calibration_date: "",
  next_calibration_date: "",
  certificate_reference: "",
  technical_sheet_reference: "",
  technical_sheet_valid_until: "",
  inspection_date: "",
  inspection_valid_until: "",
  operator_authorization_required: false,
};

const TODAY = new Date().toISOString().slice(0, 10);
const SOON = new Date(new Date().getTime() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

export function QualityWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [tools, setTools] = useState<Tool[]>([]);
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<Tool | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
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
    const [assetResult, ncrResult] = await Promise.all([
      supabase
        .from("quality_tools")
        .select("*")
        .eq("project_id", project.data.id)
        .order("code"),
      supabase
        .from("quality_ncr")
        .select("id,status")
        .eq("project_id", project.data.id),
    ]);
    if (assetResult.error) {
      setError(
        `Registre indisponible. Vérifiez la migration 007_operational_prerequisites.sql : ${assetResult.error.message}`,
      );
    } else {
      setTools((assetResult.data ?? []) as Tool[]);
    }
    if (!ncrResult.error) setNcrs((ncrResult.data ?? []) as NCR[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial quality register synchronization
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toolCount = tools.filter((item) => item.asset_type === "tool").length;
  const machineCount = tools.filter(
    (item) => item.asset_type === "machine",
  ).length;
  const invalidCount = tools.filter((item) => !isAssetCompliant(item)).length;
  const expiringCount = tools.filter(
    (item) =>
      (item.next_calibration_date &&
        item.next_calibration_date >= TODAY &&
        item.next_calibration_date <= SOON) ||
      (item.inspection_valid_until &&
        item.inspection_valid_until >= TODAY &&
        item.inspection_valid_until <= SOON),
  ).length;
  const visible = tools.filter((item) => {
    const matchesFilter = filter === "all" || item.asset_type === filter;
    const haystack =
      `${item.code} ${item.name} ${item.category ?? ""} ${item.serial_number ?? ""}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  });

  function openCreate(assetType: AssetType) {
    setForm({ ...EMPTY_FORM, asset_type: assetType });
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    const result = await supabase.from("quality_tools").insert({
      ...form,
      project_id: projectId,
      category: form.category || null,
      serial_number: form.serial_number || null,
      location: form.location || null,
      responsible: form.responsible || null,
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
      certificate_reference: form.certificate_reference || null,
      technical_sheet_reference: form.technical_sheet_reference || null,
      technical_sheet_valid_until:
        form.technical_sheet_valid_until || null,
      inspection_date: form.inspection_date || null,
      inspection_valid_until: form.inspection_valid_until || null,
    });
    if (result.error) setError(result.error.message);
    else {
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
    }
    setSaving(false);
  }

  async function remove() {
    if (!toolToDelete) return;
    setDeleting(true);
    const result = await supabase
      .from("quality_tools")
      .delete()
      .eq("id", toolToDelete.id);
    if (result.error) setError(result.error.message);
    else {
      setToolToDelete(null);
      await load();
    }
    setDeleting(false);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-[var(--opc-red)]">
            Référentiel opérationnel
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Outillages, engins & conformité
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Les validités de ce registre alimentent automatiquement les
            prérequis des tâches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openCreate("tool")}
            className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white"
          >
            <Wrench className="h-4 w-4" /> Ajouter un outillage
          </button>
          <button
            type="button"
            onClick={() => openCreate("machine")}
            className="flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white"
          >
            <Construction className="h-4 w-4" /> Ajouter un engin
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Wrench} label="Outillages" value={toolCount} />
        <Metric icon={Construction} label="Engins" value={machineCount} />
        <Metric
          icon={AlertTriangle}
          label="Non conformes"
          value={invalidCount}
          danger
        />
        <Metric
          icon={Gauge}
          label="Échéance sous 30 j"
          value={expiringCount}
        />
        <Metric
          icon={ShieldCheck}
          label="NCR ouvertes"
          value={ncrs.filter((item) => item.status !== "closed").length}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-black">Registre de conformité</h2>
            <p className="text-xs text-slate-500">
              Étalonnage, fiche technique, inspection et habilitation opérateur.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "Tous"],
              ["tool", "Outillages"],
              ["machine", "Engins"],
            ] as Array<[AssetFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-xl px-4 py-2 text-xs font-black ${
                  filter === value
                    ? "bg-[var(--opc-blue)] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
            <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher..."
                className="bg-transparent text-sm outline-none"
              />
            </label>
          </div>
        </header>

        {error ? (
          <div className="m-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-4">Code / type</th>
                  <th>Désignation</th>
                  <th>N° série / localisation</th>
                  <th>État</th>
                  <th>Étalonnage</th>
                  <th>Fiche technique</th>
                  <th>Inspection</th>
                  <th>Habilitation opérateur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const compliant = isAssetCompliant(item);
                  return (
                    <tr key={item.id} className="border-t align-top">
                      <td className="p-4">
                        <p className="font-black text-[var(--opc-blue)]">
                          {item.code}
                        </p>
                        <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                          {item.asset_type === "machine"
                            ? "Engin"
                            : "Outillage"}
                        </span>
                      </td>
                      <td>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          {item.category || "—"} · {item.responsible || "RAS"}
                        </p>
                      </td>
                      <td>
                        <p>{item.serial_number || "—"}</p>
                        <p className="text-xs text-slate-400">
                          {item.location || "—"}
                        </p>
                      </td>
                      <td>
                        <StatusBadge
                          valid={compliant}
                          text={conditionLabel(item.condition)}
                        />
                      </td>
                      <td>
                        {item.calibration_required ? (
                          <Validity
                            date={item.next_calibration_date}
                            missing="Date manquante"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">RAS</span>
                        )}
                      </td>
                      <td>
                        {item.asset_type === "machine" ? (
                          <>
                            <p className="font-bold">
                              {item.technical_sheet_reference || "Manquante"}
                            </p>
                            <Validity
                              date={item.technical_sheet_valid_until}
                              missing="Sans échéance"
                              optional
                            />
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.asset_type === "machine" ? (
                          <Validity
                            date={item.inspection_valid_until}
                            missing="RAS"
                            optional
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.operator_authorization_required
                          ? "Requise"
                          : "RAS"}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setToolToDelete(item)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                          aria-label={`Supprimer ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!visible.length ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-14 text-center text-slate-400"
                    >
                      Aucun élément dans cette section.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex gap-3">
          <ClipboardCheck className="mt-0.5 h-5 w-5 text-[var(--opc-blue)]" />
          <div>
            <h2 className="font-black">Lien avec les prérequis</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dès qu’un outillage ou un engin est associé à une tâche, son état,
              son étalonnage, sa fiche technique et son inspection sont contrôlés
              automatiquement. Une validité expirée rend la tâche non conforme.
            </p>
          </div>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-6">
              <div>
                <p className="text-xs font-black uppercase text-[var(--opc-red)]">
                  Référentiel Quality
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Nouvel {form.asset_type === "machine" ? "engin" : "outillage"}
                </h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X />
              </button>
            </header>
            <form
              onSubmit={save}
              className="grid gap-4 p-6 sm:grid-cols-2"
            >
              <Field label="Type">
                <select
                  value={form.asset_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      asset_type: event.target.value as AssetType,
                    })
                  }
                  className="input"
                >
                  <option value="tool">Outillage</option>
                  <option value="machine">Engin</option>
                </select>
              </Field>
              <Field label="Code">
                <input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Désignation">
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Catégorie">
                <input
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="N° série">
                <input
                  value={form.serial_number}
                  onChange={(event) =>
                    setForm({ ...form, serial_number: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Localisation">
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="Responsable">
                <input
                  value={form.responsible}
                  onChange={(event) =>
                    setForm({ ...form, responsible: event.target.value })
                  }
                  className="input"
                />
              </Field>
              <Field label="État">
                <select
                  value={form.condition}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      condition: event.target.value as AssetCondition,
                    })
                  }
                  className="input"
                >
                  <option value="serviceable">Conforme</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="out_of_service">Hors service</option>
                </select>
              </Field>

              <CheckField
                label="Étalonnage requis"
                checked={form.calibration_required}
                onChange={(checked) =>
                  setForm({ ...form, calibration_required: checked })
                }
              />
              <CheckField
                label="Habilitation opérateur requise"
                checked={form.operator_authorization_required}
                onChange={(checked) =>
                  setForm({
                    ...form,
                    operator_authorization_required: checked,
                  })
                }
              />
              {form.calibration_required ? (
                <>
                  <Field label="Dernier étalonnage">
                    <input
                      type="date"
                      value={form.last_calibration_date}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          last_calibration_date: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Prochain étalonnage">
                    <input
                      type="date"
                      value={form.next_calibration_date}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          next_calibration_date: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Référence certificat">
                    <input
                      value={form.certificate_reference}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          certificate_reference: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                </>
              ) : null}

              {form.asset_type === "machine" ? (
                <>
                  <Field label="Référence fiche technique">
                    <input
                      value={form.technical_sheet_reference}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          technical_sheet_reference: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Validité fiche technique">
                    <input
                      type="date"
                      value={form.technical_sheet_valid_until}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          technical_sheet_valid_until: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Date de l’inspection">
                    <input
                      type="date"
                      value={form.inspection_date}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          inspection_date: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Validité de l’inspection">
                    <input
                      type="date"
                      value={form.inspection_valid_until}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          inspection_valid_until: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </Field>
                </>
              ) : null}

              <div className="flex justify-end gap-3 pt-4 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border px-5 py-3 font-bold"
                >
                  Annuler
                </button>
                <button
                  disabled={saving}
                  className="rounded-xl bg-[var(--opc-blue)] px-5 py-3 font-black text-white"
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(toolToDelete)}
        title="Supprimer cette ressource ?"
        description="Elle sera retirée du registre et des tâches associées."
        subject={
          toolToDelete
            ? `${toolToDelete.code} — ${toolToDelete.name}`
            : undefined
        }
        deleting={deleting}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setToolToDelete(null);
        }}
        onConfirm={remove}
      />
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid var(--opc-border);
          border-radius: 0.75rem;
          padding: 0.75rem;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function isAssetCompliant(item: Tool) {
  if (item.condition !== "serviceable") return false;
  if (
    item.calibration_required &&
    (!item.next_calibration_date || item.next_calibration_date < TODAY)
  ) {
    return false;
  }
  if (item.asset_type === "machine") {
    if (!item.technical_sheet_reference) return false;
    if (
      item.technical_sheet_valid_until &&
      item.technical_sheet_valid_until < TODAY
    ) {
      return false;
    }
    if (item.inspection_valid_until && item.inspection_valid_until < TODAY) {
      return false;
    }
  }
  return true;
}

function conditionLabel(condition: AssetCondition) {
  if (condition === "serviceable") return "Conforme";
  if (condition === "maintenance") return "Maintenance";
  return "Hors service";
}

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: typeof Wrench;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <Icon
          className={`h-5 w-5 ${
            danger ? "text-red-500" : "text-[var(--opc-blue)]"
          }`}
        />
        <span className="text-3xl font-black">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-500">{label}</p>
    </article>
  );
}

function StatusBadge({ valid, text }: { valid: boolean; text: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black ${
        valid
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {text}
    </span>
  );
}

function Validity({
  date,
  missing,
  optional = false,
}: {
  date: string | null;
  missing: string;
  optional?: boolean;
}) {
  if (!date) {
    return (
      <span
        className={`text-xs ${
          optional ? "text-slate-500" : "font-black text-red-600"
        }`}
      >
        {missing}
      </span>
    );
  }
  const expired = date < TODAY;
  return (
    <span
      className={`text-xs font-black ${
        expired ? "text-red-600" : "text-emerald-700"
      }`}
    >
      {expired ? `Expiré le ${date}` : `Valide jusqu’au ${date}`}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="text-sm font-black">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[var(--opc-blue)]"
      />
      {label}
    </label>
  );
}
