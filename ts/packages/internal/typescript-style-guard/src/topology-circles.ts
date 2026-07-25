import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

import * as ts from "typescript";

import {
	BAN_TOPOLOGY_CIRCLE_CYCLE,
	BAN_TOPOLOGY_CIRCLE_LAYERING,
	allowedPackageTierDebtEdges,
	deferredTopologyCircleCycles,
	packageTierAllowedTargets,
	type DeferredTopologyCircleCycle,
	type PackageTier,
} from "./config.ts";
import { findCycleComponents } from "./dependency-graph.ts";
import { packageEdgeKey } from "./package-tier-taxonomy.ts";
import { findTypeScriptSourceFiles } from "./file-discovery.ts";
import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "@nseng-ai/foundation/typescript-analysis";
import { type PackageMetadata } from "./package-metadata.ts";
import { type SourceRuleViolation } from "./source-rules.ts";

export interface TopologyCircleFact {
	readonly id: string;
	readonly packageName: string;
	readonly component: string;
	readonly tier: PackageTier;
	readonly path: string;
}

export interface TopologyCircleSourceFile {
	readonly path: string;
	readonly content: string;
}

export interface TopologyCircleImportEdgeOptions {
	readonly repoRoot: string;
	readonly packageMetadataByName: ReadonlyMap<string, PackageMetadata>;
	readonly files?: readonly TopologyCircleSourceFile[];
	readonly circles?: readonly TopologyCircleFact[];
	readonly importEdges?: readonly TopologyCircleImportEdge[];
}

export type TopologyCircleLayeringOptions = TopologyCircleImportEdgeOptions;

export interface TopologyCircleCycleOptions extends TopologyCircleImportEdgeOptions {
	readonly deferredCycles?: readonly DeferredTopologyCircleCycle[];
}

export interface TopologyCircleImportEdge extends Pick<
	SourceRuleViolation,
	"path" | "line" | "column"
> {
	readonly from: TopologyCircleFact;
	readonly to: TopologyCircleFact;
}

export interface TopologyCircleCycleComponent {
	readonly packageName: string;
	readonly circles: ReadonlySet<string>;
}

interface RawImportEdge {
	readonly from: TopologyCircleFact;
	readonly to: TopologyCircleFact;
	readonly path: string;
	readonly sourceFile: ts.SourceFile;
	readonly node: ts.Node;
}

export function discoverTopologyCircles(
	repoRoot: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): Map<string, TopologyCircleFact> {
	const circles = new Map<string, TopologyCircleFact>();
	for (const metadata of packageMetadataByName.values()) {
		if (metadata.nsTier === undefined) continue;
		const sourceDir = join(repoRoot, metadata.packageDir, "src");
		if (!existsSync(sourceDir)) continue;
		circles.set(metadata.name, {
			id: metadata.name,
			packageName: metadata.name,
			component: ".",
			tier: metadata.nsTier,
			path: relative(repoRoot, sourceDir),
		});

		for (const component of metadata.nsSubpackages) {
			const componentDir = join(sourceDir, component);
			if (!directoryExists(componentDir)) continue;
			const id = `${metadata.name}/${component}`;
			if (circles.has(id)) continue;
			circles.set(id, {
				id,
				packageName: metadata.name,
				component,
				tier: metadata.nsTier,
				path: relative(repoRoot, componentDir),
			});
		}
	}
	return circles;
}

