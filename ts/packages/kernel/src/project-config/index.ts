export { nsExtensionExportTarget } from "../sdk/descriptor.ts";

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
