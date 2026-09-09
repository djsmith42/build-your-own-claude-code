import { exec } from "node:child_process";
import { promisify } from "node:util";

const cwd = process.cwd();

export const runBashToolDef = {
  name: "run_bash",
  description: "Run a shell command in the current working directory and return its combined stdout and stderr.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to run."
      },
    },
    required: [
      "command"
    ],
  },
};

export async function runBash({ command }) {
  try {
    const { stdout, stderr } = await promisify(exec)(command, {cwd});
    return {
      output: (stdout + stderr).trim() || "(no output)",
      isError: false
    };
  } catch (err) {
    const out = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
    return {
      output: `Exit code ${err.code ?? "?"}\n${out || err.message}`,
      isError: true
    };
  }
}
