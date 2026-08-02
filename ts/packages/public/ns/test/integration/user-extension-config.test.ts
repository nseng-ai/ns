import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { RealUserExtensionConfigGateway } from "../../src/init/real-user-extension-config.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ns-user-extension-config-"));
	roots.push(root);
	return root;
}

describe("RealUserExtensionConfigGateway", () => {
	it("uses explicit XDG_CONFIG_HOME and creates the missing ns config atomically", async () => {
		const root = await tempRoot();
		const xdg = join(root, "config");
		const gateway = new RealUserExtensionConfigGateway({ env: { XDG_CONFIG_HOME: xdg } });
		await expect(gateway.read()).resolves.toMatchObject({
			type: "missing",
			configPath: join(xdg, "ns", "ns.toml"),
		});
		await expect(
			gateway.compareAndWrite({
				expected: { type: "missing" },
				content: 'extensions = ["/work/tools"]\n',
			}),
		).resolves.toEqual({ ok: true });
		await expect(readFile(join(xdg, "ns", "ns.toml"), "utf8")).resolves.toBe(
			'extensions = ["/work/tools"]\n',
		);
	});

	it("replaces an existing file from position zero and truncates trailing bytes", async () => {
		const root = await tempRoot();
		const configDir = join(root, ".config", "ns");
		const configPath = join(configDir, "ns.toml");
		await mkdir(configDir, { recursive: true });
		await writeFile(configPath, "0123456789-long-tail\n", "utf8");
		const gateway = new RealUserExtensionConfigGateway({ env: {}, homeDir: root });
		await expect(
			gateway.compareAndWrite({
				expected: { type: "file", content: "0123456789-long-tail\n" },
				content: "new\n",
			}),
		).resolves.toEqual({ ok: true });
		await expect(readFile(configPath, "utf8")).resolves.toBe("new\n");
	});

	it("uses the HOME fallback and refuses stale prepared content", async () => {
		const root = await tempRoot();
		const configDir = join(root, ".config", "ns");
		const configPath = join(configDir, "ns.toml");
		await mkdir(configDir, { recursive: true });
		await writeFile(configPath, "# original\r\n", "utf8");
		const gateway = new RealUserExtensionConfigGateway({ env: {}, homeDir: root });
		const prepared = await gateway.read();
		expect(prepared).toMatchObject({ type: "file", configPath, content: "# original\r\n" });
		await writeFile(configPath, "# concurrent\r\n", "utf8");
		await expect(
			gateway.compareAndWrite({
				expected: { type: "file", content: "# original\r\n" },
				content: "changed",
			}),
		).resolves.toMatchObject({ ok: false, error: { code: "user-config-prepared-state-mismatch" } });
		await expect(readFile(configPath, "utf8")).resolves.toBe("# concurrent\r\n");
	});
});
