import { NearActionEntity, Proposal, ProposalSnapshot, TestProposal, Dump, RfpDump, Rfp, RfpSnapshot } from "../types";
import {
  NearTransaction,
  NearAction,
  Transfer,
  FunctionCall,
  NearBlock
} from "@subql/types-near";
import { INSTANCES } from "./instances";
import { AddProposalArgs, CancelRFPArgs, EditProposalArgs, EditProposalLinkedRFPArgs, EditRFPArgs, EditRFPTimelineArgs, NewProposal, NewProposalTimelineArgs, SetRFPBlockHeightCallbackArgs } from "./argsTypes";
import { decodeRPCResponse, toBase64 } from "./utils";
import { createDump, handleRFPDump } from "./dump";
import { getProposal, getProposalIds } from "./rpcCalls";

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

export async function handleSetBlockHeightCallback(action: NearAction<FunctionCall>) {
  logger.info(`Handling set block height callback at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for set block height callback  ${action.id}`)
  }

  // NOTE: skipping indexing of events-committee.near before block 118620288 because we tested on mainnet and wiped contract data after that.
  if (action.receipt.receiver_id === INSTANCES.eventsCommittee.account && action.receipt.block_height < INSTANCES.eventsCommittee.startBlockHeight){
    return logger.info(`Skipping indexing of set block height callback at ${action.receipt.block_height} for events-committee.near`)
  }

  const args = action.action.args;
  const argsJson: NewProposal = args.toJson();

  // logger.info(`Proposal: ${JSON.stringify(argsJson)}`);

  const compositeId = `${action.receipt.receiver_id}_${argsJson.proposal.id.toString()}`;

  await createDump(action, argsJson, compositeId);

  await Proposal.create({
    id: compositeId,
    authorId: argsJson.proposal.author_id,
    instance: action.receipt.receiver_id,
  }).save();

  const socialDbPostBlockHeight = argsJson.proposal.social_db_post_block_height;
  const supervisor = argsJson.proposal.snapshot.supervisor ?? "";

  const proposalSnapshot = {
    // NOTE the first snapshot has the same id as the proposal
    id: compositeId,
    proposalId: compositeId,
    blockHeight: action.receipt.block_height,
    editorId: argsJson.proposal.snapshot.editor_id,
    socialDbPostBlockHeight: Number(socialDbPostBlockHeight),
    labels: argsJson.proposal.snapshot.labels,
    proposalVersion: argsJson.proposal.snapshot.proposal_body_version,
    proposalBodyVersion: argsJson.proposal.snapshot.proposal_body_version,
    name: argsJson.proposal.snapshot.name,
    category: argsJson.proposal.snapshot.category,
    summary: argsJson.proposal.snapshot.summary,
    description: argsJson.proposal.snapshot.description,
    requestedSponsorshipUsdAmount: argsJson.proposal.snapshot.requested_sponsorship_usd_amount,
    requestedSponsorshipPaidInCurrency: argsJson.proposal.snapshot.requested_sponsorship_paid_in_currency,
    requestedSponsor: argsJson.proposal.snapshot.requested_sponsor,
    receiverAccount: argsJson.proposal.snapshot.receiver_account,
    supervisor: supervisor,
    timeline: JSON.stringify(argsJson.proposal.snapshot.timeline),
  };

  await ProposalSnapshot.create(proposalSnapshot).save();
  logger.info('Created proposal snapshot linking proposals..')

  // TODO: checkAndUpdateLinkedProposals
  // 194 -> 94
}



