# Week 2 – REST API with a static front-end

Week 1 had one hard-coded endpoint. This week the Todo API becomes a complete
**REST API**: tasks can be created, read, updated and deleted over HTTP. The
same Bun server also serves a small front-end written in plain HTML, CSS and
JavaScript, so we see both sides of client–server communication for the first
time.

## Learning objectives

After this week you can:

- design REST endpoints for a resource and choose the right HTTP methods and status codes
- define routes with Bun's `routes` table, including route parameters (`/api/tasks/:id`)
- validate untrusted request data at runtime with type guards
- model API responses with a discriminated union so impossible states cannot be expressed
- serve static files safely with `Bun.file`, including protection against path traversal
- call a JSON API from browser JavaScript with `fetch`

## What you build

| Method | Path | Body | Success | Errors |
| ------ | ---- | ---- | ------- | ------ |
| `GET` | `/api/tasks` | – | `200` list of tasks | – |
| `POST` | `/api/tasks` | `{ title, description }` | `201` the new task | `400` invalid body |
| `GET` | `/api/tasks/:id` | – | `200` one task | `400` bad id, `404` not found |
| `PUT` | `/api/tasks/:id` | `{ title, description, status }` | `200` the updated task | `400`, `404` |
| `DELETE` | `/api/tasks/:id` | – | `204` no body | `400`, `404` |

Every JSON response uses the same envelope:

```jsonc
{ "ok": true,  "data": { "id": 1, "title": "…", "description": "…", "status": "open" } }
{ "ok": false, "error": { "message": "Task not found" } }
```

Any other `GET` request is answered with a file from `public/`, so
<http://localhost:8000/> shows the front-end.

## Running it

```bash
cd week-02/todo-api
bun run dev          # http://localhost:8000
bun test             # 21 end-to-end tests
bun run typecheck
```

## Project structure

```
week-02/todo-api/
├── src/
│   ├── main.ts         starts Bun.serve with the routes and the fallback
│   ├── router.ts       in-memory data, response helpers, handlers, route table, fallback
│   ├── types.ts        Task, request body types, ApiResult<T>
│   ├── validation.ts   readJson() and the type guards / parsers
│   └── static.ts       serveStatic(): files from public/, with traversal protection
├── public/
│   ├── index.html      the page
│   ├── app.js          browser JavaScript that calls the API
│   └── styles.css
└── tests/
    └── tasks.test.ts   starts a real server on a random port and calls it with fetch
```

---

## Concepts

### REST in one page

REST organises an API around **resources** (here: tasks) identified by URLs.
The HTTP **method** says what to do with the resource:

| Method | Meaning | Safe? | Idempotent? |
| ------ | ------- | ----- | ----------- |
| `GET` | read | yes | yes |
| `POST` | create a new resource in a collection | no | no |
| `PUT` | replace a resource with the given representation | no | yes |
| `PATCH` | change part of a resource | no | not necessarily |
| `DELETE` | delete a resource | no | yes |

*Safe* means the request does not change anything on the server.
*Idempotent* means sending the same request twice has the same effect as
sending it once: deleting task 3 twice still leaves task 3 deleted, but posting
the same task twice creates two tasks.

This API uses **PUT** for updates, so the client sends every editable field.
If the client only wanted to change the status, a `PATCH /api/tasks/:id` with
`{ "status": "done" }` would be the more precise choice. That is left as an
exercise.

The **status code** tells the client what happened, before it even reads the
body. The codes used this week are listed at the top of `router.ts`; the full
list is on [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status).
The rule of thumb: `2xx` success, `4xx` the client did something wrong, `5xx`
the server failed.

### Routing with `Bun.serve({ routes })`

Week 1 routed requests with `if` statements. Bun has a declarative alternative:

```ts
export const routes = {
  "/api/tasks": {
    GET: listTasks,
    POST: createTask,
  },
  "/api/tasks/:id": {
    GET: getTask,
    PUT: updateTask,
    DELETE: deleteTask,
  },
};

Bun.serve({ port: 8000, routes, fetch: fallback });
```

- The keys are paths. `:id` is a **route parameter** and matches one path
  segment: `/api/tasks/7` gives `req.params.id === "7"`.
- The value is either one handler for every method, or an object with one
  handler per method.
