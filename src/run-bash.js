import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// The agent's workspace is simply the directory the process was started in.
const workspace = process.cwd();

// The tool definition we hand to the API. One tool is the whole toolbox: the
// model already knows cat, grep, find, sed and friends, so a shell is a
// complete file-editing and code-searching kit without any bespoke schemas.
export const runBashSchema = {
  name: "run_bash",
  description:
    "Run a shell command in the workspace and return its combined stdout and stderr. " +
    "This is your only tool, and it is enough: read files with cat or sed, explore with " +
    "ls and find, search with grep, change files with sed or a heredoc, and run tests, " +
    "git, or any other program the same way.",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
    },
    required: ["command"],
  },
};

// Run one command and return it the way the agent loop wants to report it:
// the text the model will see, plus whether to flag it as an error.
export async function runBash({ command }) {
  if (typeof command !== "string" || !command.trim()) {
    return { output: "run_bash requires a non-empty `command` string.", isError: true };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspace,
      timeout: 120_000,
      maxBuffer: 2_000_000,
    });
    return { output: (stdout + stderr).trim() || "(no output)", isError: false };
  } catch (err) {
    // A non-zero exit is information, not a crash. Hand the model the exit
    // code and the output so it can react — that is how it fixes its own
    // failing tests without you writing any retry logic.
    const out = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
    return { output: `Exit code ${err.code ?? "?"}\n${out || err.message}`, isError: false };
  }
}
