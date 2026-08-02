import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { TrustedTypeScriptConfigGateway } from "@nseng-ai/gitplane/cli";

test("loads a real TypeScript config and retains normal Node module caching", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-config-"));
	try {
		await mkdir(path.join(directory, "artifacts"));
		const configPath = path.join(directory, "gitplane.config.ts");
		await writeFile(
			configPath,
			`import { existsSync, readFileSync, writeFileSync } from "node:fs";
const counterPath = ${JSON.stringify(path.join(directory, "loads.txt"))};
const count = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) + 1 : 1;
writeFileSync(counterPath, String(count));
export default { source: { id: "real-source-" + count, artifactRoot: "artifacts" }, store: () => { throw new Error("must not construct the store while loading"); } };
`,
		);
		const gateway = new TrustedTypeScriptConfigGateway();
		const first = await gateway.load({ cwd: directory });
		const second = await gateway.load({ cwd: directory });
		expect(first).toMatchObject({
			ok: true,
			config: { source: { id: "real-source-1", artifactRoot: "artifacts" } },
		});
		expect(second).toEqual(first);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