- `fetch` still exists. Bun calls it for every request **no route matched**,
  including a known path with an unsupported method (`PATCH /api/tasks`). We
  use it for static files and 404s.

Route parameters are typed. A handler for `/api/tasks/:id` receives a
`BunRequest<"/api/tasks/:id">`, whose `params` has exactly one property, `id`:

```ts
function getTask(req: BunRequest<"/api/tasks/:id">): Response {
  const id = parseTaskId(req.params.id); // req.params.idd would be a compile error
  ...
}
```

The parameter is always a **string**, because it comes from the URL. Turning it
into a number is validation (next section).

### Validating untrusted input

TypeScript types are erased when the code runs. If a client posts
`{ "title": 42 }`, nothing in `CreateTaskBody` stops it. Every value that comes
from outside the program must be checked at runtime.

The pattern used in `validation.ts`:

1. Treat incoming data as `unknown` (`readJson` returns `Promise<unknown>`).
2. Check its structure step by step. Each check **narrows** the type.
3. Return a correctly typed value, or `null` when the data is invalid.

```ts
export function parseCreateTaskBody(body: unknown): CreateTaskBody | null {
  if (!isRecord(body)) return null;              // now: Record<string, unknown>

  const title = nonEmptyString(body.title);      // string | null
  const description = nonEmptyString(body.description);
  if (title === null || description === null) return null;

  return { title, description };                 // CreateTaskBody
}
```

`isRecord` and `isTaskStatus` are **type guards**: functions whose return type
has the form `value is SomeType`. When a guard returns `true`, TypeScript treats
the value as that type in the calling code.

The handler then has two clear paths:

```ts
const body = parseCreateTaskBody(await readJson(req));
if (!body) {
  return fail("Invalid body. Expected { title: string, description: string }", 400);
}
// from here on, body is CreateTaskBody
```

Ids are validated too: `parseTaskId` accepts only positive whole numbers, so
`/api/tasks/abc`, `/api/tasks/1.5` and `/api/tasks/-3` all get `400 Bad Request`
instead of an unhelpful `404`.

### A better response type: discriminated unions

Week 1's `ApiResponse<T>` had optional `data` and `error` fields. It allowed
`{ success: true, error: "?" }`, and code reading it had to check both fields.

This week's type makes the two cases separate:

```ts
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { message: string } };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
```

The `ok` property is the **discriminant**: its type is the literal `true` in one
variant and `false` in the other. Checking it narrows the union:

```ts
function show(result: ApiResult<Task>) {
  if (result.ok) {
    console.log(result.data.title);      // only ApiSuccess has `data`
  } else {
    console.error(result.error.message); // only ApiFailure has `error`
  }
}
```

The rest of the course uses this envelope for every API.

### Serving static files

`static.ts` maps a URL path to a file in `public/`:

```ts
const PUBLIC_DIR = path.resolve(import.meta.dir, "..", "public");

const filePath = path.resolve(PUBLIC_DIR, relativePath);
if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return null;  // traversal check

const file = Bun.file(filePath);
if (!(await file.exists())) return null;
return new Response(file);
```

- `import.meta.dir` is the directory of the current file, so the server finds
  `public/` regardless of the folder it was started from.
