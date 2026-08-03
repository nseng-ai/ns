#!/usr/bin/env node
import { createArtifactIdGenerator } from "../core/index.ts";
import { createGitplaneCliApp } from "./app.ts";
import { TrustedTypeScriptConfigGateway } from "./config-gateway.ts";
import { RealArtifactGateway } from "./real-artifact-gateway.ts";
const cwd = process.cwd();
const app = createGitplaneCliApp();
const artifactGateway = new RealArtifactGateway({ cwd });
process.exitCode = await app.run(process.argv.slice(2), {
	context: {
		artifactGateway,
		artifactIds: createArtifactIdGenerator({ clock: { now: () => new Date() } }),
		configGateway: new TrustedTypeScriptConfigGateway(),
		cwd,
	},
});
