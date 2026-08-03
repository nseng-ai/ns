#!/usr/bin/env node
import { createArtifactIdGenerator } from "../core/index.ts";
import { createGitplaneCliApp } from "./app.ts";
import { TrustedTypeScriptConfigGateway } from "./config-gateway.ts";
import { RealArtifactGateway } from "./real-artifact-gateway.ts";
const cwd = process.cwd();
const app = createGitplaneCliApp();
process.exitCode = await app.run(process.argv.slice(2), {
	context: {
		artifactGateway: new RealArtifactGateway({ cwd }),
		artifactIds: createArtifactIdGenerator({ clock: { now: () => new Date() } }),
		configGateway: new TrustedTypeScriptConfigGateway(),
		corpusCheckGateway: new RealArtifactGateway({ cwd }),
		cwd,
	},
});
