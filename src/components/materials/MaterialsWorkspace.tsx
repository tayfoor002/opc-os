"use client";

import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Loader2, Trash2, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { createClient } from "@/lib/supabase/client";

type Equipment = {
  id: string;
  code: string;
  name: string;
  equipment_type: "material" | "equipment";
  manufacturer: string | null;
  serial_number: string | null;
  quantity: number;
  unit: string;
  status: "available" | "reserved" | "installed" | "out_of_service";
  location: string | null;
  technical_reference: string | null;
};
type EquipmentForm = {
  code: string;
  name: string;
  equipment_type: Equipment["equipment_type"];
  manufacturer: string;
  serial_number: string;
  quantity: number;
  unit: string;
  status: Equipment["status"];
  location: string;
  technical_reference: string;
};

const empty: EquipmentForm = {
  code: "",
  name: "",
  equipment_type: "material",
  manufacturer: "",
  serial_number: "",
  quantity: 1,
  unit: "u",
  status: "available",
  location: "",
  technical_reference: "",
};

export function MaterialsWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<Equipment[]>([]);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<Equipment | null>(null);

  async function load() {
    setLoading(true);
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
    const result = await supabase
      .from("project_equipment")
      .select(
        "id,code,name,equipment_type,manufacturer,serial_number,quantity,unit,status,location,technical_reference",
      )
      .eq("project_id", project.data.id)
      .order("code");
    if (result.error) {
      setError(
        `Inventaire indisponible. Exécutez la migration 007_operational_prerequisites.sql : ${result.error.message}`,
      );
    } else {
      setItems((result.data ?? []) as Equipment[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial inventory synchronization
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    const result = await supabase.from("project_equipment").insert({
      ...form,
      project_id: projectId,
      manufacturer: form.manufacturer || null,
      serial_number: form.serial_number || null,
      location: form.location || null,
      technical_reference: form.technical_reference || null,
    });
    if (result.error) setError(result.error.message);
    else {
      setOpen(false);
      setForm(empty);
      await load();
    }
    setSaving(false);
  }

  async function remove() {
    if (!toDelete) return;
    setSaving(true);
    const result = await supabase
      .from("project_equipment")
      .delete()
      .eq("id", toDelete.id);
    if (result.error) setError(result.error.message);
    else {
      setToDelete(null);
      await load();
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase text-[var(--opc-red)]">
            Inventaire opérationnel
          </p>
          <h1 className="mt-2 text-4xl font-black">Materials & équipements</h1>
          <p className="mt-2 text-sm text-slate-500">
            Référentiel utilisé par les tâches et les rapports. L’automatisation
            du statut « installé » sera activée dans le prochain sprint.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white"
        >
          <CirclePlus className="h-4 w-4" /> Ajouter
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-4">Code</th><th>Désignation</th><th>Type</th>
                  <th>Fabricant / série</th><th>Quantité</th><th>Localisation</th>
                  <th>Référence technique</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="p-4 font-black text-[var(--opc-blue)]">{item.code}</td>
                    <td className="font-bold">{item.name}</td>
                    <td>{item.equipment_type === "equipment" ? "Équipement" : "Matériau"}</td>
                    <td>{item.manufacturer || "—"} / {item.serial_number || "—"}</td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{item.location || "—"}</td>
                    <td>{item.technical_reference || "—"}</td>
                    <td>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black">
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setToDelete(item)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr><td colSpan={9} className="p-14 text-center text-slate-400">Aucun équipement ou matériau enregistré.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-5">
              <div>
                <p className="text-xs font-black uppercase text-[var(--opc-red)]">Inventaire</p>
                <h2 className="mt-1 text-2xl font-black">Nouvel élément</h2>
              </div>
              <button onClick={() => setOpen(false)}><X /></button>
            </header>
            <form onSubmit={save} className="grid gap-4 p-6 sm:grid-cols-2">
              <Input label="Code"><input required value={form.code} onChange={(e) => setForm({...form,code:e.target.value})} className="input"/></Input>
              <Input label="Désignation"><input required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})} className="input"/></Input>
              <Input label="Type"><select value={form.equipment_type} onChange={(e) => setForm({...form,equipment_type:e.target.value as "material"|"equipment"})} className="input"><option value="material">Matériau</option><option value="equipment">Équipement</option></select></Input>
              <Input label="Statut"><select value={form.status} onChange={(e) => setForm({...form,status:e.target.value as typeof form.status})} className="input"><option value="available">Disponible</option><option value="reserved">Réservé</option><option value="installed">Installé</option><option value="out_of_service">Hors service</option></select></Input>
              <Input label="Fabricant"><input value={form.manufacturer} onChange={(e) => setForm({...form,manufacturer:e.target.value})} className="input"/></Input>
              <Input label="N° série"><input value={form.serial_number} onChange={(e) => setForm({...form,serial_number:e.target.value})} className="input"/></Input>
              <Input label="Quantité"><input type="number" min={0} step="0.01" value={form.quantity} onChange={(e) => setForm({...form,quantity:Number(e.target.value)})} className="input"/></Input>
              <Input label="Unité"><input value={form.unit} onChange={(e) => setForm({...form,unit:e.target.value})} className="input"/></Input>
              <Input label="Localisation"><input value={form.location} onChange={(e) => setForm({...form,location:e.target.value})} className="input"/></Input>
              <Input label="Référence technique"><input value={form.technical_reference} onChange={(e) => setForm({...form,technical_reference:e.target.value})} className="input"/></Input>
              <button disabled={saving} className="rounded-xl bg-[var(--opc-blue)] px-5 py-3 font-black text-white sm:col-span-2">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(toDelete)}
        title="Supprimer cet élément ?"
        description="Il sera retiré de l’inventaire et des tâches associées."
        subject={toDelete ? `${toDelete.code} - ${toDelete.name}` : undefined}
        deleting={saving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setToDelete(null);
        }}
        onConfirm={remove}
      />
      <style jsx>{`.input{width:100%;border:1px solid var(--opc-border);border-radius:.75rem;padding:.75rem;outline:none}`}</style>
    </div>
  );
}

function Input({label,children}:{label:string;children:React.ReactNode}) {
  return <label><span className="text-sm font-black">{label}</span><div className="mt-2">{children}</div></label>;
}
