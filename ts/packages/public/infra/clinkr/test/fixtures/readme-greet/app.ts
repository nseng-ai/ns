// src/cli/app.ts
import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { readJsonInput } from "@nseng-ai/foundation/cli-runtime";

export async function app() {
  return createClinkrApp({
    name: "greet",
    commandDirectory: import.meta.dirname,
  });
}

if (import.meta.main) {
  const clinkr = await app();
  process.exitCode = await clinkr.run(process.argv.slice(2), { readJsonInput });
}