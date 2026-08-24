export { nsExtensionExportTarget } from "../sdk/descriptor.ts";

export { createNodeEffectiveProjectConfig } from "./effective.ts";
export type { EffectiveProjectConfigScope } from "./effective.ts";
export type {
	EffectiveProjectConfig,
	EffectiveValue,
	ProjectConfigError,
	ProjectSetting,
	SettingsSchema,
} from "../sdk/project-config.ts";

export {
	declaredExtensionSpecsErrorInfo,
	descriptorExportPathErrorInfo,
	descriptorExportTarget,
	directoryExists,
	fileExists,
	parseDeclaredExtensionSpecsToml,
	resolveAcquiredDescriptorPackageRoot,
	resolveDescriptorExportPath,
} from "./descriptor-package.ts";
export type {
	AcquiredDescriptorPackageRoot,
	DeclaredExtensionSpecsErrorInfo,
	DeclaredExtensionSpecsParseResult,
	DescriptorExportPathResult,
	DescriptorPackageErrorInfo,
} from "./descriptor-package.ts";
export {
	classifyExtensionSourceLifecycle,
	parseExtensionSourceSpec,
} from "./extension-source-spec.ts";
export {
	managedNpmPackagePaths,
	managedNpmProjectRoot,
	managedNpmRoot,
	npmPackageRoot,
	projectManagedNpmStorage,
	userManagedNpmStorage,
} from "./managed-extension-paths.ts";
export type { ManagedNpmPackagePaths, ManagedNpmStorage } from "./managed-extension-paths.ts";
export { parseExtensionArraySyntax } from "./ns-toml-extension-syntax.ts";
export type {
	ExtensionArraySyntax,
	ExtensionArraySyntaxValue,
} from "./ns-toml-extension-syntax.ts";
export type {
	ExtensionSourceLifecycleClassification,
	ExtensionSourceSpec,
	ExtensionSourceSpecDiagnostic,
} from "./extension-source-spec.ts";
export {
	appendDeclaredExtensionSpecToml,
	extensionSourceIdentity,
	extensionSourceIdentityFromParsed,
	planDeclaredExtensionInstallToml,
	planDeclaredExtensionTarget,
	planDeclaredExtensionUninstallToml,
} from "./ns-toml-extensions-edit.ts";
export type {
	ExtensionSourceIdentity,
	NsTomlExtensionInstallPlan,
	NsTomlExtensionTargetPlan,
	NsTomlExtensionUninstallPlan,
	NsTomlExtensionsAppendResult,
} from "./ns-toml-extensions-edit.ts";
