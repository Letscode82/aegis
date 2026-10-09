/**
 * Connector registry (F-8).
 *
 * The single source of truth for "which external systems OneLegal can connect to."
 * A surface (admin connect page, research tool, DMS picker) resolves a connector
 * by id and reads its OAuth config; it never hard-codes a provider. Ships empty
 * — concrete providers (C-3/C-4/C-5) register themselves as they land.
 */
import type { ConnectorDescriptor, ConnectorKind } from "./types.js";

export class ConnectorRegistry {
  private readonly byId = new Map<string, ConnectorDescriptor>();

  /** Register a connector. Throws on a duplicate id so collisions fail loud. */
  register(descriptor: ConnectorDescriptor): void {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`Connector "${descriptor.id}" is already registered`);
    }
    this.byId.set(descriptor.id, descriptor);
  }

  get(id: string): ConnectorDescriptor | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(kind?: ConnectorKind): ConnectorDescriptor[] {
    const all = Array.from(this.byId.values());
    return kind ? all.filter((c) => c.kind === kind) : all;
  }
}

/** Process-wide default registry. */
export const connectorRegistry = new ConnectorRegistry();
