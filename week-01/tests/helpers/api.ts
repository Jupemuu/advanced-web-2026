// Shared helpers for the week 1 grading tests.
// The student's project is todo-api/ next to this tests/ folder (see prepare-submission.sh).
import { expect } from "bun:test";
import path from "node:path";

type Handler = (req: Request) => Response | Promise<Response>;

let cached: Handler | undefined;

/** Imports `handler` from the student's todo-api/src/main.ts (without starting a server). */
export async function loadHandler(): Promise<Handler> {
  if (cached) return cached;
  const file = path.resolve(import.meta.dir, "..", "..", "todo-api", "src", "main.ts");
  const mod = (await import(file)) as { handler?: unknown };
  if (typeof mod.handler !== "function") {
    throw new Error("todo-api/src/main.ts must export a function named `handler` (export function handler(req: Request): Response)");
  }
  cached = mod.handler as Handler;
  return cached;
}

export type Body = {
  success: boolean;
  statusCode: number;
  data?: unknown;
  error?: string;
};

/** Sends a request to the handler and returns the response and its parsed JSON body. */
export async function call(pathAndQuery: string, method = "GET"): Promise<{ res: Response; body: Body }> {
  const handler = await loadHandler();
  const res = await handler(new Request(`http://localhost${pathAndQuery}`, { method }));
  const text = await res.text();
  let body: Body;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    throw new Error(`${method} ${pathAndQuery}: the response body is not JSON: ${text.slice(0, 200)}`);
  }
  return { res, body };
}

export const TASK_1 = {
  id: 1,
  title: "Learn TypeScript",
  description: "Learn TypeScript basics",
  status: "in progress",
};

export const TASK_2_CORE = {
  id: 2,
  title: "Build a Todo App",
  description: "Build a simple todo app using Bun",
  status: "open",
};

/** Checks the shared error shape: { success: false, statusCode, error }. */
export function expectError(res: Response, body: Body, statusCode: number, error: string): void {
  expect(res.status).toBe(statusCode);
  expect(body).toEqual({ success: false, statusCode, error });
}

/** The ids of a task list in a response body. */
export function ids(body: Body): number[] {
  expect(Array.isArray(body.data)).toBe(true);
  return (body.data as { id: number }[]).map((t) => t.id);
}
