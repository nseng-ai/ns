# Source and test file templates

## Placeholders

- `<PROJECT_NAME>` -- project name

## Library entry

**Target path:** `src/index.ts`

```ts
/** <PROJECT_NAME> */

export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

**Target path:** `tests/index.test.ts`

```ts
import { expect, test } from "bun:test";
import { greet } from "../src/index.ts";

test("greet builds a greeting", () => {
  expect(greet("world")).toBe("Hello, world!");
});
```

## CLI entry point (only if `HAS_CLI` is yes)

**Target path:** `src/main.ts`

The shebang lets the `bin` mapping run the file directly via Bun. Exit codes are
set with `process.exitCode` (never `process.exit`) so buffered stdout flushes.

```ts
#!/usr/bin/env bun
/** <PROJECT_NAME> CLI entry point. */

import { greet } from "./index.ts";

const VERSION = "0.1.0";

function main(): void {
  const arg = process.argv[2] ?? "--help";

  switch (arg) {
    case "-V":
    case "--version":
      process.stdout.write(`<PROJECT_NAME> ${VERSION}\n`);
      return;
    case "-h":
    case "--help":
      process.stdout.write("Usage: <PROJECT_NAME> [--version | --help]\n");
      return;
    default:
      process.stderr.write(`${greet(arg)}\n`);
      process.exitCode = 1;
  }
}

main();
```

**Target path:** `tests/cli.test.ts`

```ts
import { expect, test } from "bun:test";

test("CLI prints its version", async () => {
  const proc = Bun.spawn(["bun", "src/main.ts", "--version"]);
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;

  expect(stdout).toContain("<PROJECT_NAME>");
  expect(code).toBe(0);
});
```