export function collectTopologyCircleImportEdges(
	options: TopologyCircleImportEdgeOptions,
): TopologyCircleImportEdge[] {
	const circlesById =
		options.circles === undefined
			? discoverTopologyCircles(options.repoRoot, options.packageMetadataByName)
			: new Map(options.circles.map((circle) => [circle.id, circle]));
	const circles = [...circlesById.values()];
	const files =
		options.files ?? collectProductionSourceFiles(options.repoRoot, options.packageMetadataByName);
	const virtualSourcePaths = new Set((options.files ?? []).map((sourceFile) => sourceFile.path));
	const edges: TopologyCircleImportEdge[] = [];

	for (const file of files) {
		const from = circleForPath(file.path, options.repoRoot, circles);
		if (from === undefined) continue;
		const sourceFile = parseTypeScriptSource(file.path, file.content);
		for (const edge of collectImportEdges({
			file,
			sourceFile,
			from,
			circles,
			repoRoot: options.repoRoot,
			virtualSourcePaths,
		})) {
			edges.push({
				from: edge.from,
				to: edge.to,
				...sourceLocationFields(edge.path, edge.sourceFile, edge.node),
			});
		}
	}

	return edges;
}

export function collectTopologyCircleLayeringViolations(
	options: TopologyCircleLayeringOptions,
): SourceRuleViolation[] {
	const importEdges = options.importEdges ?? collectTopologyCircleImportEdges(options);
	const violations: SourceRuleViolation[] = [];

	for (const edge of importEdges) {
		if (edge.from.id === edge.to.id) continue;
		if (isAllowedCircleEdge(edge.from, edge.to)) continue;
		violations.push({
			rule: BAN_TOPOLOGY_CIRCLE_LAYERING,
			path: edge.path,
			line: edge.line,
			column: edge.column,
			text:
				`Topology circle dependency violates tier layering: ${edge.from.id} (${edge.from.tier}) -> ${edge.to.id} (${edge.to.tier}); ` +
				`${edge.from.tier}-must-not-depend-on-${edge.to.tier}.`,
		});
	}

	return violations;
}

export function collectTopologyCircleCycleViolations(
	options: TopologyCircleCycleOptions,
): SourceRuleViolation[] {
	const deferredCycles = options.deferredCycles ?? deferredTopologyCircleCycles;
	const importEdges = options.importEdges ?? collectTopologyCircleImportEdges(options);
	const cycleComponents = collectTopologyCircleCycleComponents(importEdges);

	const violations: SourceRuleViolation[] = [];
	for (const cycleComponent of cycleComponents) {
		const deferredMatch = matchDeferredTopologyCircleCycle(
			cycleComponent.packageName,
			cycleComponent.circles,
			deferredCycles,
		);
		if (deferredMatch.containingDeferredCycle !== undefined) continue;

		const circlesText = [...cycleComponent.circles].sort().join(", ");
		const overlapText = formatDeferredTopologyCircleCycleOverlap(deferredMatch.overlapping);
		for (const edge of importEdges) {
			if (edge.from.packageName !== cycleComponent.packageName) continue;
			if (edge.to.packageName !== cycleComponent.packageName) continue;
			if (!cycleComponent.circles.has(edge.from.component)) continue;
			if (!cycleComponent.circles.has(edge.to.component)) continue;
			violations.push({
				rule: BAN_TOPOLOGY_CIRCLE_CYCLE,
				path: edge.path,
				line: edge.line,
				column: edge.column,
				text:
					`non-deferred subpackage circle cycle in ${cycleComponent.packageName} among ${circlesText}; edge ${edge.from.id} -> ${edge.to.id} participates. ` +
					`Break the cycle by making imports flow one way between circles, or add a deferredTopologyCircleCycles entry in config.ts${overlapText}.`,
			});
		}
	}

	return violations;
}

