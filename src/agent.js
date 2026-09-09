import Anthropic from "@anthropic-ai/sdk";
import { runBashToolDef, runBash } from "./run-bash.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `
You are a coding agent running in a terminal, working in ${process.cwd()}.

All output should be appropriate for terminal display. No markdown. You can use terminal
color and font control codes.
`;

export function createAgent() {
  const contextArray = [];

  async function sendChatText(userText) {
    contextArray.push({ role: "user", content: userText });

    while (true) {
      process.stdout.write(`\x1b[35m\nAsking the LLM (context array length: ${contextArray.length})...\n`)
      const stream = client.messages.stream({
        model: 'claude-opus-5',
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        tools: [runBashToolDef],
        messages: contextArray,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
      });

      // First, display the LLM's thinking and text:
      let currentContentType = null;
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (currentContentType === null || event.delta.type != currentContentType) {
            switch (event.delta.type) {
              case 'thinking_delta': process.stdout.write(`\n\x1b[90mThinking: `); break; // gray
              case 'text_delta':     process.stdout.write(`\n\x1b[32m`); break; // green
            }
            currentContentType = event.delta.type;
          }
          switch (event.delta.type) {
            case 'thinking_delta':   process.stdout.write(event.delta.thinking); break;
            case 'text_delta':       process.stdout.write(event.delta.text);     break;
          }
        }
      }

      // Reset terminal
      process.stdout.write('\x1b[0m\n')

      const response = await stream.finalMessage();
      contextArray.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        return; // hand the keyboard back to the human
      }

      const toolUses = response.content.filter((b) => b.type === "tool_use");

      const toolResults = await Promise.all(
        toolUses.map(async (block) => {
          // Echo the command so the human can follow along, on one line.
          const command = String(block.input?.command ?? "").replace(/\s+/g, " ");
          process.stdout.write(
            `\x1b[33m⚒ \x1b[1mrun_bash\x1b[0m\x1b[2m ${command.slice(0, 120)}\x1b[0m\n`,
          );

          // run_bash is the only tool we offer, so anything else is the model
          // hallucinating a name
          const { output, isError } =
            block.name === runBashToolDef.name
              ? await runBash(block.input ?? {})
              : { output: `No such tool: ${block.name}. Use run_bash.`, isError: true };

          // Display the command's output:
          const lines = output.split("\n");
          const extra = lines.length - 4;
          process.stdout.write(
            (isError ? "\x1b[31m" : "\x1b[90m") +
            lines.slice(0, 4).map((l) => "    " + l).join("\n") +
            (extra > 0 ? `\n    … ${extra} more lines` : "") +
            "\x1b[0m\n",
          );

          return {
            type: "tool_result",
            tool_use_id: block.id, // ← the id ties result back to request
            content: output,
            is_error: isError,
          };
        }),
      );

      contextArray.push({ role: "user", content: toolResults });
    }
  }

  return {
    sendChatText,
    reset: () => (contextArray.length = 0),
  };
}
