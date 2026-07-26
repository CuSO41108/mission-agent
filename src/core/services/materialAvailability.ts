// Material availability · 本地引用的即时可用性检查
// 状态不写入数据库：源文件可被用户在应用外移动或删除，读取时检查才能避免陈旧状态。

import fs from "node:fs";
import path from "node:path";
import type { Material } from "../../renderer/types";

export type MaterialAvailability = "available" | "missing";

function isLocalFileReference(material: Material): boolean {
  return material.type !== "link"
    && material.type !== "note"
    && path.isAbsolute(material.content.trim());
}

export function getMaterialAvailability(material: Material): MaterialAvailability {
  if (!isLocalFileReference(material)) return "available";
  try {
    return fs.statSync(material.content.trim()).isFile() ? "available" : "missing";
  } catch {
    return "missing";
  }
}

export interface MaterialAvailabilityItem {
  materialId: string;
  availability: MaterialAvailability;
}

export function inspectMaterialAvailability(materials: Material[]): MaterialAvailabilityItem[] {
  return materials.map((material) => ({
    materialId: material.id,
    availability: getMaterialAvailability(material),
  }));
}

export function listMissingMaterials(materials: Material[]): Material[] {
  return materials.filter((material) => getMaterialAvailability(material) === "missing");
}
