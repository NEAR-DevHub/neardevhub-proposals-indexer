import { NearActionEntity, Proposal, ProposalSnapshot, TestProposal } from "../types";
import {
  NearTransaction,
  NearAction,
  Transfer,
  FunctionCall,
  NearBlock
} from "@subql/types-near";

export async function handleAction(
  action: NearAction<Transfer>
): Promise<void> {
  // An Action can belong to either a transaction or a receipt
  // To check which one, we can check if action.transaction is null
  // If it is null, then it belongs to a receipt
  if(!action.receipt){
    return
  }

  logger.info(
    `Handling action at ${
      action.transaction
        ? action.transaction.block_height
        : action.receipt.block_height
    }`
  );

  logger.info(`Action: ${action.type}`);

  const id = action.transaction
    ? `${action.transaction.block_height}-${action.transaction.result.id}-${action.id}`
    : `${action.receipt.block_height}-${action.receipt.id}-${action.id}`;
  const sender = action.transaction
    ? action.transaction.signer_id
    : action.receipt.predecessor_id;
  const receiver = action.transaction
    ? action.transaction.receiver_id
    : action.receipt.receiver_id;

  const actionRecord = NearActionEntity.create({
    id: id,
    sender: sender,
    receiver: receiver,
    amount: BigInt((action.action as Transfer).deposit.toString()),
  });

  await actionRecord.save();
}


interface NearActionExample<FunctionCallExample> {
  id: number;
  type: "FunctionCall";
  action: FunctionCallExample;
  transaction?: NearTransaction;
  receipt?: NearTransactionReceipt;
}

interface NearTransactionReceipt {
  id: number;
  block_height: number;
  receipt_id: string;
  predecessor_id: string;
  Action?: {
      actions: NearAction[];
      // gas_price: BN;
      input_data_ids: string[];
      output_data_receivers: {
          data_id: string;
          receiver_id: string;
      }[];
      signer_id: string;
      signer_public_key: string;
  };
  Data?: {
      data: string;
      data_id: string;
  };
  receiver_id: string;
}

interface FunctionCallExample {
  method_name: string;
  // args: IArgs; // toJson()
  // gas: BN;
  // deposit: BN;
}


export async function handleAddProposal(action: NearAction<FunctionCall>) {
  logger.info(`Handling add proposal at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for action ${action.id}`)
  }
  let args = action.action.args;
  let author = action.transaction
  ? action.transaction.signer_id
  : action.receipt.predecessor_id;
  let blockHeight = action.receipt.block_height;
  let methodName = action.action.method_name;
  logger.info(`Indexing ${methodName} by ${author} at ${blockHeight}`);

  const response: { result: number[]; logs: any[]; block_height: number; block_hash: string; }  = await api.sendJsonRpc("query",{
      "request_type": "call_function",
      "block_id": blockHeight,
      "account_id": "devhub.near",
      "method_name": "get_all_proposal_ids",
      "args_base64": "e30="
    }
  );

  logger.info(`Response: ${JSON.stringify(response)}`);

  const proposalIds = JSON.parse(response.result.map((x: number) => String.fromCharCode(x)).join(""));

  const lastProposalId = proposalIds.slice(-1)[0];

  logger.info(`Last 5 proposals: ${proposalIds.slice(-5).join(",")}`);

  logger.info(`Last Proposal ID: ${lastProposalId}`);

  logger.info(`Args: ${args}`);
  
  const argsJson = args.toJson();
  
  logger.info(`Args: ${JSON.stringify(argsJson)}`);

  const authorId = argsJson.receiver_account;

  const proposalId = lastProposalId + 1;

  await Proposal.create({
    id: proposalId,
    authorId: authorId,
    // snapshots: [proposalSnapshot],
    // latestSnapshot: proposalSnapshot,
  }).save();

  await ProposalSnapshot.create({
    id: proposalId, // TODO snapshot id?
    proposalId: proposalId,
    blockHeight: blockHeight,
    // timestamp: blockTimestamp, // Not sure if we need this and not accessible from handler
    editorId: authorId,
    socialDbPostBlockHeight: 0, // TODO edit_proposal
    labels: argsJson.labels,
    proposalVersion: argsJson.proposal_body_version,
    proposalBodyVersion: argsJson.body.proposal_body_version,
    name: argsJson.body.name,
    category: argsJson.body.category,
    summary: argsJson.body.summary,
    description: argsJson.body.description,
    requestedSponsorshipUsdAmount: argsJson.body.requested_sponsorship_usd_amount,
    requestedSponsorshipPaidInCurrency: argsJson.body.requested_sponsorship_paid_in_currency,
    requestedSponsor: argsJson.body.requested_sponsor,
    receiverAccount: argsJson.body.receiver_account,
    supervisor: argsJson.body.supervisor,
    timeline: JSON.stringify(argsJson.body.timeline),
    edits: 1,
  }).save();

  /**
   * These are the in the feed
   * author_id
      block_height
      name
      category
      summary
      editor_id
      proposal_id
      ts
      timeline
      views
      labels
      linked_rfp
   */
}

// TODO: use this function instead of handleAddProposal
export async function handleSetBlockHeightCallback(action: NearAction<FunctionCall>) {
  logger.info(`Handling set block height callback at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for set block height callback  ${action.id}`)
  }

  let args = action.action.args;
  let author = action.transaction
  ? action.transaction.signer_id
  : action.receipt.predecessor_id;

  const argsJson = args.toJson();

  logger.info(`Proposal: ${JSON.stringify(argsJson)}`);
  
}

export async function handleEditProposal(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit proposal at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for edit proposal  ${action.id}`)
  }
}

export async function handleActionFunctionCall(action: NearAction<FunctionCall>) {
  // An Action can belong to either a transaction or a receipt
  // To check which one, we can check if action.transaction is null
  // If it is null, then it belongs to a receipt
  if(!action.receipt){
    return logger.info(`No receipt found for action ${action.id}`)
  }

  logger.info(
    `Handling action at ${
      action.transaction
        ? action.transaction.block_height
        : action.receipt.block_height
    }`
  );

  logger.info(`Action: ${action.type}, Method: ${action.action.method_name}`);

  const id = action.transaction
    ? `${action.transaction.block_height}-${action.transaction.result.id}-${action.id}`
    : `${action.receipt.block_height}-${action.receipt.id}-${action.id}`;
  const sender = action.transaction
    ? action.transaction.signer_id
    : action.receipt.predecessor_id;
  const receiver = action.transaction
    ? action.transaction.receiver_id
    : action.receipt.receiver_id;
  let methodName = action.action.method_name;

  // const actionRecord = NearActionEntity.create({
  //   id: id,
  //   sender: sender,
  //   receiver: receiver,
  //   amount: BigInt((action.action as Transfer).deposit.toString()),
  // });
  // await actionRecord.save();

  logger.info(`FunctionCall: ${id}, Author: ${receiver}`);


  await TestProposal.create({
    id: id,
    authorId: `${sender}`,
    receiverId: `${receiver}`,
    methodName: `${methodName}`,
  }).save();

}