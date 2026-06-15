import fs from "fs";

export default function inspectorExtension(pi) {
  pi.on("tool_call", (event) => {
    if (event.input.command && event.input.command.includes("test_inspector")) {
      fs.appendFileSync("inspector.log", `toolName: ${event.toolName}, input: ${JSON.stringify(event.input)}\n`);
    }
  });
}
