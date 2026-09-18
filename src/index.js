import readline from "node:readline";

const userInput = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\x1b[34m\x1b[1mmini-claude› \x1b[0m", // blue, bold
});

userInput.prompt();

for await (const line of userInput) {
  // TODO Handle user input
}

userInput.close();
