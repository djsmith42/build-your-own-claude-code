import Anthropic from "@anthropic-ai/sdk";
import { runBashToolDef, runBash } from "./run-bash.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `
You are a coding agent running in a terminal, working in ${process.cwd()}. 
Make output look good in a terminal (no markdown)
`.trim();

export function createAgent() {
  const contextArray = [];
  let loopCount = 0;

  async function sendChatText(userText) {
    contextArray.push({ role: "user", content: userText });

    while (true) {
      loopCount++
      process.stdout.write(`\x1b[35m\n[Loop ${loopCount}] Context array length: ${contextArray.length}\n`)
      const stream = client.messages.stream({
        model: 'claude-opus-5',
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        tools: [runBashToolDef],
        messages: contextArray,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
      })

      await displayThinking(stream)

      const response = await stream.finalMessage()
      contextArray.push({ role: "assistant", content: response.content })

      if (response.stop_reason === "end_turn") {
        return; // hand the keyboard back to the human
      }

      // Run tools:
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (toolUses.length > 0) {
        const toolResults = await runTools(toolUses);
        contextArray.push({ role: "user", content: toolResults });
      }
    }
  }

  async function runTools(toolUses) {
    return await Promise.all(
      toolUses.map(async (block) => {

        // display the command to run:
        const command = String(block.input?.command ?? "").replace(/\s+/g, " ");
        process.stdout.write(
          `\x1b[33m⚒ \x1b[1mrun_bash\x1b[0m\x1b[2m ${command.slice(0, 120)}\x1b[0m\n`,
        );

        // run the command:
        const { output, isError } = await runBash(block.input ?? {})

        // display the command's output (first 5 lines only)
        const lines = output.split("\n");
        const extra = lines.length - 5;
        process.stdout.write(
          (isError ? "\x1b[31m" : "\x1b[90m") +
          lines.slice(0, 4).map((l) => "    " + l).join("\n") +
          (extra > 0 ? `\n    … ${extra} more lines` : "") +
          "\x1b[0m\n",
        );

        return {
          type: "tool_result",
          tool_use_id: block.id, // the LLM needs the id to map the result back to its tool request
          content: output,
          is_error: isError,
        }
      })
    )
  }

  async function displayThinking(stream) {
    let currentContentType = null;
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (currentContentType === null || event.delta.type != currentContentType) {
          switch (event.delta.type) {
            case 'thinking_delta': process.stdout.write(`\n\x1b[90mThinking: `); break; // gray
            case 'text_delta':     process.stdout.write(`\n\x1b[32m`);           break; // green
          }
          currentContentType = event.delta.type;
        }
        switch (event.delta.type) {
          case 'thinking_delta':   process.stdout.write(event.delta.thinking); break;
          case 'text_delta':       process.stdout.write(event.delta.text);     break;
        }
      }
    }
    process.stdout.write('\x1b[0m\n')
  }

  return {
    sendChatText
  }
}
