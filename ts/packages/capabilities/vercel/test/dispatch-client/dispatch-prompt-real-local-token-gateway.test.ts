import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	createRealDispatchLocalTokenGateway,
	parseEnvFileValue,
} from "../../src/dispatch-client/real-local-token-gateway.ts";

describe("local token env-file parser", () => {
	test("reads one named value from env-file content without touching others", () => {
		const content = 'OTHER="x"\nVERCEL_OIDC_TOKEN="abc.def"\nMORE=y\n';
		expect(parseEnvFileValue(content, "VERCEL_OIDC_TOKEN")).toBe("abc.def");
		expect(parseEnvFileValue("VERCEL_OIDC_TOKEN=raw-value\n", "VERCEL_OIDC_TOKEN")).toBe(
			"raw-value",
		);
		expect(parseEnvFileValue("", "VERCEL_OIDC_TOKEN")).toBeNull();
	});
});

describe("real local token gateway", () => {
	test("prefers the process environment value by name", async () => {
		const gateway = createRealDispatchLocalTokenGateway({
			env: { VERCEL_OIDC_TOKEN: "env-token" },
		});
		expect(await gateway.readDevelopmentOidcToken({ repoRoot: "/repo" })).toEqual({
			type: "found",
			token: "env-token",
		});
	});

	test("reads the Development token from the repository-root .env.local", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-dispatch-repo-"));
		try {
			await writeFile(join(repoRoot, ".env.local"), 'VERCEL_OIDC_TOKEN="repo-token"\n');
			const gateway = createRealDispatchLocalTokenGateway({ env: {} });

			expect(await gateway.readDevelopmentOidcToken({ repoRoot })).toEqual({
				type: "found",
				token: "repo-token",
			});
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	test("reports a missing token by name with repository-root pull guidance", async () => {
		const repoRoot = join(tmpdir(), "ns-dispatch-nonexistent");
		const gateway = createRealDispatchLocalTokenGateway({ env: {} });
		const result = await gateway.readDevelopmentOidcToken({ repoRoot });

		expect(result.type).toBe("missing");
		if (result.type === "missing") {
			expect(result.detail).toContain("VERCEL_OIDC_TOKEN");
			expect(result.detail).toContain(join(repoRoot, ".env.local"));
			expect(result.detail).toContain("repository root");
			expect(result.detail).toContain("vercel env pull");
		}
	});
});
