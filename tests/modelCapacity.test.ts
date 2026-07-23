import assert from "node:assert/strict";
import test from "node:test";
import {
  resetModelCapacityForTests,
  withModelCapacity,
} from "../src/core/agent/modelCapacity";

test("Copilot 与 Agent 可共享同一模型并发额度", async () => {
  resetModelCapacityForTests();
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const started: string[] = [];

  const first = withModelCapacity("test-model", 1, async () => {
    started.push("agent");
    await firstGate;
  });
  await new Promise((resolve) => setImmediate(resolve));

  const second = withModelCapacity("test-model", 1, async () => {
    started.push("copilot");
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["agent"]);

  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(started, ["agent", "copilot"]);
});
