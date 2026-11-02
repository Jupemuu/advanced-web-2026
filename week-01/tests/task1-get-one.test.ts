// Task 1 (0.5 p): GET /tasks/:id returns one task. VISIBLE to students.
import { describe, expect, test } from "bun:test";
import { call, TASK_1, TASK_2_CORE } from "./helpers/api";

describe("Task 1: GET /tasks/:id returns one task", () => {
  test("GET /tasks/1 returns 200 and task 1 in an ApiResponse, as JSON", async () => {
    const { res, body } = await call("/tasks/1");
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, statusCode: 200, data: TASK_1 });
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
  });

  test("GET /tasks/2 returns task 2", async () => {
    const { res, body } = await call("/tasks/2");
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(body.data).toMatchObject(TASK_2_CORE);
  });
});
