// Material Repository · 材料引用 CRUD

import { getDb } from "../db/client";
import type { Material, MaterialType } from "../../renderer/types";
import type { DbRow } from "./base";

export function mapMaterial(row: DbRow): Material {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    type: String(row.type) as MaterialType,
    name: String(row.name ?? ""),
    content: String(row.content ?? ""),
    sourceIntegration: row.source_integration ? String(row.source_integration) : undefined,
    addedAt: Number(row.added_at),
  };
}

export const MaterialRepository = {
  listByFolder(folderId: string): Material[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM materials WHERE folder_id = ? ORDER BY added_at DESC;")
      .all(folderId) as DbRow[];
    return rows.map(mapMaterial);
  },

  insert(material: Material): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO materials
        (id, folder_id, type, name, content, storage_mode, original_path, archived_path, source_integration, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      material.id,
      material.folderId,
      material.type,
      material.name,
      material.content,
      "ref",
      material.type === "link" || material.type === "note" ? null : material.content,
      null,
      material.sourceIntegration ?? null,
      material.addedAt,
    );
  },

  delete(folderId: string, id: string): boolean {
    const db = getDb();
    const result = db
      .prepare("DELETE FROM materials WHERE id = ? AND folder_id = ?;")
      .run(id, folderId);
    return Number(result.changes) === 1;
  },
};
