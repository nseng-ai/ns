import {
  BAN_EXTENSION_DEPENDENCY_CYCLE,
  manifestDependencyFields,
} from "./config.mjs";
import { findManifestDependencyPosition } from "./json-diagnostics.mjs";

export function collectExtensionDependencyCycleViolations(metadataByName, graphPackageNames, deferredComponents) {
  const edges = collectExtensionManifestWorkspaceEdges(metadataByName, graphPackageNames);
  const cycleComponents = findCycleComponents([...graphPackageNames].sort(), edges);
  const violations = [];

  for (const component of cycleComponents) {
    const deferredComponent = findContainingDeferredComponent(component, deferredComponents);
    if (deferredComponent !== undefined) continue;

    const componentPackages = new Set(component);
    const componentEdges = edges.filter((edge) => componentPackages.has(edge.from) && componentPackages.has(edge.to));
    const packagesText = [...component].sort().join(", ");
    const overlapText = formatDeferredComponentOverlap(component, deferredComponents);
    for (const edge of componentEdges) {
      violations.push({
        rule: BAN_EXTENSION_DEPENDENCY_CYCLE,
        path: edge.path,
        line: edge.line,
        column: edge.column,
        text: `non-deferred manifest-scoped workspace cycle among ${packagesText}; edge ${edge.from} -> ${edge.to} at ${edge.manifestPath} participates${overlapText}. Guard scope: dependencies, optionalDependencies, and peerDependencies only; devDependencies and source imports are intentionally out of scope.`,
      });
    }
  }

  return violations;
}

export function collectExtensionManifestWorkspaceEdges(metadataByName, graphPackageNames) {
  const edges = [];
  for (const from of [...graphPackageNames].sort()) {
    const metadata = metadataByName.get(from);
    if (metadata === undefined) continue;

    for (const field of manifestDependencyFields) {
      const dependencies = metadata.manifest[field];
      if (!isDependencyMap(dependencies)) continue;

      for (const [to, versionSpecifier] of Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))) {
        if (!graphPackageNames.has(to)) continue;
        if (typeof versionSpecifier !== "string" || !versionSpecifier.startsWith("workspace:")) continue;
        const position = findManifestDependencyPosition(metadata.manifestContent, field, to);
        edges.push({
          from,
          to,
          field,
          manifestPath: `${field}.${to}`,
          path: metadata.packageJsonPath,
          line: position.line,
          column: position.column,
        });
      }
    }
  }
  return edges;
}

export function findCycleComponents(packageNames, edges) {
  const adjacency = new Map(packageNames.map((packageName) => [packageName, []]));
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
  }
  for (const neighbors of adjacency.values()) neighbors.sort();

  let nextIndex = 0;
  const stack = [];
  const stackMembers = new Set();
  const indices = new Map();
  const lowlinks = new Map();
  const components = [];

  function strongConnect(packageName) {
    indices.set(packageName, nextIndex);
    lowlinks.set(packageName, nextIndex);
    nextIndex += 1;
    stack.push(packageName);
    stackMembers.add(packageName);

    for (const neighbor of adjacency.get(packageName) ?? []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlinks.set(packageName, Math.min(lowlinks.get(packageName), lowlinks.get(neighbor)));
      } else if (stackMembers.has(neighbor)) {
        lowlinks.set(packageName, Math.min(lowlinks.get(packageName), indices.get(neighbor)));
      }
    }

    if (lowlinks.get(packageName) !== indices.get(packageName)) return;

    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      stackMembers.delete(member);
      component.push(member);
      if (member === packageName) break;
    }

    const componentMembers = new Set(component);
    const hasSelfEdge = edges.some((edge) => edge.from === edge.to && componentMembers.has(edge.from));
    if (component.length > 1 || hasSelfEdge) components.push(component.sort());
  }

  for (const packageName of [...adjacency.keys()].sort()) {
    if (!indices.has(packageName)) strongConnect(packageName);
  }

  return components.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

function findContainingDeferredComponent(component, deferredComponents) {
  return deferredComponents.find((deferredComponent) =>
    component.every((packageName) => deferredComponent.packages.has(packageName)),
  );
}

function formatDeferredComponentOverlap(component, deferredComponents) {
  const overlappingNames = deferredComponents
    .filter((deferredComponent) => component.some((packageName) => deferredComponent.packages.has(packageName)))
    .map((deferredComponent) => deferredComponent.name)
    .sort();
  return overlappingNames.length === 0 ? "" : `; overlaps deferred component(s): ${overlappingNames.join(", ")}`;
}

function isDependencyMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
