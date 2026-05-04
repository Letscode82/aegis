/**
 * SavedViewsDropdown — saved-views chooser used above the
 * Custodians panel (and reusable for any other filterable surface).
 *
 * The component is presentational/stateful: it loads the views for
 * its `scope`, applies the current selection by calling `onApply`
 * with the saved filterState blob, and surfaces the
 * `SaveViewDialog` + `ManageViewsModal` for new / edit / delete.
 *
 * Sub-PR 4c.5, Item 16.
 */
import React, { useEffect, useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ManageViewsModal } from "./ManageViewsModal";
import { SaveViewDialog } from "./SaveViewDialog";

export interface SavedViewDTO {
  id: string;
  scope: string;
  name: string;
  filterState: unknown;
  isShared: boolean;
  isDefault: boolean;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewsDropdownProps {
  scope: string;
  /** The actor's user id — used to bucket My views vs Shared views. */
  currentUserId: string | null;
  /** Current filter state to capture when "Save current view" is clicked. */
  currentFilterState: unknown;
  onApply: (state: unknown) => void;
  /** Optional — apply the actor's default view automatically on first load. */
  applyDefaultOnMount?: boolean;
}

export const SavedViewsDropdown: React.FC<SavedViewsDropdownProps> = ({
  scope,
  currentUserId,
  currentFilterState,
  onApply,
  applyDefaultOnMount,
}) => {
  const toast = useToast();
  const [views, setViews] = useState<SavedViewDTO[] | null>(null);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);

  function reload() {
    fetch(`/api/saved-views?scope=${encodeURIComponent(scope)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setViews)
      .catch(() => setViews([]));
  }

  useEffect(() => {
    // Re-fetch only when scope changes; reload() is stable.
    reload();
  }, [scope]);

  // Auto-apply default view once per mount when caller opts in.
  // We intentionally only react to `views`/`defaultApplied` so we
  // fire exactly once after the first list arrives — adding
  // `onApply` to deps would re-run every parent re-render.
  useEffect(() => {
    if (!applyDefaultOnMount || !views || defaultApplied) return;
    const own = views.find(
      (v) => v.ownerId === currentUserId && v.isDefault,
    );
    if (own) {
      setSelectedId(own.id);
      onApply(own.filterState);
    }
    setDefaultApplied(true);
  }, [applyDefaultOnMount, views, currentUserId, defaultApplied]);

  const own = (views ?? []).filter((v) => v.ownerId === currentUserId);
  const shared = (views ?? []).filter((v) => v.ownerId !== currentUserId);
  const selected = views?.find((v) => v.id === selectedId);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: C.cd,
          border: `1px solid ${C.br}`,
          color: C.t1,
          padding: "5px 10px",
          borderRadius: 4,
          fontFamily: F,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>VIEW</span>
        <span style={{ color: selected ? C.t1 : C.t3 }}>
          {selected?.name ?? "(no view applied)"}
        </span>
        <span style={{ color: C.t4, fontSize: 9 }} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: C.cd,
            border: `1px solid ${C.brL}`,
            borderRadius: 4,
            boxShadow: "0 6px 18px rgba(0,0,0,.35)",
            minWidth: 280,
            zIndex: 100,
            fontFamily: F,
            fontSize: 11,
            maxHeight: 400,
            overflowY: "auto",
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <Item
            onClick={() => {
              setSelectedId(null);
              setOpen(false);
              onApply(null);
            }}
            label="(no view applied)"
            active={!selectedId}
          />
          {own.length > 0 && <SectionHeader text="My views" />}
          {own.map((v) => (
            <Item
              key={v.id}
              onClick={() => {
                setSelectedId(v.id);
                setOpen(false);
                onApply(v.filterState);
              }}
              label={v.name}
              suffix={v.isDefault ? "default" : v.isShared ? "shared" : null}
              active={selectedId === v.id}
            />
          ))}
          {shared.length > 0 && <SectionHeader text="Shared views" />}
          {shared.map((v) => (
            <Item
              key={v.id}
              onClick={() => {
                setSelectedId(v.id);
                setOpen(false);
                onApply(v.filterState);
              }}
              label={v.name}
              suffix={v.ownerName ?? null}
              active={selectedId === v.id}
            />
          ))}
          <div
            style={{
              borderTop: `1px solid ${C.br}`,
              padding: 6,
              display: "grid",
              gap: 2,
            }}
          >
            <Item
              onClick={() => {
                setOpen(false);
                setSaveOpen(true);
              }}
              label="+ Save current view"
              variant="action"
            />
            <Item
              onClick={() => {
                setOpen(false);
                setManageOpen(true);
              }}
              label="Manage views"
              variant="action"
            />
          </div>
        </div>
      )}

      {saveOpen && (
        <SaveViewDialog
          scope={scope}
          filterState={currentFilterState}
          onClose={() => setSaveOpen(false)}
          onSaved={(view) => {
            setSaveOpen(false);
            reload();
            setSelectedId(view.id);
            toast.success(`Saved view "${view.name}".`);
          }}
        />
      )}

      {manageOpen && views && (
        <ManageViewsModal
          views={own}
          currentUserId={currentUserId}
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            reload();
          }}
        />
      )}
    </span>
  );
};

const SectionHeader: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      padding: "5px 12px",
      fontFamily: M,
      fontSize: 9,
      color: C.t3,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      borderTop: `1px solid ${C.br}33`,
      background: C.s1,
    }}
  >
    {text}
  </div>
);

const Item: React.FC<{
  onClick: () => void;
  label: string;
  suffix?: string | null;
  active?: boolean;
  variant?: "action";
}> = ({ onClick, label, suffix, active, variant }) => (
  <button
    type="button"
    onClick={onClick}
    role="option"
    aria-selected={!!active}
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      width: "100%",
      padding: "6px 12px",
      background: active ? `${C.bl}1f` : "transparent",
      border: "none",
      color: variant === "action" ? C.bl : C.t1,
      fontFamily: F,
      fontSize: 11,
      cursor: "pointer",
      textAlign: "left",
      borderRadius: variant === "action" ? 3 : 0,
    }}
  >
    <span>{label}</span>
    {suffix && (
      <span
        style={{
          fontFamily: M,
          fontSize: 9.5,
          color: C.t4,
          letterSpacing: 0.3,
        }}
      >
        {suffix}
      </span>
    )}
  </button>
);
