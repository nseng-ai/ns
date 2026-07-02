import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

import * as ts from "typescript";

import {
	BAN_TOPOLOGY_CIRCLE_LAYERING,
	allowedPackageTierDebtEdges,
	packageTierAllowedTargets,
	type PackageTier,
} from "./config.ts";
import { findTypeScriptSourceFiles } from "./file-discovery.ts";
import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "@sdl/typescript-analysis";
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

export interface TopologyCircleLayeringOptions {
	readonly repoRoot: string;
	readonly packageMetadataByName: ReadonlyMap<string, PackageMetadata>;
	readonly files?: readonly TopologyCircleSourceFile[];
	readonly circles?: readonly TopologyCircleFact[];
}

interface ImportEdge {
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
		if (metadata.sdlTier === undefined) continue;
		const sourceDir = join(repoRoot, metadata.packageDir, "src");
		if (!existsSync(sourceDir)) continue;
		circles.set(metadata.name, {
			id: metadata.name,
			packageName: metadata.name,
			component: ".",
			tier: metadata.sdlTier,
			path: relative(repoRoot, sourceDir),
		});

		for (const component of metadata.sdlSubpackages) {
			const componentDir = join(sourceDir, component);
			if (!directoryExists(componentDir)) continue;
			const id = `${metadata.name}/${component}`;
			if (circles.has(id)) continue;
			circles.set(id, {
				id,
				packageName: metadata.name,
				component,
				tier: metadata.sdlTier,
				path: relative(repoRoot, componentDir),
			});
		}
	}
	return circles;
}

export function collectTopologyCircleLayeringViolations(
	options: TopologyCircleLayeringOptions,
): SourceRuleViolation[] {
	const circlesById =
		options.circles === undefined
			? discoverTopologyCircles(options.repoRoot, options.packageMetadataByName)
			: new Map(options.circles.map((circle) => [circle.id, circle]));
	const circles = [...circlesById.values()];
	const files =
		options.files ?? collectProductionSourceFiles(options.repoRoot, options.packageMetadataByName);
	const violations: SourceRuleViolation[] = [];

	for (const file of files) {
		const from = circleForPath(file.path, options.repoRoot, circles);
		if (from === undefined) continue;
		const sourceFile = parseTypeScriptSource(file.path, file.content);
		for (const edge of collectImportEdges({ file, sourceFile, from, circles, options })) {
			if (edge.from.id === edge.to.id) continue;
			if (isAllowedCircleEdge(edge.from, edge.to)) continue;
			violations.push({
				rule: BAN_TOPOLOGY_CIRCLE_LAYERING,
				...sourceLocationFields(edge.path, edge.sourceFile, edge.node),
				text:
					`Topology circle dependency violates tier layering: ${edge.from.id} (${edge.from.tier}) -> ${edge.to.id} (${edge.to.tier}); ` +
					`${edge.from.tier}-must-not-depend-on-${edge.to.tier}.`,
			});
		}
	}

	return violations;
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
	readonly options: TopologyCircleLayeringOptions;
}): readonly ImportEdge[] {
	const edges: ImportEdge[] = [];

	function visit(node: ts.Node): void {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const moduleSpecifierNode = node.moduleSpecifier;
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined && moduleSpecifierNode !== undefined) {
				const to = circleForSpecifier(
					specifier,
					args.file.path,
					args.options.repoRoot,
					args.circles,
					new Set((args.options.files ?? []).map((sourceFile) => sourceFile.path)),
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

function isCircleGuardEnabledPackage(metadata: PackageMetadata): boolean {
	return metadata.sdlSubpackages.length > 0 || metadata.sdlRemainder;
}

function directoryExists(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}

function isAllowedCircleEdge(from: TopologyCircleFact, to: TopologyCircleFact): boolean {
	if (from.packageName === to.packageName) return true;
	if (packageTierAllowedTargets[from.tier].has(to.tier)) return true;
	return allowedPackageTierDebtEdges.has(`${from.packageName}\0${to.packageName}`);
}
