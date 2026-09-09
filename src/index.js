import readline from "node:readline";
import { createAgent } from "./agent.js";

const userInput = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\x1b[34m\x1b[1mmini-claude› \x1b[0m", // blue, bold
});

userInput.prompt();

const agent = createAgent();
for await (const line of userInput) {
  const input = line.trim();
  if (input) {
    try {
      await agent.sendChatText(input);
    } catch (err) {
      process.stdout.write(`\x1b[31m✗ ${err.message}\x1b[0m\n\n`);
    }
  }

  userInput.prompt();
}

userInput.close();