export async function handleEditProposal(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit proposal at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for edit proposal  ${action.id}`)
  }

  const argsJson: EditProposalArgs = action.action.args.toJson();

  logger.info(`Edit Proposal: ${JSON.stringify(argsJson)}`);

  const compositeId = `${action.receipt.receiver_id}_${argsJson.id.toString()}`;

  await createDump(action, argsJson, compositeId);

  // TODO define return type of getProposal
  const proposal = await getProposal(action.receipt.block_height, action.receipt.receiver_id, argsJson.id);

  const proposalGet = await Proposal.get(argsJson.id.toString())

  // TODO try and see if any of these proposals give access to the LatestProposalSnapshot
  // in order to create the new snapshot 
  logger.info(`Proposal from RPC: ${JSON.stringify(proposal)}`);
  logger.info(`ProposalGet with ID ${argsJson.id.toString()}: ${JSON.stringify(proposalGet)}`);

  // NOTE the first snapshot of any proposal has the same id as the proposal
  const firstSnapshot = await ProposalSnapshot.get(argsJson.id.toString())

  await ProposalSnapshot.create({
    id: argsJson.id.toString(),
    proposalId: argsJson.id.toString(),
    blockHeight: action?.receipt?.block_height,
    editorId: action.receipt.predecessor_id,
    socialDbPostBlockHeight: firstSnapshot?.socialDbPostBlockHeight || 0,
    name: argsJson.body.name,
    category: argsJson.body.category,
    summary: argsJson.body.summary,
    description: argsJson.body.description,
    requestedSponsorshipUsdAmount: argsJson.body.requested_sponsorship_usd_amount,
    requestedSponsorshipPaidInCurrency: argsJson.body.requested_sponsorship_paid_in_currency,
    receiverAccount: argsJson.body.receiver_account,
    requestedSponsor: argsJson.body.requested_sponsor,
    proposalVersion: firstSnapshot?.proposalVersion || "V0", 
    proposalBodyVersion: firstSnapshot?.proposalBodyVersion || "V0", 
    supervisor: argsJson.body.supervisor || "", 
    timeline: JSON.stringify(argsJson.body.timeline), 
  }).save();

  // TODO: checkAndUpdateLinkedProposals

}


// Limit to querying 100 snapshots per proposal
// https://academy.subquery.network/indexer/build/graphql.html#standard-indexes
// This means we can't just query all snapshots when a proposal is edited often

export async function handleEditProposalLinkedRFP(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit proposal linked rfp at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for set block height callback  ${action.id}`)
  }

  const argsJson: EditProposalLinkedRFPArgs = action.action.args.toJson();

  logger.info(`Proposal: ${JSON.stringify(argsJson)}`);

  const compositeId = `${action.receipt.receiver_id}_${argsJson.id.toString()}`;

  await createDump(action, argsJson, compositeId);

  const proposalSnapshot = await ProposalSnapshot.get(argsJson.id.toString())

  await ProposalSnapshot.create({
    id: argsJson.id.toString(), // TODO random
    proposalId: argsJson.id.toString(),
    blockHeight: action.receipt.block_height,
    editorId: action.receipt.predecessor_id,
    socialDbPostBlockHeight: proposalSnapshot?.socialDbPostBlockHeight || 0,
    name: proposalSnapshot?.name || '',
    category: proposalSnapshot?.category || '',
    summary: proposalSnapshot?.summary || '',
    description: proposalSnapshot?.description || '',
    requestedSponsorshipUsdAmount: proposalSnapshot?.requestedSponsorshipUsdAmount || '',
    requestedSponsorshipPaidInCurrency: proposalSnapshot?.requestedSponsorshipPaidInCurrency || '',
    requestedSponsor: proposalSnapshot?.requestedSponsor || '',
    receiverAccount: proposalSnapshot?.receiverAccount || '',
    supervisor: proposalSnapshot?.supervisor || '',
    proposalVersion: proposalSnapshot?.proposalVersion || 'V0',
    proposalBodyVersion: proposalSnapshot?.proposalBodyVersion || 'V0',
    timeline: proposalSnapshot?.timeline || '',
  }).save();
}

