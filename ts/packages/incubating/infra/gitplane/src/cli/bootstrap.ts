#!/usr/bin/env node
import { createArtifactIdGenerator } from "../core/index.ts";
import { createGitplaneCliApp } from "./app.ts";
import { TrustedTypeScriptConfigLoader } from "./config-loader.ts";
import { RealArtifactGateway } from "./real-artifact-gateway.ts";
const cwd = process.cwd();
const app = createGitplaneCliApp();
process.exitCode = await app.run(process.argv.slice(2), {
	context: {
		artifactGateway: new RealArtifactGateway({ cwd }),
		artifactIds: createArtifactIdGenerator({ clock: { now: () => new Date() } }),
		configLoader: new TrustedTypeScriptConfigLoader(),
		cwd,
	},
});
