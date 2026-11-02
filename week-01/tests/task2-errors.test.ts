// Task 2 (0.5 p): errors of GET /tasks/:id. VISIBLE to students.
import { describe, test } from "bun:test";
import { call, expectError } from "./helpers/api";

describe("Task 2: GET /tasks/:id errors", () => {
  test("GET /tasks/99 returns 404 Task not found", async () => {
    const { res, body } = await call("/tasks/99");
    expectError(res, body, 404, "Task not found");
  });

  test("GET /tasks/abc returns 400 Invalid task id", async () => {
    const { res, body } = await call("/tasks/abc");
    expectError(res, body, 400, "Invalid task id");
  });
});