export async function handleEditProposalTimeline(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit timeline at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for set block height callback  ${action.id}`)
  }
 
  const argsJson: NewProposalTimelineArgs  = action.action.args.toJson();

  logger.info(`Proposal: ${JSON.stringify(argsJson)}`);

  const compositeId = `${action.receipt.receiver_id}_${argsJson.id.toString()}`;
  await createDump(action, argsJson, compositeId);

  const proposalSnapshot = await ProposalSnapshot.get(argsJson.id.toString())

  await ProposalSnapshot.create({
    id: argsJson.id.toString(),
    proposalId: argsJson.id.toString(),
    blockHeight: action.receipt.block_height,
    editorId: action.receipt.predecessor_id,
    socialDbPostBlockHeight: proposalSnapshot?.socialDbPostBlockHeight || 0,
    name: proposalSnapshot?.name || '',
    category: proposalSnapshot?.category || '',
    summary: proposalSnapshot?.summary || '',
    description: proposalSnapshot?.description || '',
    requestedSponsorshipUsdAmount: proposalSnapshot?.requestedSponsorshipUsdAmount || '',
    requestedSponsorshipPaidInCurrency: proposalSnapshot?.requestedSponsorshipPaidInCurrency || '',
    requestedSponsor: proposalSnapshot?.requestedSponsor || '',
    receiverAccount: proposalSnapshot?.receiverAccount || '',
    supervisor: proposalSnapshot?.supervisor || '',
    proposalVersion: proposalSnapshot?.proposalVersion || 'V0',
    proposalBodyVersion: proposalSnapshot?.proposalBodyVersion || 'V0',
    timeline: JSON.stringify(argsJson.timeline), 
  }).save();

  const firstSnapshot = await ProposalSnapshot.get(argsJson.id.toString())

}

export async function handleSetRFPBlockHeightCallback(action: NearAction<FunctionCall>) {
  logger.info(`Handling set rfp block height callback at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for set rfp block height callback  ${action.id}`)
  }

  await handleRFPDump(action);

  const argsJson:SetRFPBlockHeightCallbackArgs  = action.action.args.toJson();
  const receiver = action.receipt.receiver_id;
  const compositeId = `${receiver}_${argsJson.rfp.id.toString()}`;

  // Create the RFP
  await Rfp.create({
    id: `${receiver}_${argsJson.rfp.id.toString()}`,
    authorId: argsJson.rfp.author_id.toString(),
    instance: action.receipt.receiver_id,
  }).save();

  // Create the RFP Snapshot
  await RfpSnapshot.create({
    id: argsJson.rfp.id.toString(),
    rfpId: argsJson.rfp.id.toString(),
    blockHeight: action.receipt.block_height,
    editorId: action.receipt.predecessor_id,
    socialDbPostBlockHeight: 0,
    name: argsJson.rfp.snapshot.body.name,
    description: argsJson.rfp.snapshot.body.description,
    category: argsJson.rfp.snapshot.body.category,
    timestamp: argsJson.rfp.snapshot.body.timestamp,
    labels: argsJson.rfp.snapshot.body.labels,
    summary: argsJson.rfp.snapshot.body.summary,
    timeline: argsJson.rfp.snapshot.body.timeline,
    rfpVersion: argsJson.rfp.snapshot.body.rfp_version,
    rfpBodyVersion: argsJson.rfp.snapshot.body.rfp_body_version,
  }).save();
}


export async function handleEditRFP(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit rfp at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for edit rfp  ${action.id}`)
  }

  await handleRFPDump(action);
  
  const argsJson:EditRFPArgs = action.action.args.toJson();

  logger.info(`Edit RFP: ${JSON.stringify(argsJson)}`);

  const rfpSnapshot = await RfpSnapshot.get(argsJson.id.toString())

  // await RfpSnapshot.create({
    
  // })
}

export async function handleEditRFPTimeline(action: NearAction<FunctionCall>) {
  logger.info(`Handling edit rfp timeline at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for edit rfp timeline  ${action.id}`)
  }

  await handleRFPDump(action);
  const argsJson: EditRFPTimelineArgs = action.action.args.toJson();
  
  logger.info(`Edit RFP Timeline: ${JSON.stringify(argsJson)}`);

  const rfpSnapshot = await RfpSnapshot.get(argsJson.id.toString())

  // await RfpSnapshot.create({
  //   id: argsJson.id.toString(),
  //   rfpId: argsJson.id.toString(),
  //   blockHeight: action.receipt.block_height,
  //   editorId: action.receipt.predecessor_id,
  // })
}



export async function handleCancelRFP(action: NearAction<FunctionCall>) {
  logger.info(`Handling cancel rfp at ${action?.receipt?.block_height}`);

  if(!action.receipt){
    return logger.info(`No receipt found for cancel rfp  ${action.id}`)
  }
  
  await handleRFPDump(action);

  const argsJson: CancelRFPArgs = action.action.args.toJson();
  
}