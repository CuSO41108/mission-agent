// Timeline Repository · 时间线 CRUD

import { getDb } from "../db/client";
import type { TimelineEntry, Actor } from "../../renderer/types";
import { parseJson, type DbRow } from "./base";

export function mapTimeline(row: DbRow): TimelineEntry {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    actor: String(row.actor ?? "system") as Actor,
    action: String(row.action ?? ""),
    timestamp: Number(row.timestamp),
    meta: row.meta ? parseJson(row.meta, undefined) : undefined,
  };
}

export const TimelineRepository = {
  listByFolder(folderId: string): TimelineEntry[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM timeline WHERE folder_id = ? ORDER BY timestamp DESC;")
      .all(folderId) as DbRow[];
    return rows.map(mapTimeline);
  },

  insert(entry: TimelineEntry): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO timeline
        (id, folder_id, actor, action, meta, timestamp)
       VALUES (?, ?, ?, ?, ?, ?);`,
    ).run(
      entry.id,
      entry.folderId,
      entry.actor,
      entry.action,
      entry.meta ? JSON.stringify(entry.meta) : null,
      entry.timestamp,
    );
  },
};