- `Bun.file(path)` is a lazy handle to a file. Passing it to `new Response()`
  streams the file to the client and sets `Content-Type` from the extension.
  (Last year's Deno version needed a hand-written extension → MIME table.)
- **Path traversal**: a request for `/../src/types.ts` must never return a file
  outside `public/`. Browsers and Bun's URL parser normalise most `..` segments
  already, but the explicit check makes the guarantee independent of how the
  path was produced. Never build file paths from user input without a check
  like this.

> **Bun bonus.** Bun can also serve front-ends through *HTML imports*:
> `import index from "../public/index.html"` and `routes: { "/": index }`. Bun
> then bundles the referenced scripts and stylesheets automatically. We use the
> same mechanism from week 3 for React. This week we serve the files by hand to
> see how static file serving works.

### The front-end: `fetch` from the browser

`public/app.js` is plain JavaScript; the browser runs it as written. One helper
handles every API call:

```js
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });

  if (res.status === 204) return null;     // DELETE: no body

  const payload = await res.json();
  if (!res.ok || !payload.ok) {
    throw new Error(payload?.error?.message ?? `Request failed with status ${res.status}`);
  }
  return payload.data;
}
```

Two details worth pointing out in the lecture:

- The paths are relative (`/api/tasks`), because the page and the API come from
  the **same origin** (`http://localhost:8000`). From week 4 on the front-end
  runs on a different port, and CORS becomes necessary.
- User data is inserted with `textContent`, never `innerHTML`. A task titled
  `<img src=x onerror=alert(1)>` is displayed as text instead of being executed.
  That is the first line of defence against cross-site scripting (XSS); week 11
  returns to security in depth.

### Tests against a real server

`tests/tasks.test.ts` starts the API on port `0`, which tells the operating
system to pick any free port, and then uses `fetch` like any client would:

```ts
beforeAll(() => {
  server = Bun.serve({ port: 0, routes, fetch: fallback });
  baseUrl = server.url.origin;
});
afterAll(() => server.stop(true));
```

`test.each` runs one test for each row of a table, which suits validation
tests well.

---

## Lecture walkthrough

1. Copy week 1 as the starting point. Move `Task` and `TaskStatus` into
   `src/types.ts`.
2. Add the request body types (`CreateTaskBody`, `UpdateTaskBody`) using `Pick`
   and `Omit`, and replace `ApiResponse<T>` with the `ApiResult<T>` union.
   Explain why the union is better.
3. Write `validation.ts`: `readJson`, `isTaskStatus`, `parseCreateTaskBody`,
   `parseUpdateTaskBody`, `parseTaskId`.
4. Write `router.ts`: the in-memory array, `ok`/`fail` helpers, one handler per
   endpoint, the `routes` table and the `fallback`. Test each endpoint with
   `curl` (below) before moving on.
5. Write `static.ts` and connect it in `fallback`. Demonstrate what the
   traversal check prevents.
6. Write `public/index.html`, `styles.css` and `app.js`. Open the page and use
   the browser's developer tools (Network tab) to watch the requests.
7. Run the tests.

### Trying the API with curl

```bash
# create
curl -i -X POST http://localhost:8000/api/tasks \
  -H "content-type: application/json" \
  -d '{"title":"Learn REST","description":"Methods and status codes"}'

# list, read one
curl http://localhost:8000/api/tasks
curl http://localhost:8000/api/tasks/1

# replace
curl -X PUT http://localhost:8000/api/tasks/1 \
  -H "content-type: application/json" \
  -d '{"title":"Learn REST","description":"Done!","status":"done"}'

# delete (prints the 204 status line)
curl -i -X DELETE http://localhost:8000/api/tasks/1

# errors
curl -i http://localhost:8000/api/tasks/abc                                  # 400
curl -i -X POST http://localhost:8000/api/tasks -d '{"title":""}'            # 400
curl -i http://localhost:8000/api/tasks/999                                  # 404
```

## Compared with last year's Deno version

- Routing uses Bun's `routes` table instead of a hand-written `handleApiRoute`
  function with `startsWith` checks. Route parameters come typed from Bun.
- Static files use `Bun.file`, which detects the content type itself.
- `--allow-read` is not needed: Bun does not have permission flags.
- Fixed: ids such as `1.5` and `-3` were accepted and gave confusing results;
  invalid JSON now gives `400`; `PUT` follows REST semantics.

## Exercises

1. Add `PATCH /api/tasks/:id` that accepts any subset of `title`,
   `description` and `status`. Use `Partial<UpdateTaskBody>` for the type. What
   should happen with an empty body `{}`?
2. Return `405 Method Not Allowed` (with an `Allow` header listing the
   supported methods) for `PATCH /api/tasks` instead of `404`. The test
   "an unsupported method on a known path falls through to the 404 fallback"
   checks the old behaviour: change it too.
3. Add query parameters to `GET /api/tasks`: `?status=done` filters,
   `?q=word` searches titles. Validate both.
4. Make the title editable in the front-end. Which request does the UI need to
   send?
5. Add a test for every new behaviour.

## Further reading

- [Bun: HTTP server routing](https://bun.sh/docs/runtime/http/routing)
- [Bun: File I/O](https://bun.sh/docs/runtime/file-io)
- [MDN: HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods)
- [MDN: HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status)
- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [OWASP: Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
