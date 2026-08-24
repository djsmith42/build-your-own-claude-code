import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const execAsync = promisify(exec);

// Resolve a model-supplied path against the workspace. The model tends to send
// relative paths; we normalize so every tool agrees on what "src/app.js" means.
const resolvePath = (p) => path.resolve(config.workspace, p);

// Directories that are never worth walking into during list/search.
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__"]);

export const tools = [
  {
    name: "read_file",
    description:
      "Read a file from the workspace. Returns the contents with 1-based line numbers, " +
      "which you need in order to talk about specific lines. Read a file before editing it.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
      },
      required: ["path"],
    },
    async run({ path: p }) {
      const text = await fs.readFile(resolvePath(p), "utf8");
      return text
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(5)}\t${line}`)
        .join("\n");
    },
  },

  {
    name: "write_file",
    description:
      "Create a file, or overwrite one completely. Parent directories are created " +
      "automatically. For a change to an existing file, prefer edit_file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
        content: { type: "string", description: "The full contents to write." },
      },
      required: ["path", "content"],
    },
    async run({ path: p, content }) {
      const full = resolvePath(p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
      return `Wrote ${content.split("\n").length} lines to ${p}`;
    },
  },

  {
    name: "edit_file",
    description:
      "Replace an exact string in a file. `old_text` must appear exactly once — include " +
      "enough surrounding context to make it unique. This is the safest way to change code, " +
      "because a mismatch fails loudly instead of silently clobbering the file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
        old_text: { type: "string", description: "Exact text to find, including indentation." },
        new_text: { type: "string", description: "Text to replace it with." },
      },
      required: ["path", "old_text", "new_text"],
    },
    async run({ path: p, old_text, new_text }) {
      const full = resolvePath(p);
      const before = await fs.readFile(full, "utf8");
      const hits = before.split(old_text).length - 1;

      // Refusing an ambiguous edit is the single most valuable guardrail in the
      // harness. The error text is not for you — it is a prompt telling the
      // model how to retry successfully.
      if (hits === 0) throw new Error(`old_text not found in ${p}. Read the file and match it exactly.`);
      if (hits > 1) throw new Error(`old_text appears ${hits} times in ${p}. Add surrounding context to make it unique.`);

      await fs.writeFile(full, before.replace(old_text, new_text), "utf8");
      return `Edited ${p}`;
    },
  },

  {
    name: "list_files",
    description:
      "List files under a directory, recursively. Use this first to orient yourself " +
      "in an unfamiliar codebase. Skips node_modules, .git, and build output.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory relative to the workspace root. Defaults to '.'." },
      },
    },
    async run({ path: p = "." }) {
      const found = [];
      await walk(resolvePath(p), (file) => found.push(path.relative(config.workspace, file)));
      if (found.length === 0) return "No files found.";
      // Truncate rather than blow up the context window on a huge tree.
      const shown = found.slice(0, 200);
      return shown.join("\n") + (found.length > shown.length ? `\n… ${found.length - shown.length} more` : "");
    },
  },

  {
    name: "search_files",
    description:
      "Search file contents for a regular expression and return matching lines with " +
      "file:line prefixes. Use this to find where something is defined or used.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "A JavaScript regular expression." },
        path: { type: "string", description: "Directory to search. Defaults to '.'." },
      },
      required: ["pattern"],
    },
    async run({ pattern, path: p = "." }) {
      const re = new RegExp(pattern);
      const hits = [];
      await walk(resolvePath(p), async (file) => {
        if (hits.length >= 100) return;
        let text;
        try {
          text = await fs.readFile(file, "utf8");
        } catch {
          return; // binary or unreadable — skip
        }
        text.split("\n").forEach((line, i) => {
          if (hits.length < 100 && re.test(line)) {
            hits.push(`${path.relative(config.workspace, file)}:${i + 1}: ${line.trim().slice(0, 200)}`);
          }
        });
      });
      return hits.length ? hits.join("\n") : `No matches for /${pattern}/`;
    },
  },

  {
    name: "run_bash",
    description:
      "Run a shell command in the workspace and return its combined stdout and stderr. " +
      "Use it to run tests, install packages, use git, or anything else the other tools " +
      "do not cover.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run." },
      },
      required: ["command"],
    },
    async run({ command }) {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: config.workspace,
          timeout: 120_000,
          maxBuffer: 2_000_000,
        });
        return (stdout + stderr).trim() || "(no output)";
      } catch (err) {
        // A non-zero exit is information, not a crash. Hand the model the exit
        // code and the output so it can react — that is how it fixes its own
        // failing tests without you writing any retry logic.
        const out = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
        return `Exit code ${err.code ?? "?"}\n${out || err.message}`;
      }
    },
  },
];

// Index by name so the agent loop can dispatch in O(1).
const byName = new Map(tools.map((t) => [t.name, t]));

export async function executeTool(name, input) {
  const tool = byName.get(name);
  if (!tool) return { toolOutput: `No such tool: ${name}`, isError: true };
  try {
    return { toolOutput: await tool.run(input ?? {}), isError: false };
  } catch (err) {
    return { toolOutput: `Error: ${err.message}`, isError: true };
  }
}

// The tool definitions we send to the API — schema only, no `run`.
export const toolSchemas = tools.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
}));

// Recursive directory walk shared by list_files and search_files.
async function walk(dir, visit) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, visit);
    else await visit(full);
  }
}