export function collectTopologyCircleCycleComponents(
	importEdges: readonly TopologyCircleImportEdge[],
): readonly TopologyCircleCycleComponent[] {
	const intraPackageEdges = importEdges.filter(
		(edge) => edge.from.packageName === edge.to.packageName && edge.from.id !== edge.to.id,
	);
	const edgesByPackage = new Map<string, TopologyCircleImportEdge[]>();
	for (const edge of intraPackageEdges) {
		const packageEdges = edgesByPackage.get(edge.from.packageName) ?? [];
		packageEdges.push(edge);
		edgesByPackage.set(edge.from.packageName, packageEdges);
	}

	const cycles: TopologyCircleCycleComponent[] = [];
	for (const [packageName, packageEdges] of [...edgesByPackage.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		const circlesById = new Map<string, TopologyCircleFact>();
		for (const edge of packageEdges) {
			circlesById.set(edge.from.id, edge.from);
			circlesById.set(edge.to.id, edge.to);
		}
		const components = findCycleComponents(
			[...circlesById.keys()].sort(),
			packageEdges.map((edge) => ({ from: edge.from.id, to: edge.to.id })),
		);
		for (const component of components) {
			cycles.push({
				packageName,
				circles: new Set(
					component.map((circleId) => requiredCircle(circlesById, circleId).component),
				),
			});
		}
	}
	return cycles.sort((left, right) =>
		`${left.packageName}\0${[...left.circles].sort().join("\0")}`.localeCompare(
			`${right.packageName}\0${[...right.circles].sort().join("\0")}`,
		),
	);
}

function collectProductionSourceFiles(
	repoRoot: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): readonly TopologyCircleSourceFile[] {
	const files: TopologyCircleSourceFile[] = [];
	for (const metadata of packageMetadataByName.values()) {
		if (!isCircleGuardEnabledPackage(metadata)) continue;
		const sourceDir = join(repoRoot, metadata.packageDir, "src");
		if (!existsSync(sourceDir)) continue;
		for (const absolutePath of findTypeScriptSourceFiles(sourceDir)) {
			if (absolutePath.includes("/test/") || absolutePath.includes("/test-support/")) continue;
			files.push({
				path: relative(repoRoot, absolutePath),
				content: readFileSync(absolutePath, "utf8"),
			});
		}
	}
	return files;
}

function collectImportEdges(args: {
	readonly file: TopologyCircleSourceFile;
	readonly sourceFile: ts.SourceFile;
	readonly from: TopologyCircleFact;
	readonly circles: readonly TopologyCircleFact[];
	readonly repoRoot: string;
	readonly virtualSourcePaths: ReadonlySet<string>;
}): readonly RawImportEdge[] {
	const edges: RawImportEdge[] = [];

	function visit(node: ts.Node): void {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const moduleSpecifierNode = node.moduleSpecifier;
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined && moduleSpecifierNode !== undefined) {
				const to = circleForSpecifier(
					specifier,
					args.file.path,
					args.repoRoot,
					args.circles,
					args.virtualSourcePaths,
				);
				if (to !== undefined) {
					edges.push({
						from: args.from,
						to,
						path: args.file.path,
						sourceFile: args.sourceFile,
						node: moduleSpecifierNode,
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(args.sourceFile);
	return edges;
}

function circleForSpecifier(
	specifier: string,
	importerPath: string,
	repoRoot: string,
	circles: readonly TopologyCircleFact[],
	virtualSourcePaths: ReadonlySet<string>,
): TopologyCircleFact | undefined {
	if (specifier.startsWith(".")) {
		const resolvedPath = resolveSourceFile(
			join(repoRoot, dirname(importerPath), specifier),
			repoRoot,
			virtualSourcePaths,
		);
		if (resolvedPath === undefined) return undefined;
		return circleForPath(relative(repoRoot, resolvedPath), repoRoot, circles);
	}

	const packageName = packageNameForSpecifier(specifier, circles);
	if (packageName === undefined) return undefined;
	const component = componentForPackageSpecifier(specifier, packageName, circles);
	return (
		circles.find(
			(circle) => circle.packageName === packageName && circle.component === component,
		) ?? circles.find((circle) => circle.packageName === packageName && circle.component === ".")
	);
}

function packageNameForSpecifier(
	specifier: string,
	circles: readonly TopologyCircleFact[],
): string | undefined {
	const packageNames = [...new Set(circles.map((circle) => circle.packageName))].sort(
		(left, right) => right.length - left.length,
	);
	return packageNames.find(
		(packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
	);
}

function componentForPackageSpecifier(
	specifier: string,
	packageName: string,
	circles: readonly TopologyCircleFact[],
): string {
	if (specifier === packageName) return ".";
	const rest = specifier.slice(packageName.length + 1);
	const [component] = rest.split("/");
	if (component === undefined) return ".";
	return circles.some(
		(circle) => circle.packageName === packageName && circle.component === component,
	)
		? component
		: ".";
}

function circleForPath(
	path: string,
	repoRoot: string,
	circles: readonly TopologyCircleFact[],
): TopologyCircleFact | undefined {
	const normalizedPath = normalize(relative(repoRoot, resolve(repoRoot, path)));
	let best: TopologyCircleFact | undefined;
	for (const circle of circles) {
		const circlePath = normalize(circle.path);
		if (normalizedPath === circlePath || normalizedPath.startsWith(`${circlePath}/`)) {
			if (best === undefined || circlePath.length > normalize(best.path).length) best = circle;
		}
	}
	return best;
}

function resolveSourceFile(
	path: string,
	repoRoot: string,
	virtualPaths: ReadonlySet<string> = new Set(),
): string | undefined {
	const candidates = [
		path,
		`${path}.ts`,
		`${path}.tsx`,
		join(path, "index.ts"),
		join(path, "index.tsx"),
	];
	return candidates.find((candidate) => {
		const relativeCandidate = normalize(relative(repoRoot, candidate));
		return (
			virtualPaths.has(relativeCandidate) || (existsSync(candidate) && statSync(candidate).isFile())
		);
	});
}

interface DeferredTopologyCircleCycleMatch {
	readonly containingDeferredCycle: DeferredTopologyCircleCycle | undefined;
	readonly overlapping: readonly DeferredTopologyCircleCycle[];
}

function matchDeferredTopologyCircleCycle(
	packageName: string,
	componentNames: ReadonlySet<string>,
	deferredCycles: readonly DeferredTopologyCircleCycle[],
): DeferredTopologyCircleCycleMatch {
	const packageDeferredCycles = deferredCycles.filter(
		(deferredCycle) => deferredCycle.packageName === packageName,
	);
	return {
		containingDeferredCycle: packageDeferredCycles.find((deferredCycle) =>
			[...componentNames].every((componentName) => deferredCycle.circles.has(componentName)),
		),
		overlapping: packageDeferredCycles.filter((deferredCycle) =>
			[...componentNames].some((componentName) => deferredCycle.circles.has(componentName)),
		),
	};
}

function formatDeferredTopologyCircleCycleOverlap(
	overlapping: readonly DeferredTopologyCircleCycle[],
): string {
	const overlappingNames = overlapping.map((deferredCycle) => deferredCycle.name).sort();
	return overlappingNames.length === 0
		? ""
		: `; overlaps deferredTopologyCircleCycles entry/entries: ${overlappingNames.join(", ")}`;
}

function requiredCircle(
	circlesById: ReadonlyMap<string, TopologyCircleFact>,
	circleId: string,
): TopologyCircleFact {
	const circle = circlesById.get(circleId);
	if (circle === undefined) throw new Error(`Missing topology circle ${circleId}`);
	return circle;
}

function isCircleGuardEnabledPackage(metadata: PackageMetadata): boolean {
	return metadata.nsSubpackages.length > 0 || metadata.nsRemainder;
}

function directoryExists(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}

function isAllowedCircleEdge(from: TopologyCircleFact, to: TopologyCircleFact): boolean {
	if (from.packageName === to.packageName) return true;
	if (packageTierAllowedTargets[from.tier].has(to.tier)) return true;
	if (isAllowedPiSubpackageCircleEdge(from, to)) return true;
	return allowedPackageTierDebtEdges.has(packageEdgeKey(from.packageName, to.packageName));
}

function isAllowedPiSubpackageCircleEdge(
	from: TopologyCircleFact,
	to: TopologyCircleFact,
): boolean {
	return from.tier === "extension" && from.component === "pi" && to.packageName === "@nseng-ai/pi";
}
