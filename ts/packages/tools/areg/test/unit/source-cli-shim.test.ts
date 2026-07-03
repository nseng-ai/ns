import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { renderCliShim } from "../../../../../scripts/render-cli-shim-core.ts";

import { CLI_REL_PATH } from "../support/cli-rel-path.ts";

const templatePath = fileURLToPath(
	new URL("../../../../../scripts/source-cli-shim-template", import.meta.url),
);

async function readTemplate(): Promise<string> {
	return await readFile(templatePath, "utf8");
}

describe("areg source CLI shim rendering", () => {
	test("renders adversarial canonical checkout paths as shell literals", async () => {
		const canonicalCheckout = "/tmp/checkout with spaces & pipes | back\\slash ' quote";
		const installHint = "just install-areg or just install-tools";

		const result = renderCliShim({
			template: await readTemplate(),
			tool: "areg",
			canonicalCheckout,
			cliRelPath: CLI_REL_PATH,
			installHint,
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;

		expect(result.rendered).not.toContain("@@JI_");
		expect(result.rendered).toContain("tool=areg\n");
		expect(result.rendered).toContain("fallback_mode=literal\n");
		expect(result.rendered).toContain(`cli_rel_path=${CLI_REL_PATH}\n`);
		expect(result.rendered).toContain("no sdl checkout found");
		expect(result.rendered).not.toContain("no asdl checkout found");
		expect(result.rendered).not.toContain("ts/packages/areg/src/cli.ts");
		expect(result.rendered).toContain("canonical_checkout='");
		expect(result.rendered).toContain("'\\''");
		expect(result.rendered).not.toContain(`canonical_checkout=${canonicalCheckout}\n`);
	});

	test("rejects unknown fallback modes", async () => {
		const result = renderCliShim({
			template: await readTemplate(),
			tool: "areg",
			canonicalCheckout: "/tmp/ji",
			cliRelPath: CLI_REL_PATH,
			installHint: "just install-areg",
			fallbackMode: "surprise",
		});

		expect(result.type).toBe("failure");
		expect(result).toMatchObject({ exitCode: 2 });
		if (result.type !== "failure") return;
		expect(result.message).toContain("invalid JI_FALLBACK_MODE 'surprise'");
		expect(result.message).toContain("literal, script-checkout");
	});
});
