"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

// ============================================
// TEMPLATES — GrantTemplate CRUD (5.6)
// ============================================

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  values: Record<string, unknown>;
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<{ templates: TemplateRow[] }>("/api/admin/templates"),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const startEdit = (template: TemplateRow | null) => {
    setFormOpen(true);
    setEditing(template);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setValues(JSON.stringify(template?.values ?? { durationMs: 2592000000, budget: { dailyRequests: 500 } }, null, 2));
    setError(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setName("");
    setDescription("");
    setError(null);
  };

  const save = async () => {
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(values);
      } catch {
        throw new Error("values is not valid JSON");
      }
      await api.post("/api/admin/templates", {
        name,
        description: description || undefined,
        values: parsed,
      });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (template: TemplateRow) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    await api.delete(`/api/admin/templates?id=${template.id}`);
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  };

  return (
    <main className="p-8 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Templates</h1>
        <button className="btn-primary text-sm" onClick={() => startEdit(null)}>
          New template
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Owner presets applied on the approval screen in one click — duration,
        renewal, auth, budgets, hardening.
      </p>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {data?.templates.map((template) => (
            <div key={template.id} className="card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {template.name}
                </p>
                {template.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {template.description}
                  </p>
                )}
                <p className="text-xs font-mono text-slate-400 truncate mt-1">
                  {JSON.stringify(template.values)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn-secondary text-xs" onClick={() => startEdit(template)}>
                  Edit
                </button>
                <button className="btn-secondary text-xs text-red-600" onClick={() => remove(template)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <section className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {editing ? `Edit "${editing.name}"` : "New template"}
          </h2>
          <input
            className="input w-full text-sm"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input w-full text-sm"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <textarea
            rows={8}
            className="input w-full text-xs font-mono"
            value={values}
            onChange={(e) => setValues(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={!name} onClick={save}>
              Save
            </button>
            <button className="btn-secondary text-sm" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
