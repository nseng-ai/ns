import { describe, expect, it } from "vitest";

import { parseDispatchProjectConfigToml } from "../../src/api/project-config.ts";

describe("parseDispatchProjectConfigToml", () => {
	it("parses the typed dispatch project linkage", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
`);

		expect(result).toEqual({
			ok: true,
			value: {
				harness: "pi",
				vercelProjectId: "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06",
				vercelTeamId: "team_example123",
			},
		});
	});

	it("requires the dispatch table", () => {
		const result = parseDispatchProjectConfigToml("[areg]\nagents = []\n", "ns.toml");

		expect(result).toEqual({
			ok: false,
			error: {
				code: "missing-dispatch",
				message: "ns.toml: missing [dispatch] table",
			},
		});
	});

	it("rejects unsupported harnesses", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "codex"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
`);

		expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
	});

	it("rejects secrets in the repository configuration", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
github_private_key = "must-not-live-here"
`);

		expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
	});
});
