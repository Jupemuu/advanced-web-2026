// Task 4 (0.5 p): GET /tasks?status= filter. VISIBLE to students.
import { describe, expect, test } from "bun:test";
import { call, ids } from "./helpers/api";

describe("Task 4: filter by status", () => {
  test("?status=open returns only task 2", async () => {
    const { res, body } = await call("/tasks?status=open");
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(ids(body)).toEqual([2]);
  });

  test("?status=in%20progress returns only task 1", async () => {
    const { body } = await call("/tasks?status=in%20progress");
    expect(ids(body)).toEqual([1]);
  });

  test("?status=open filters, and without ?status all tasks are returned", async () => {
    expect(ids((await call("/tasks?status=open")).body)).toEqual([2]);
    const { body } = await call("/tasks");
    expect(ids(body)).toEqual([1, 2]);
  });
});
