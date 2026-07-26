import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import type { IntegrationSecretKey } from "../renderer/types";
import type { IntegrationSecretStore, IntegrationSecrets } from "../core/services/integrationSecretStore";

type VaultData = Record<string, IntegrationSecrets>;

function readVault(filePath: string): VaultData {
  if (!fs.existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return {};
  try {
    const encrypted = Buffer.from(fs.readFileSync(filePath, "utf8"), "base64");
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as VaultData;
  } catch {
    throw new Error("飞书适配器凭据无法解密，请重新配置适配器");
  }
}

function writeVault(filePath: string, data: VaultData): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储暂不可用，适配器凭据未保存");
  const encrypted = safeStorage.encryptString(JSON.stringify(data)).toString("base64");
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, encrypted, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

export function createIntegrationSecretVault(filePath: string): IntegrationSecretStore {
  const resolved = path.resolve(filePath);
  return {
    read(integrationId) {
      return { ...(readVault(resolved)[integrationId] ?? {}) };
    },
    apply(integrationId, changes) {
      const vault = readVault(resolved);
      const next = { ...(vault[integrationId] ?? {}) };
      for (const [key, value] of Object.entries(changes) as Array<[IntegrationSecretKey, string | null]>) {
        if (value === null) delete next[key];
        else if (value.trim()) next[key] = value.trim();
      }
      vault[integrationId] = next;
      writeVault(resolved, vault);
      return { ...next };
    },
    delete(integrationId) {
      const vault = readVault(resolved);
      if (!(integrationId in vault)) return;
      delete vault[integrationId];
      writeVault(resolved, vault);
    },
  };
}
