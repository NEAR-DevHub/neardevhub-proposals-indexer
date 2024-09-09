import { NearActionEntity, TestProposal } from "../types";
import {
  NearTransaction,
  NearAction,
  Transfer,
  FunctionCall,
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
  }).save();

}