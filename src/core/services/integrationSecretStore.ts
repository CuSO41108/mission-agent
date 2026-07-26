import type { IntegrationSecretKey } from "../../renderer/types";

export type IntegrationSecrets = Partial<Record<IntegrationSecretKey, string>>;

export interface IntegrationSecretStore {
  read(integrationId: string): IntegrationSecrets;
  apply(integrationId: string, changes: Partial<Record<IntegrationSecretKey, string | null>>): IntegrationSecrets;
  delete(integrationId: string): void;
}

const memory = new Map<string, IntegrationSecrets>();

let store: IntegrationSecretStore = {
  read: (integrationId) => ({ ...memory.get(integrationId) }),
  apply: (integrationId, changes) => {
    const next = { ...memory.get(integrationId) };
    for (const [key, value] of Object.entries(changes) as Array<[IntegrationSecretKey, string | null]>) {
      if (value === null) delete next[key];
      else if (value.trim()) next[key] = value.trim();
    }
    memory.set(integrationId, next);
    return { ...next };
  },
  delete: (integrationId) => { memory.delete(integrationId); },
};

export function configureIntegrationSecretStore(next: IntegrationSecretStore): void {
  store = next;
}

export function readIntegrationSecrets(integrationId: string): IntegrationSecrets {
  return store.read(integrationId);
}

export function applyIntegrationSecrets(
  integrationId: string,
  changes: Partial<Record<IntegrationSecretKey, string | null>>,
): IntegrationSecrets {
  return store.apply(integrationId, changes);
}

export function deleteIntegrationSecrets(integrationId: string): void {
  store.delete(integrationId);
}
