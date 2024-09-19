import { decodeRPCResponse, toBase64 } from "./utils";

export async function getProposalIds(blockHeight: number, accountId: string): Promise<number[]> {
  const response: { result: number[]; logs: any[]; block_height: number; block_hash: string; }  = await api.sendJsonRpc("query",{
    "request_type": "call_function",
    "block_id": blockHeight,
    "account_id": accountId,
    "method_name": "get_all_proposal_ids",
    "args_base64": "e30="
  }
);

  return decodeRPCResponse(response); 
}

export async function getProposal(blockHeight: number, accountId: string, proposalId: number): Promise<any> {
  const getProposalArgs = {
    proposal_id: proposalId
  };

  const argsBase64 = toBase64(getProposalArgs);

  const response = await api.sendJsonRpc("query",{
    "request_type": "call_function",
    "block_id": blockHeight,
    "account_id": accountId,
    "method_name": "get_proposal",
    "args_base64": argsBase64
  });

  return decodeRPCResponse(response);
}
