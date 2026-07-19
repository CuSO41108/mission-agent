import assert from "node:assert/strict";
import test from "node:test";
import { closeDatabase, initDatabase } from "../src/core/db/client";
import { migrateDatabase } from "../src/core/db/migrate";
import { getFolderDetail } from "../src/core/services/folderService";
import {
  addMaterial,
  createFolder,
  createTodo,
  deleteFolder,
  deleteMaterial,
  setFolderStatus,
  toggleTodo,
} from "../src/core/services/mutationService";

test("本地任务舱和材料 CRUD 保持归档/删除语义", () => {
  initDatabase({ dbPath: ":memory:" });
  migrateDatabase();

  try {
    const folder = createFolder({
      name: "集成测试任务舱",
      category: "test",
      priority: "medium",
      deadline: null,
      agentEnabled: false,
    });
    assert.equal(folder.status, "active");
    assert.equal(folder.agentConfig.enabled, false);
    assert.equal(folder.materials.length, 0);

    const withTodo = createTodo(folder.id, {
      title: "整理测试材料",
      dueDate: null,
      assignee: "agent",
    });
    assert.equal(withTodo.todos.length, 1);
    assert.equal(withTodo.todos[0].title, "整理测试材料");
    assert.equal(withTodo.todos[0].assignee, "agent");

    const otherFolder = createFolder({
      name: "另一个任务舱",
      category: "test",
      priority: "low",
      deadline: null,
      agentEnabled: false,
    });
    assert.throws(
      () => toggleTodo(otherFolder.id, withTodo.todos[0].id, true),
      /不属于当前任务舱/,
    );
    assert.equal(getFolderDetail(folder.id)?.todos[0].done, false);
    assert.equal(toggleTodo(folder.id, withTodo.todos[0].id, true).todos[0].done, true);

    const material = addMaterial(folder.id, {
      type: "file",
      name: "source.txt",
      content: "C:\\fixtures\\source.txt",
    });
    assert.equal(getFolderDetail(folder.id)?.materials[0]?.id, material.id);

    assert.throws(() => deleteFolder(folder.id), /必须先归档/);
    assert.equal(deleteMaterial(folder.id, material.id), true);
    assert.equal(getFolderDetail(folder.id)?.materials.length, 0);

    setFolderStatus(folder.id, "archived");
    assert.equal(getFolderDetail(folder.id)?.status, "archived");
    assert.equal(deleteFolder(folder.id), true);
    assert.equal(getFolderDetail(folder.id), null);
  } finally {
    closeDatabase();
  }
});
