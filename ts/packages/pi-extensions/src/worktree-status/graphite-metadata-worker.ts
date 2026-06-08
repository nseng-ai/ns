import {
	graphiteMetadataWorkerRequestFromValue,
	loadGraphiteMetadataStatus,
	type GraphiteMetadataWorkerResponse,
} from "./graphite-metadata.ts";

declare const self: {
	onmessage: ((event: { data: unknown }) => void) | null;
	postMessage(message: GraphiteMetadataWorkerResponse): void;
};

self.onmessage = (event) => {
	const request = graphiteMetadataWorkerRequestFromValue(event.data);
	if (request === undefined) {
		self.postMessage({ type: "failure", message: "invalid graphite metadata request" });
		return;
	}

	try {
		self.postMessage({
			type: "success",
			status: loadGraphiteMetadataStatus(request.input),
		});
	} catch (error) {
		self.postMessage({
			type: "failure",
			message: error instanceof Error ? error.message : "graphite metadata worker failed",
		});
	}
};
