import readline from "node:readline";
import { createAgent } from "./agent.js";

const agent = createAgent();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\x1b[34m\x1b[1mmini-claude› \x1b[0m", // blue, bold
});

rl.prompt();

for await (const line of rl) {
  const input = line.trim();
  if (input) {
    try {
      await agent.sendChatText(input);
    } catch (err) {
      process.stdout.write(`\x1b[31m✗ ${err.message}\x1b[0m\n\n`);
    }
  }

  rl.prompt();
}

rl.close();
