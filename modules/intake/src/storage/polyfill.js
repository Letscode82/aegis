// window.storage polyfill — Step 2 form (Prisma-backed via /api/intake/storage).
//
// Same surface the v8 demo expects:
//
//   window.storage.get(key)    → Promise<{value: string} | null>
//   window.storage.set(key,str)→ Promise<void>
//   window.storage.delete(key) → Promise<void>
//
// Implementation now: fetch() against /api/intake/storage, which routes
// to @aegis/intake/server → @aegis/db. React components don't change.
//
// Step 5 will replace the polyfill consumers with proper typed queries
// (@aegis/intake/api), and this shim will be deleted entirely.

const ENDPOINT = "/api/intake/storage";

export function installStoragePolyfill() {
  if (typeof window === "undefined") return;
  if (window.storage && typeof window.storage.get === "function") return;

  window.storage = {
    async get(key) {
      try {
        const resp = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
          method: "GET",
        });
        if (!resp.ok) {
          console.error(`[storage.get] ${resp.status} for key=${key}`);
          return null;
        }
        return await resp.json();
      } catch (err) {
        console.error(`[storage.get] network error for key=${key}:`, err);
        return null;
      }
    },

    async set(key, value) {
      try {
        const resp = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!resp.ok) {
          console.error(`[storage.set] ${resp.status} for key=${key}`);
        }
      } catch (err) {
        console.error(`[storage.set] network error for key=${key}:`, err);
      }
    },

    async delete(key) {
      try {
        await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error(`[storage.delete] network error for key=${key}:`, err);
      }
    },
  };
}
