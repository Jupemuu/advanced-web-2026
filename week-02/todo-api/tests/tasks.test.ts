// End-to-end tests for the REST API. A real server is started on a random free
// port (port: 0) and the tests talk to it with fetch(), exactly like a client.
//
// The tasks live in a module-level array, so the tests in the CRUD block build
// on each other and run in order.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { fallback, routes } from "../src/router";
import { serveStatic } from "../src/static";
import type { ApiResult, Task } from "../src/types";

let server: Server<undefined>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({ port: 0, routes, fetch: fallback });
  baseUrl = server.url.origin;
});

afterAll(() => server.stop(true));

function request(path: string, method = "GET", body?: unknown): Promise<Response> {
  return fetch(baseUrl + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read<T>(res: Response): Promise<ApiResult<T>> {
  return (await res.json()) as ApiResult<T>;
}

describe("task CRUD", () => {
  let created: Task;

  test("the list starts empty", async () => {
    const res = await request("/api/tasks");
    expect(res.status).toBe(200);
    expect(await read<Task[]>(res)).toEqual({ ok: true, data: [] });
  });

  test("POST creates a task with status 'open'", async () => {
    const res = await request("/api/tasks", "POST", { title: "  Write tests ", description: "with bun:test" });
    expect(res.status).toBe(201);

    const payload = await read<Task>(res);
    if (!payload.ok) throw new Error("expected success");
    created = payload.data;
    expect(created).toEqual({ id: 1, title: "Write tests", description: "with bun:test", status: "open" });
  });

  test("GET /:id returns the created task", async () => {
    const res = await request(`/api/tasks/${created.id}`);
    expect(await read<Task>(res)).toEqual({ ok: true, data: created });
  });

  test("PUT replaces the editable fields", async () => {
    const res = await request(`/api/tasks/${created.id}`, "PUT", {
      title: "Write more tests",
      description: "still bun:test",
      status: "done",
    });
    expect(res.status).toBe(200);
    expect(await read<Task>(res)).toEqual({
      ok: true,
      data: { id: created.id, title: "Write more tests", description: "still bun:test", status: "done" },
    });
  });

  test("DELETE removes it and answers 204 with no body", async () => {
    const res = await request(`/api/tasks/${created.id}`, "DELETE");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const after = await request(`/api/tasks/${created.id}`);
    expect(after.status).toBe(404);
  });
});

describe("validation", () => {
  test.each([
    ["missing description", { title: "x" }],
    ["blank title", { title: "   ", description: "x" }],
    ["wrong type", { title: 1, description: "x" }],
    ["an array", [1, 2]],
  ])("POST rejects %s with 400", async (_label, body) => {
    const res = await request("/api/tasks", "POST", body);
    expect(res.status).toBe(400);
    const payload = await read<never>(res);
    expect(payload.ok).toBe(false);
  });

  test("POST rejects malformed JSON with 400", async () => {
    const res = await fetch(baseUrl + "/api/tasks", { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
  });

  test.each(["abc", "1.5", "-3", "0"])("rejects the id %p with 400", async (id) => {
    const res = await request(`/api/tasks/${id}`);
    expect(res.status).toBe(400);
  });

  test("PUT rejects an unknown status", async () => {
    const created = await read<Task>(await request("/api/tasks", "POST", { title: "a", description: "b" }));
    if (!created.ok) throw new Error("expected success");

    const res = await request(`/api/tasks/${created.data.id}`, "PUT", {
      title: "a",
      description: "b",
      status: "finished",
    });
    expect(res.status).toBe(400);
  });

  test("an unknown task id gives 404", async () => {
    const res = await request("/api/tasks/999", "DELETE");
    expect(res.status).toBe(404);
  });
});

describe("fallback", () => {
  test("an unknown API route gives a JSON 404", async () => {
    const res = await request("/api/nothing-here");
    expect(res.status).toBe(404);
    expect((await read<never>(res)).ok).toBe(false);
  });

  // The starting behaviour: no route matches, so the request falls through to
  // the 404 fallback. Exercise 2 in the week's README changes this to 405 with
  // an Allow header; update this test when you do it.
  test("an unsupported method on a known path falls through to the 404 fallback", async () => {
    const res = await request("/api/tasks", "PATCH");
    expect(res.status).toBe(404);
  });

  test("/ serves index.html", async () => {
    const res = await request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("static files get the right content type", async () => {
    expect((await request("/app.js")).headers.get("content-type")).toContain("javascript");
    expect((await request("/styles.css")).headers.get("content-type")).toContain("text/css");
  });

  test("path traversal cannot reach the source code", async () => {
    // URL parsing already collapses "/../" in a normal request, so the check in
    // serveStatic() is tested directly with the kind of path it must refuse.
    expect(await serveStatic("/../src/types.ts")).toBeNull();
    expect(await serveStatic("/../../package.json")).toBeNull();
    expect(await serveStatic("/index.html")).not.toBeNull();
  });
});
