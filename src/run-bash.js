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
  // TODO
}
