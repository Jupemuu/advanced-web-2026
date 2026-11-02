// Task 3 (0.5 p): optional dueDate on Task. VISIBLE to students.
import { describe, expect, test } from "bun:test";
import { call, TASK_1, TASK_2_CORE } from "./helpers/api";

describe("Task 3: optional dueDate", () => {
  test("task 2 has dueDate 2026-11-02 in GET /tasks", async () => {
    const { body } = await call("/tasks");
    const list = body.data as Record<string, unknown>[];
    expect(list[1]).toEqual({ ...TASK_2_CORE, dueDate: "2026-11-02" });
  });

  test("task 2 has a dueDate, task 1 has no dueDate property at all", async () => {
    const { body } = await call("/tasks");
    const list = body.data as Record<string, unknown>[];
    expect(list[1]?.dueDate).toBe("2026-11-02");
    expect(list[0]).toEqual(TASK_1);
    expect(Object.keys(list[0] ?? {})).not.toContain("dueDate");
  });
});
