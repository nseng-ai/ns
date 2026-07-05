export const kernelSubpaths = ["cli", "command-io", "context", "pi-text-generation", "sdk"];

export function kernelSourceExportSubpath(subpath) {
	return `./kernel/${subpath}`;
}

export function kernelSourceExportTarget(subpath) {
	return `./src/kernel/${subpath}.ts`;
}

export function kernelPublishExportTarget(subpath) {
	return `./kernel/${subpath}.js`;
}

export function kernelBundleEntryName(subpath) {
	return `kernel/${subpath}`;
}

export function kernelSourceFileRelativePath(subpath) {
	return `src/kernel/${subpath}.ts`;
}

export function kernelPublishExports() {
	return Object.fromEntries(
		kernelSubpaths.map((subpath) => [
			kernelSourceExportSubpath(subpath),
			kernelPublishExportTarget(subpath),
		]),
	);
}

export function kernelSourceExports() {
	return Object.fromEntries(
		kernelSubpaths.map((subpath) => [
			kernelSourceExportSubpath(subpath),
			kernelSourceExportTarget(subpath),
		]),
	);
}
