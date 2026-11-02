// Acceptance checks for one submission (AWA 2026 CodeGrade, same file every week).
//
//   bun gate/gate.ts <submission-dir> [--upload-scan <file>]
//   bun gate/gate.ts --scan-upload <submission-dir> <file>
//
// Run by prepare-submission.sh after `bun install`, in the prepared submission
// directory (the grading tests' node_modules at its top level). The checks are
// listed in gate/config.json next to this file:
//
//   typecheck     tsc --noEmit over a project with the COURSE's tsconfig
//                 (gate/tsconfig/<project>.json), not the student's own copy.
//   dependencies  the project's package.json may only name packages that the
//                 lecture app already uses (no Express, Vite, ORM, ...).
//   files         the files the tests need (config "required") exist, and the
//                 upload contained no node_modules/, .git/, dist/, .env or the
//                 week's other "notUploaded" folders. prepare-submission.sh
//                 records the upload with --scan-upload BEFORE it cleans up;
//                 a local run (no scan file) only checks the required files.
//   forbidden     a pattern that must not appear in the code. Comments are
//                 removed first (Bun.Transpiler), so explaining a rule in a
//                 comment never fails it.
//
// Results go to <submission>/.awa-gate/: report.txt (shown to the student by
// `run-task.sh gate`), report.xml (JUnit, one test case per check) and, when a
// check failed, the marker file `failed`. run-task.sh refuses to grade a task
// while `failed` exists, so a failed check gives 0 points for the whole week.
// Students can run the same checks locally: `bun gate/gate.ts .`
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

type Project = { dir: string; tsconfig?: string; allowedPackages?: string[] };
type Forbidden = { name: string; files: string[]; pattern: string; flags?: string; message: string };
type Config = {
  week: string;
  projects: Project[];
  forbidden?: Forbidden[];
  required?: string[];
  notUploaded?: string[];
};
type Result = { name: string; ok: boolean; details: string };

const GATE_DIR = import.meta.dir;
const config = JSON.parse(readFileSync(path.join(GATE_DIR, "config.json"), "utf8")) as Config;
const results: Result[] = [];

// Everything in the upload that must not be there, as paths relative to the
// submission. __MACOSX/ and .DS_Store (added by macOS when zipping) are ignored.
function scanUpload(root: string): string[] {
  const found: string[] = [];
  const extra = config.notUploaded ?? [];
  const walk = (rel: string) => {
    for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.name === "__MACOSX") continue;
      if (e.isDirectory()) {
        if (["node_modules", ".git", "dist"].includes(e.name) || extra.some((x) => p === x || p.endsWith(`/${x}`))) {
          found.push(`${p}/`);
        } else {
          walk(p);
        }
      } else if (/^\.env(\..+)?$/.test(e.name) && !/^\.env\.(example|sample)$/.test(e.name)) {
        found.push(p);
      }
    }
  };
  walk("");
  return found.sort();
}

if (process.argv[2] === "--scan-upload") {
  const root = path.resolve(process.argv[3] ?? ".");
  writeFileSync(path.resolve(process.argv[4]!), JSON.stringify({ found: scanUpload(root) }) + "\n");
  process.exit(0);
}

const SUB = path.resolve(process.argv[2] ?? ".");
const scanArg = process.argv.indexOf("--upload-scan");
const SCAN_FILE = scanArg > 0 ? process.argv[scanArg + 1] : undefined;

function requiredFiles(): Result {
  const name = "Submission files: everything the tests need is there";
  const missing = (config.required ?? []).filter((f) => !existsSync(path.join(SUB, f)));
  if (missing.length === 0) return { name, ok: true, details: "All required files found." };
  return {
    name,
    ok: false,
    details:
      `Missing: ${missing.join(", ")}.\n` +
      "Check the folder structure in \"What to submit\": the project folders must be at the top level of the zip, " +
      "and these files must keep their names and places.",
  };
}

function uploadContents(): Result {
  const name = "Submission files: no node_modules, .git, dist or .env in the zip";
  if (!SCAN_FILE) {
    return { name, ok: true, details: "Not checked locally (your folder needs node_modules to run). CodeGrade checks the uploaded zip." };
  }
  const found = (JSON.parse(readFileSync(SCAN_FILE, "utf8")) as { found: string[] }).found;
  if (found.length === 0) return { name, ok: true, details: "Nothing that must not be uploaded." };
  const shown = found.slice(0, 20).join(", ") + (found.length > 20 ? `, … ${found.length - 20} more` : "");
  return {
    name,
    ok: false,
    details:
      `The zip contains: ${shown}.\n` +
      "Zip only your source files: leave out node_modules/ (bun install recreates it), .git/, build output (dist/) " +
      "and .env files (they hold secrets). Then submit again.",
  };
}

