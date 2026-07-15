import { describe, expect, it } from "vitest";

import {
	DEFAULT_DISPATCH_ANCHOR_TIME_ZONE,
	dispatchHarnessValues,
	parseDispatchProjectConfigToml,
} from "../../src/api/index.ts";

describe("parseDispatchProjectConfigToml", () => {
	it("publishes only registry-implemented harness values", () => {
		expect(dispatchHarnessValues).toEqual(["pi"]);
	});

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
				anchorTimeZone: DEFAULT_DISPATCH_ANCHOR_TIME_ZONE,
			},
		});
	});

	it("parses and canonicalizes an explicit anchor timezone", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
anchor_timezone = "Etc/UTC"
`);

		expect(result).toMatchObject({
			ok: true,
			value: { anchorTimeZone: "UTC" },
		});
	});

	it("rejects an invalid anchor timezone", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
anchor_timezone = "Pacific/Definitely_Not_A_Zone"
`);

		expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
	});

	it("parses the optional deployment and workflow dashboard URLs", () => {
		const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
workflow_dashboard_url = "https://vercel.com/example-team/ns-dispatch/workflows"
deployment_url = "https://ns-dispatch.vercel.app"
`);

		expect(result).toMatchObject({
			ok: true,
			value: {
				deploymentUrl: "https://ns-dispatch.vercel.app",
				workflowDashboardUrl: "https://vercel.com/example-team/ns-dispatch/workflows",
			},
		});
	});

	it("rejects invalid workflow dashboard URLs", () => {
		for (const url of [
			"http://vercel.com/example-team/ns-dispatch/workflows",
			"https://vercel.com/example-team/ns-dispatch",
			"https://vercel.com/example-team/ns-dispatch/workflows?environment=preview",
		]) {
			const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
workflow_dashboard_url = "${url}"
`);

			expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
		}
	});

	it("rejects non-HTTPS or credentialed deployment URLs", () => {
		for (const url of ["http://ns-dispatch.vercel.app", "https://user:pw@ns-dispatch.vercel.app"]) {
			const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "pi"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
deployment_url = "${url}"
`);

			expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
		}
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

	it.each(["claude-code", "codex", "arbitrary"])(
		"rejects registry-unsupported harness %s",
		(harness) => {
			const result = parseDispatchProjectConfigToml(`
[dispatch]
harness = "${harness}"
vercel_project_id = "prj_mxMd0ac1GvXSBkcuevA5jVn7GU06"
vercel_team_id = "team_example123"
`);

			expect(result).toMatchObject({ ok: false, error: { code: "invalid-dispatch" } });
		},
	);

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
