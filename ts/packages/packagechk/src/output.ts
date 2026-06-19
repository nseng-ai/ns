import {
	reportExitCode,
	reportToJson,
	type PackageCheckReport,
	type RegistryCheckResult,
} from "./models.ts";

export function renderJson(report: PackageCheckReport): string {
	return JSON.stringify(sortJsonValue(reportToJson(report)));
}

export function renderHuman(report: PackageCheckReport): string {
	return report.results.map(renderResult).join("\n");
}

function renderResult(result: RegistryCheckResult): string {
	const lookupSuffix =
		result.lookupName === result.inputName
			? ""
			: ` as ${JSON.stringify(result.lookupName).replaceAll('"', "'")}`;
	if (result.status === "available") return `${result.registry}: available${lookupSuffix}`;
	if (result.status === "taken") {
		const details = [`${result.registry}: taken${lookupSuffix}`];
		if (result.latestVersion !== undefined) details.push(`latest ${result.latestVersion}`);
		if (result.description !== undefined) details.push(result.description);
		if (result.packageUrl !== undefined) details.push(result.packageUrl);
		return details.join(" — ");
	}
	return `${result.registry}: ${result.status}: ${result.message}`;
}

function sortJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (value === null || typeof value !== "object") return value;
	const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	return Object.fromEntries(entries.map(([key, child]) => [key, sortJsonValue(child)]));
}

export { reportExitCode };
