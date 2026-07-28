import { describe, expect, test } from "vitest";

import {
	createNodeRepositoryTrunkConfigLoader,
	createRepositoryTrunkConfigLoader,
} from "@nseng-ai/extension-kit/repository-trunk";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

describe("repository trunk config adapter", () => {
	test("defaults a missing ns.toml to origin", () => {
		const loader = createRepositoryTrunkConfigLoader(projectConfig({ type: "missing" }));
		expect(loader.load("/repo")).toEqual({ ok: true, value: { remote: "origin" } });
	});

	test("loads configured remote and literal slash trunk", () => {
		const reads: string[] = [];
		const loader = createRepositoryTrunkConfigLoader(
			projectConfig(
				{
					type: "found",
					text: '[git]\nremote = "company"\ntrunk = "release/stable"',
				},
				reads,
			),
		);
		expect(loader.load("/repo")).toEqual({
			ok: true,
			value: { remote: "company", trunk: "release/stable" },
		});
		expect(reads).toEqual(["/repo/ns.toml"]);
	});

	test("classifies read failures", () => {
		const loader = createRepositoryTrunkConfigLoader(
			projectConfig({ type: "error", message: "permission denied" }),
		);
		expect(loader.load("/repo")).toEqual({
			ok: false,
			error: {
				code: "config-read-failed",
				message: "Failed to read ns.toml: permission denied",
			},
		});
	});

	test.each([
		["invalid TOML", "[git"],
		["scalar table", 'git = "origin"'],
		["empty remote", '[git]\nremote = "  "'],
		["non-string trunk", "[git]\ntrunk = 42"],
		["unknown key", "[git]\nextra = true"],
	])("classifies %s as invalid config", (_name, source) => {
		const loader = createRepositoryTrunkConfigLoader(
			projectConfig({ type: "found", text: source }),
		);
		expect(loader.load("/repo")).toMatchObject({
			ok: false,
			error: { code: "config-invalid" },
		});
	});

	test("exposes a real node loader factory", () => {
		expect(createNodeRepositoryTrunkConfigLoader()).toMatchObject({ load: expect.any(Function) });
	});
});

function projectConfig(
	readResult: ReturnType<ProjectConfigGateway["readTextFile"]>,
	reads: string[] = [],
): ProjectConfigGateway {
	return {
		readTextFile(request) {
			reads.push(`${request.repoRoot}/${request.relativePath}`);
			return readResult;
		},
		pathExists: () => ({ type: "missing" }),
	};
}
