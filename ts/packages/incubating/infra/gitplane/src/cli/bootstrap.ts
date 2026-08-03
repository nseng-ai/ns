#!/usr/bin/env node
import { createArtifactIdGenerator } from "../core/index.ts";
import { createGitplaneCliApp } from "./app.ts";
import { NodeArtifactGateway } from "./node-artifact-gateway.ts";
const app = createGitplaneCliApp();
process.exitCode = await app.run(process.argv.slice(2), {
	context: {
		artifactGateway: new NodeArtifactGateway(),
		artifactIds: createArtifactIdGenerator({ clock: { now: () => new Date() } }),
	},
});
