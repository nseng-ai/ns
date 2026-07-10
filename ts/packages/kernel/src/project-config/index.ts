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
export { parseExtensionSourceSpec } from "./extension-source-spec.ts";
export type {
	ExtensionSourceSpec,
	ExtensionSourceSpecDiagnostic,
} from "./extension-source-spec.ts";
export {
	appendDeclaredExtensionSpecToml,
	extensionSourceIdentity,
	planDeclaredExtensionInstallToml,
} from "./ns-toml-extensions-edit.ts";
export type {
	ExtensionSourceIdentity,
	NsTomlExtensionInstallPlan,
	NsTomlExtensionsAppendResult,
} from "./ns-toml-extensions-edit.ts";
