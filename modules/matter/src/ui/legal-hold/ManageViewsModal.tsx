/**
 * ManageViewsModal — list of the actor's own saved views with
 * inline rename / toggle shared / toggle default / delete.
 *
 * Sub-PR 4c.5, Item 16.
 */
import React, { useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";
import type { SavedViewDTO } from "./SavedViewsDropdown";

export interface ManageViewsModalProps {
  views: SavedViewDTO[];
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export const ManageViewsModal: React.FC<ManageViewsModalProps> = ({
  views,
  onClose,
  onChanged,
}) => {
  const toast = useToast();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function withBusy<T>(id: string, fn: () => Promise<T>): Promise<T> {
    setBusyIds((prev) => new Set(prev).add(id));
    return fn().finally(() => {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  async function update(view: SavedViewDTO, patch: Partial<SavedViewDTO>) {
    await withBusy(view.id, async () => {
      try {
        const r = await fetch(`/api/saved-views/${view.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        toast.success("View updated.");
        onChanged();
      } catch (e) {
        toast.error(`Update failed: ${String(e)}`);
      }
    });
  }

  async function remove(view: SavedViewDTO) {
    if (!window.confirm(`Delete saved view "${view.name}"?`)) return;
    await withBusy(view.id, async () => {
      try {
        const r = await fetch(`/api/saved-views/${view.id}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        toast.success(`Deleted view "${view.name}".`);
        onChanged();
      } catch (e) {
        toast.error(`Delete failed: ${String(e)}`);
      }
    });
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Manage saved views"
      title="Manage views"
      icon="📁"
      sub="Edit, share, or delete the views you've saved for this surface."
      maxWidth={620}
    >
      {views.length === 0 ? (
        <div style={{ color: C.t3, fontFamily: M, fontSize: 11 }}>
          You don&apos;t own any saved views for this surface yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {views.map((v) => {
            const busy = busyIds.has(v.id);
            return (
              <div
                key={v.id}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 10,
                  background: C.s1,
                  border: `1px solid ${C.br}`,
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <input
                    defaultValue={v.name}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== v.name) {
                        update(v, { name: next });
                      }
                    }}
                    aria-label="View name"
                    style={{
                      background: C.cd,
                      border: `1px solid ${C.br}`,
                      color: C.t1,
                      padding: "5px 8px",
                      borderRadius: 4,
                      fontFamily: F,
                      fontSize: 11,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    disabled={busy}
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.rd}55`,
                      color: C.rd,
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontFamily: F,
                      fontSize: 10.5,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    fontFamily: F,
                    fontSize: 10.5,
                    color: C.t2,
                  }}
                >
                  <Toggle
                    checked={v.isShared}
                    label="Shared"
                    busy={busy}
                    onChange={(next) => update(v, { isShared: next })}
                  />
                  <Toggle
                    checked={v.isDefault}
                    label="Default"
                    busy={busy}
                    onChange={(next) => update(v, { isDefault: next })}
                  />
                  <span
                    style={{
                      flex: 1,
                      textAlign: "right",
                      fontFamily: M,
                      fontSize: 9.5,
                      color: C.t4,
                    }}
                  >
                    Updated{" "}
                    {new Date(v.updatedAt)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 16)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
};

const Toggle: React.FC<{
  checked: boolean;
  label: string;
  busy: boolean;
  onChange: (next: boolean) => void;
}> = ({ checked, label, busy, onChange }) => (
  <label
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      cursor: busy ? "wait" : "pointer",
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={busy}
      onChange={(e) => onChange(e.target.checked)}
    />
    {label}
  </label>
);
