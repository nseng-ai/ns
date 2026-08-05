import { mapBranchPrsOperation } from "../../../../../map-branch-prs.ts";
import { prAddressOperationNsCommand } from "../../../../command.ts";

export async function command() {
	return prAddressOperationNsCommand(mapBranchPrsOperation);
}
