// Task 5 (0.5 p): invalid status values. VISIBLE to students.
import { describe, test } from "bun:test";
import { call, expectError } from "./helpers/api";

describe("Task 5: invalid status is rejected", () => {
  test("?status=finished returns 400 Invalid status", async () => {
    const { res, body } = await call("/tasks?status=finished");
    expectError(res, body, 400, "Invalid status");
  });
});
