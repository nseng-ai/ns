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
		expect(await gateway.readDevelopmentOidcToken()).toEqual({
			type: "found",
			token: "env-token",
		});
	});

	test("reports a missing token by name with the pull guidance", async () => {
		const gateway = createRealDispatchLocalTokenGateway({
			env: {},
			envLocalPath: join(tmpdir(), "ns-dispatch-nonexistent", ".env.local"),
		});
		const result = await gateway.readDevelopmentOidcToken();

		expect(result.type).toBe("missing");
		if (result.type === "missing") {
			expect(result.detail).toContain("VERCEL_OIDC_TOKEN");
			expect(result.detail).toContain("vercel env pull");
		}
	});
});
