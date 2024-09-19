import { FunctionCall, NearAction } from "@subql/types-near";
import { Dump, RfpDump } from "../types";
import { NewProposalTimelineArgs } from "./argsTypes";

export async function createDump(action: NearAction<FunctionCall>, argsJson: any) {
  if(!action.receipt){
    return logger.info(`No receipt found when creating dump for ${action.id}`)
  }
  await Dump.create({
    id: action.receipt.id.toString(),
    receiptId: action.receipt.id.toString(),
    methodName: action.action.method_name,
    blockHeight: action.receipt.block_height,
    args: JSON.stringify(argsJson),
    author: action.receipt.predecessor_id,
    proposalId: +argsJson.id,
    instance: action.receipt.receiver_id,
  }).save();
}

export async function handleRFPDump(action: NearAction<FunctionCall>) {
  logger.info(`Handling rfp dump at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for rfp dump  ${action.id}`)
  }

  let args = action.action.args;
 
  const argsJson:NewProposalTimelineArgs  = args.toJson();

  await RfpDump.create({
    id: action.receipt.id.toString(),
    receiptId: action.receipt.id.toString(),
    methodName: action.action.method_name,
    blockHeight: action.receipt.block_height,
    args: JSON.stringify(argsJson),
    author: action.receipt.predecessor_id,
    rfpId: argsJson.id,
    instance: action.receipt.receiver_id,
  }).save();
}