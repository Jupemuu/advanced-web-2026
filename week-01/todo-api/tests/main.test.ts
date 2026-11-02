// Tests use Bun's built-in test runner: `bun test` finds every *.test.ts file.
// Because `handler` is a plain function from Request to Response, it can be
// tested without starting a server or opening a port.
import { describe, expect, test } from "bun:test";
import { handler } from "../src/main";
import type { ApiResponse } from "../src/response";
import type { Task } from "../src/task";

describe("GET /tasks", () => {
  test("returns the task list in an ApiResponse", async () => {
    const res = handler(new Request("http://localhost/tasks"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");

    // res.json() returns `unknown`: the compiler cannot know what the server sent.
    // In a test we know the expected shape, so we state it with `as`.
    const body = (await res.json()) as ApiResponse<Task[]>;
    expect(body.success).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data?.[0]).toEqual({
      id: 1,
      title: "Learn TypeScript",
      description: "Learn TypeScript basics",
      status: "in progress",
    });
  });
});

describe("everything else", () => {
  test("an unknown path returns 404", async () => {
    const res = handler(new Request("http://localhost/unknown"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, statusCode: 404, error: "Not Found" });
  });

  test("a POST to /tasks returns 404, because only GET is implemented", () => {
    const res = handler(new Request("http://localhost/tasks", { method: "POST" }));

    expect(res.status).toBe(404);
  });
});

