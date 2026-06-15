import fs from "fs";

export default function inspectorExtension(pi) {
  pi.on("tool_call", (event) => {
    fs.appendFileSync("/Users/schrockn/inspector.log", `toolName: ${event.toolName}, input: ${JSON.stringify(event.input)}\n`);
  });
}
