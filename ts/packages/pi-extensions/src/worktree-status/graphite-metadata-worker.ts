import { parentPort } from "node:worker_threads";

import {
	graphiteMetadataWorkerRequestFromValue,
	loadGraphiteMetadataStatus,
	type GraphiteMetadataWorkerResponse,
} from "./graphite-metadata.ts";

const port = parentPort;
if (port !== null) {
	port.on("message", (data: unknown) => {
		port.postMessage(handleGraphiteMetadataWorkerMessage(data));
	});
}

function handleGraphiteMetadataWorkerMessage(data: unknown): GraphiteMetadataWorkerResponse {
	const request = graphiteMetadataWorkerRequestFromValue(data);
	if (request === undefined) return { type: "failure", message: "invalid graphite metadata request" };

	try {
		return {
			type: "success",
			status: loadGraphiteMetadataStatus(request.input),
		};
	} catch (error) {
		return {
			type: "failure",
			message: error instanceof Error ? error.message : "graphite metadata worker failed",
		};
	}
}
