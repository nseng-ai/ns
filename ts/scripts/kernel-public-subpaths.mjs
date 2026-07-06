export const kernelPublicSubpaths = ["cli", "command-io", "context", "pi-text-generation", "sdk"];

export function kernelPublicExportSubpath(subpath) {
	return `./${subpath}`;
}

export function kernelPublicExports() {
	return Object.fromEntries(
		kernelPublicSubpaths.map((subpath) => [kernelPublicExportSubpath(subpath), `./src/${kernelSourcePathForSubpath(subpath)}.ts`]),
	);
}

export function kernelSourcePathForSubpath(subpath) {
	const sourcePaths = {
		cli: "cli/index",
		"command-io": "runtime/command-io",
		context: "cli/context",
		"pi-text-generation": "runtime/pi-text-generation",
		sdk: "sdk/index",
	};
	const sourcePath = sourcePaths[subpath];
	if (sourcePath === undefined) throw new Error(`Unknown kernel public subpath: ${subpath}`);
	return sourcePath;
}
