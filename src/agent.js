import Anthropic from "@anthropic-ai/sdk";
import { runBashToolDef, runBash } from "./run-bash.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `
You are a coding agent running in a terminal, working in ${process.cwd()}. 
Make output look good in a terminal (no markdown)
`.trim();

export function createAgent() {
  const contextArray = [];

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

       // TODO act on the response from the LLM
  }

  return {
    sendChatText
  }
}
