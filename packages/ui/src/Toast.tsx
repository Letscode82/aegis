/**
 * Toast — shared snackbar component for action feedback (sub-PR
 * 4c.4, Item 13).
 *
 * Usage:
 *   1. Mount <ToastProvider> once at the app root (apps/web/_app).
 *   2. Anywhere inside, call useToast() and fire:
 *        const toast = useToast();
 *        toast.success("Hold issued");
 *        toast.error("Permission denied: ...");
 *
 * Behavior:
 *   - Renders into a portal at document.body so persisted-transform
 *     ancestors (Aurora's `Card` animation) don't clip the toast.
 *   - Auto-dismiss after `duration` (default 4000ms; errors get
 *     8000ms so the user has time to read the message).
 *   - Click anywhere on the toast to dismiss manually.
 *   - role="status" + aria-live="polite" for the success/info row;
 *     role="alert" + aria-live="assertive" for errors. Screen
 *     readers announce both classes correctly.
 *   - Toasts stack newest-on-top, max-visible 5 (older ones drop
 *     off the bottom — they've already been on screen long enough
 *     to be read).
 *
 * Why a render-prop / context pattern rather than a global store:
 *   - Tests can mount their own provider and assert against the
 *     in-tree DOM without poking a singleton.
 *   - SSR-safe: useToast() outside a provider throws a clear
 *     error at render time rather than failing silently.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { C, F, M } from "./theme/tokens.js";

export type ToastSeverity = "success" | "info" | "warning" | "error";

export interface ToastOptions {
  severity?: ToastSeverity;
  /** Custom auto-dismiss timeout in ms. 0 = never auto-dismiss. */
  duration?: number;
}

interface ToastRecord {
  id: string;
  message: string;
  severity: ToastSeverity;
  duration: number;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, "severity">) => void;
  info: (message: string, options?: Omit<ToastOptions, "severity">) => void;
  warning: (message: string, options?: Omit<ToastOptions, "severity">) => void;
  error: (message: string, options?: Omit<ToastOptions, "severity">) => void;
  /** Dismiss a toast by its id (returned from show()). */
  dismiss: (id: string) => void;
  /** Dismiss every visible toast. */
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 8000;
const MAX_VISIBLE = 5;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

const SEVERITY_COLORS: Record<ToastSeverity, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: `${C.gn}1a`, border: C.gn, text: C.gn, icon: "✓" },
  info: { bg: `${C.bl}1a`, border: C.bl, text: C.bl, icon: "ⓘ" },
  warning: { bg: `${C.am}1a`, border: C.am, text: C.am, icon: "⚠" },
  error: { bg: `${C.rd}1a`, border: C.rd, text: C.rd, icon: "✕" },
};

export interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const severity = options?.severity ?? "info";
      const duration =
        options?.duration ??
        (severity === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      const id = nextId();
      setToasts((prev) => {
        const next = [{ id, message, severity, duration }, ...prev];
        return next.slice(0, MAX_VISIBLE);
      });
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  // Capture timers in a ref-stable closure so the cleanup effect
  // doesn't re-create on every render.
  const timersRef = timers;
  useEffect(() => {
    return () => {
      timersRef.current.forEach((handle) => clearTimeout(handle));
      timersRef.current.clear();
    };
  }, [timersRef]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (msg, opts) => {
        show(msg, { ...opts, severity: "success" });
      },
      info: (msg, opts) => {
        show(msg, { ...opts, severity: "info" });
      },
      warning: (msg, opts) => {
        show(msg, { ...opts, severity: "warning" });
      },
      error: (msg, opts) => {
        show(msg, { ...opts, severity: "error" });
      },
      dismiss,
      clear: () => {
        timers.current.forEach((handle) => clearTimeout(handle));
        timers.current.clear();
        setToasts([]);
      },
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast must be called inside <ToastProvider>. Mount the provider at the app root.",
    );
  }
  return ctx;
}

const ToastViewport: React.FC<{
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (typeof document === "undefined") return null;
  if (toasts.length === 0) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 2000,
        maxWidth: 420,
        pointerEvents: "none",
      }}
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
};

const ToastRow: React.FC<{
  toast: ToastRecord;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  const colors = SEVERITY_COLORS[toast.severity];
  const isError = toast.severity === "error";
  return (
    <button
      type="button"
      onClick={onDismiss}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${colors.border}`,
        borderRadius: 4,
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        fontFamily: F,
        fontSize: 11.5,
        color: C.t1,
        cursor: "pointer",
        textAlign: "left",
        pointerEvents: "auto",
        animation: "fu .25s ease both",
        minWidth: 280,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: M,
          fontSize: 13,
          color: colors.text,
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {colors.icon}
      </span>
      <span style={{ flex: 1, lineHeight: 1.4, color: C.t1 }}>
        {toast.message}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: M,
          fontSize: 11,
          color: C.t4,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        ✕
      </span>
    </button>
  );
};
