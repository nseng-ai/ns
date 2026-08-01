import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";

/**
 * Real-loader evidence uses generated modules that append import facts to an
 * invocation-owned file. This avoids module-global counters in Vitest's shared
 * cache while observing actual Node module evaluation through the public app.
 */
test("public app operations import only the filesystem modules needed at each depth", async () => {
	const directory = await mkdtemp(path.join(import.meta.dirname, ".clinkr-app-lazy-"));
	const logPath = path.join(directory, "imports.log");
	try {
		await writeFixture(directory, logPath);
		const app = createClinkrApp({
			name: "lazy",
			commandDirectory: directory,
			completion: {},
		});
		expect(await imports(logPath)).toEqual([]);

		await runForCliTest(app, ["--help"]);
		expect([...(await imports(logPath))].sort()).toEqual(
			["root:metadata", "admin:group", "status:metadata", "root:command"].sort(),
		);

		await runForCliTest(app, ["admin", "--help"]);
		expect([...(await imports(logPath))].sort()).toEqual(
			[
				"root:metadata",
				"admin:group",
				"status:metadata",
				"root:command",
				"show:metadata",
				"remove:metadata",
				"deep:group",
			].sort(),
		);

		await runForCliTest(app, ["admin", "show", "--help"]);
		expect(await imports(logPath)).toContain("show:command");
		expect(await imports(logPath)).not.toContain("remove:command");
		expect(await imports(logPath)).not.toContain("leaf:metadata");

		await runForCliTest(app, ["admin", "show", "--json-schema"]);
		await app.complete({ words: ["admin", "show", ""] });
		expect((await imports(logPath)).filter((entry) => entry === "show:command")).toHaveLength(1);
		expect(await imports(logPath)).not.toContain("status:command");
		expect(await imports(logPath)).not.toContain("remove:command");
		expect(await imports(logPath)).not.toContain("leaf:metadata");

		expect(await runForCliTest(app, ["admin", "show"])).toMatchObject({ exitCode: 0 });
		expect(await imports(logPath)).not.toContain("status:command");
		expect(await imports(logPath)).not.toContain("remove:command");
		expect(await imports(logPath)).not.toContain("leaf:metadata");

		await runForCliTest(app, ["admin", "deep", "--help"]);
		expect(await imports(logPath)).toContain("leaf:metadata");
		expect(await imports(logPath)).not.toContain("leaf:command");
		expect(await runForCliTest(app, ["admin", "deep", "leaf"])).toMatchObject({ exitCode: 0 });
		expect(await imports(logPath)).toContain("leaf:command");
		expect(await imports(logPath)).not.toContain("status:command");
		expect(await imports(logPath)).not.toContain("remove:command");
	} finally {
		await rm(directory, { recursive: true });
	}
});

async function imports(logPath: string): Promise<readonly string[]> {
	try {
		return (await readFile(logPath, "utf8")).trim().split("\n").filter(Boolean);
	} catch (error) {
		if (isMissingFile(error)) return [];
		throw error;
	}
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function writeFixture(root: string, logPath: string): Promise<void> {
	const directories = [
		root,
		path.join(root, "status"),
		path.join(root, "admin"),
		path.join(root, "admin", "show"),
		path.join(root, "admin", "remove"),
		path.join(root, "admin", "deep"),
		path.join(root, "admin", "deep", "leaf"),
	];
	await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
	const marker = (name: string) =>
		`import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(logPath)}, ${JSON.stringify(`${name}\n`)});\n`;
	const metadata = (name: string) =>
		`${marker(`${name}:metadata`)}export function metadata() { return { description: ${JSON.stringify(`${name} command.`)} }; }\n`;
	const group = (name: string) =>
		`${marker(`${name}:group`)}export function group() { return { description: ${JSON.stringify(`${name} group.`)} }; }\n`;
	const command = (name: string) =>
		`${marker(`${name}:command`)}import { defineCommand, ok } from "@nseng-ai/clinkr/app";\nimport { z } from "zod";\nexport async function command() { return defineCommand({ schema: z.object({}), completionProvider: () => [{ value: "candidate", type: "positional-value" }], handler: async () => ok() }); }\n`;
	await Promise.all([
		writeFile(path.join(root, "metadata.ts"), metadata("root")),
		writeFile(path.join(root, "command.ts"), command("root")),
		writeFile(path.join(root, "status", "metadata.ts"), metadata("status")),
		writeFile(path.join(root, "status", "command.ts"), command("status")),
		writeFile(path.join(root, "admin", "group.ts"), group("admin")),
		writeFile(path.join(root, "admin", "show", "metadata.ts"), metadata("show")),
		writeFile(path.join(root, "admin", "show", "command.ts"), command("show")),
		writeFile(path.join(root, "admin", "remove", "metadata.ts"), metadata("remove")),
		writeFile(path.join(root, "admin", "remove", "command.ts"), command("remove")),
		writeFile(path.join(root, "admin", "deep", "group.ts"), group("deep")),
		writeFile(path.join(root, "admin", "deep", "leaf", "metadata.ts"), metadata("leaf")),
		writeFile(path.join(root, "admin", "deep", "leaf", "command.ts"), command("leaf")),
	]);
}