function typecheck(p: Project): Result {
  const name = `Type check: ${p.dir} (tsc --noEmit with the course's tsconfig)`;
  const projectDir = path.join(SUB, p.dir);
  const tsc = path.join(SUB, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) return { name, ok: false, details: "TypeScript is not installed in the grader (bun install did not run)." };
  const tmp = path.join(projectDir, "tsconfig.awa-gate.json");
  copyFileSync(path.join(GATE_DIR, p.tsconfig!), tmp);
  try {
    const out = Bun.spawnSync([process.execPath, tsc, "-p", tmp, "--noEmit", "--pretty", "false"], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const log = (out.stdout.toString() + out.stderr.toString()).trim();
    if (out.exitCode === 0) return { name, ok: true, details: "No type errors." };
    const lines = log.split("\n");
    const shown = lines.slice(0, 40).join("\n") + (lines.length > 40 ? `\n… ${lines.length - 40} more lines` : "");
    return { name, ok: false, details: `tsc reports type errors. Run \`bun run typecheck\` in ${p.dir}/ and fix them:\n${shown}` };
  } finally {
    rmSync(tmp, { force: true });
  }
}

function dependencies(p: Project): Result {
  const name = `Dependencies: ${p.dir}/package.json adds no packages`;
  const file = path.join(SUB, p.dir, "package.json");
  if (!existsSync(file)) return { name, ok: true, details: "No package.json uploaded (the course's dependencies are used)." };
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { name, ok: false, details: `${p.dir}/package.json is not valid JSON: ${(e as Error).message}` };
  }
  const names = new Set<string>();
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const section = pkg[key];
    if (section && typeof section === "object") for (const n of Object.keys(section)) names.add(n);
  }
  const allowed = new Set(p.allowedPackages ?? []);
  const extra = [...names].filter((n) => !allowed.has(n)).sort();
  if (extra.length === 0) return { name, ok: true, details: "Only the lecture app's packages are used." };
  return {
    name,
    ok: false,
    details:
      `Packages that the exercise does not allow: ${extra.join(", ")}.\n` +
      `Allowed in ${p.dir}: ${[...allowed].sort().join(", ") || "(none)"}. Remove the others and the code that uses them.`,
  };
}

function loaderFor(file: string): "ts" | "tsx" | "js" | "jsx" {
  const ext = path.extname(file).slice(1);
  return ext === "tsx" || ext === "jsx" || ext === "js" ? ext : "ts";
}

function forbidden(f: Forbidden): Result {
  const name = `Code rule: ${f.name}`;
  const re = new RegExp(f.pattern, f.flags ?? "");
  const hits: string[] = [];
  for (const pattern of f.files) {
    for (const rel of new Bun.Glob(pattern).scanSync({ cwd: SUB, onlyFiles: true })) {
      if (rel.includes("node_modules/")) continue;
      const source = readFileSync(path.join(SUB, rel), "utf8");
      let code: string;
      try {
        code = new Bun.Transpiler({ loader: loaderFor(rel), trimUnusedImports: false }).transformSync(source);
      } catch {
        code = source; // a syntax error is reported by the type check and the tests
      }
      if (re.test(code)) hits.push(rel);
    }
  }
  if (hits.length === 0) return { name, ok: true, details: "Not found." };
  return { name, ok: false, details: `${f.message}\nFound in: ${hits.sort().join(", ")}` };
}

results.push(requiredFiles(), uploadContents());
for (const p of config.projects) {
  if (!existsSync(path.join(SUB, p.dir))) {
    results.push({ name: `Project folder ${p.dir}/`, ok: false, details: `Missing folder ${p.dir}/ at the top level of the submission.` });
    continue;
  }
  if (p.allowedPackages) results.push(dependencies(p));
  if (p.tsconfig) results.push(typecheck(p));
}
for (const f of config.forbidden ?? []) results.push(forbidden(f));

const failed = results.filter((r) => !r.ok);
const out = path.join(SUB, ".awa-gate");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const text = [
  `Acceptance checks, ${config.week}: ${failed.length === 0 ? "all passed" : `${failed.length} of ${results.length} FAILED`}`,
  failed.length === 0
    ? "Your tasks are graded by the tests."
    : "Every check must pass before any task is graded: this submission scores 0 until they do.",
  "",
  ...results.map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.name}\n${r.details.replace(/^/gm, "       ")}`),
  "",
].join("\n");
writeFileSync(path.join(out, "report.txt"), text);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cases = results
  .map((r) =>
    r.ok
      ? `    <testcase name="${esc(r.name)}" classname="Acceptance checks"/>`
      : `    <testcase name="${esc(r.name)}" classname="Acceptance checks">\n      <failure message="${esc(r.details.split("\n")[0]!)}" type="AcceptanceCheck">${esc(r.details)}</failure>\n    </testcase>`,
  )
  .join("\n");
writeFileSync(
  path.join(out, "report.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="Acceptance checks" tests="${results.length}" failures="${failed.length}">\n` +
    `  <testsuite name="Acceptance checks" tests="${results.length}" failures="${failed.length}">\n${cases}\n  </testsuite>\n</testsuites>\n`,
);
if (failed.length > 0) writeFileSync(path.join(out, "failed"), `${failed.length}\n`);

console.log(text);
process.exit(failed.length === 0 ? 0 : 1);
