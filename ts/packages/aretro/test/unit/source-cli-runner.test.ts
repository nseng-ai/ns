import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { renderCliShim } from "../../../../scripts/render-cli-shim-core.ts";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const templatePath = fileURLToPath(
	new URL("../../../../scripts/source-cli-shim-template", import.meta.url),
);
const checkedInRunnerPath = join(repoRoot, "skills/branch-retro/scripts/aretro-run");

describe("aretro source CLI skill runner", () => {
	test("matches the checked-in runner rendered from the shared template", async () => {
		const result = renderCliShim({
			template: await readFile(templatePath, "utf8"),
			tool: "aretro",
			canonicalCheckout: "unused-for-script-checkout",
			cliRelPath: "ts/packages/aretro/src/cli.ts",
			installHint:
				"run from an sdl checkout with 'just ts-install' available, or install the TypeScript shim with 'just install-aretro'",
			fallbackMode: "script-checkout",
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;

		const checkedInRunner = await readFile(checkedInRunnerPath, "utf8");
		expect(result.rendered).toBe(checkedInRunner);
	});
});
