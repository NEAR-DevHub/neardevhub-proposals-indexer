import { Block } from "@near-lake/primitives";
/**
 * Note: We only support javascript at the moment. We will support Rust, Typescript in a further release.
 */

/**
 * getBlock(block, context) applies your custom logic to a Block on Near and commits the data to a database.
 * context is a global variable that contains helper methods.
 * context.db is a subfield which contains helper methods to interact with your database.
 *
 * Learn more about indexers here:  https://docs.near.org/concepts/advanced/indexers
 *
 * @param {block} Block - A Near Protocol Block
 */
async function getBlock(block: Block) {
  const devhubOps = getDevHubOps(block);

  if (devhubOps.length > 0) {
    console.log({ devhubOps });
    const authorToProposalId = buildAuthorToProposalIdMap(block);
    const blockHeight = block.blockHeight;
    const blockTimestamp = block.header().timestampNanosec;
    await Promise.all(
      devhubOps.map((op) =>
        indexOp(op, authorToProposalId, blockHeight, blockTimestamp, context)
      )
    );
  }
}

function base64decode(encodedValue) {
  let buff = Buffer.from(encodedValue, "base64");
  return JSON.parse(buff.toString("utf-8"));
}

function base64toHex(encodedValue) {
  let buff = Buffer.from(encodedValue, "base64");
  return buff.toString("hex");
}

function getDevHubOps(block) {
  return block
    .actions()
    .filter((action) => action.receiverId === "devhub.near")
    .flatMap((action) =>
      action.operations
        .filter((operation) => operation["FunctionCall"])
        .map((operation) => ({
          ...operation["FunctionCall"],
          caller: action.predecessorId,
        }))
        .map((operation) => ({
          ...operation,
          methodName: operation.methodName || operation.method_name,
        }))
        .filter(
          (operation) =>
            operation.methodName === "edit_proposal" ||
            operation.methodName === "edit_proposal_internal" ||
            operation.methodName === "edit_proposal_timeline" ||
            (operation.methodName === "set_block_height_callback" &&
              operation.caller === "devhub.near") // callback from add_proposal from devhub contract
        )
        .map((functionCallOperation) => ({
          ...functionCallOperation,
          args: base64decode(functionCallOperation.args),
          receiptId: action.receiptId,
        }))
    );
}

// Borsh
function buildAuthorToProposalIdMap(block) {
  const stateChanges = block.streamerMessage.shards
    .flatMap((e) => e.stateChanges)
    .filter(
      (stateChange) =>
        stateChange.change.accountId === "devhub.near" &&
        stateChange.type === "data_update"
    );

  const addOrEditProposal = stateChanges
    .map((stateChange) => stateChange.change)
    .filter((change) => base64toHex(change.keyBase64).startsWith("0e"))
    .map((c) => ({
      k: Buffer.from(c.keyBase64, "base64"),
      v: Buffer.from(c.valueBase64, "base64"),
    }));

  const authorToProposalId = Object.fromEntries(
    addOrEditProposal.map((kv) => {
      return [
        kv.v.slice(9, 9 + kv.v.slice(5, 9).readUInt32LE()).toString("utf-8"),
        Number(kv.k.slice(1).readBigUInt64LE()),
      ];
    })
  );

  return authorToProposalId;
}

async function indexOp(
  op,
  authorToProposalId,
  blockHeight,
  blockTimestamp,
  context
) {
  let receipt_id = op.receiptId;

  let args = op.args;
  let author = Object.keys(authorToProposalId)[0];
  console.log(`Indexing ${op.methodName} by ${author} at ${blockHeight}`);
  console.log(authorToProposalId);
  let proposal_id = authorToProposalId[author] ?? null;
  let method_name = op.methodName;

  let err = await createDump(context, {
    receipt_id,
    method_name,
    block_height: blockHeight,
    block_timestamp: blockTimestamp,
    args: JSON.stringify(args),
    author,
    proposal_id,
  });
  if (err !== null) {
    return;
  }

  // currently Query API cannot tell if it's a failed receipt, so we estimate by looking the state changes.
  if (proposal_id === null) {
    console.log(
      `Receipt to ${method_name} with receipt_id ${receipt_id} at ${blockHeight} doesn't result in a state change, it's probably a failed receipt, please check`
    );
    return;
  }

  if (method_name === "set_block_height_callback") {
    let proposal = {
      id: proposal_id,
      author_id: author,
    };

    let err = await createProposal(context, proposal);
    if (err !== null) {
      return;
    }

    await createProposalSnapshot(context, {
      proposal_id,
      block_height: blockHeight,
      ts: blockTimestamp,
      views: 1,
      ...args.proposal.snapshot,
    });
  }

  if (method_name === "edit_proposal") {
    let labels = args.labels;
    let name = args.body.name;
    let category = args.body.category;
    let summary = args.body.summary;
    let description = args.body.description;
    let linked_proposals = args.body.linked_proposals;
    let requested_sponsorship_usd_amount =
      args.body.requested_sponsorship_usd_amount;
    let requested_sponsorship_paid_in_currency =
      args.body.requested_sponsorship_paid_in_currency;
    let requested_sponsor = args.body.requested_sponsor;
    let receiver_account = args.body.receiver_account;
    let supervisor = args.body.supervisor;
    let timeline = args.body.timeline;

    let result = await queryLatestViews(proposal_id);
    let proposal_snapshot = {
      proposal_id,
      block_height: blockHeight,
      ts: blockTimestamp, // Timestamp
      editor_id: author,
      labels,
      name,
      category,
      summary,
      description,
      linked_proposals,
      requested_sponsorship_usd_amount, // u32
      requested_sponsorship_paid_in_currency, // ProposalFundingCurrency
      requested_sponsor, // AccountId
      receiver_account, // AccountId
      supervisor, // Option
      timeline, // TimelineStatus
      views:
        result
          .thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots[0]
          .views + 1,
    };
    await createProposalSnapshot(context, proposal_snapshot);
  }

  if (method_name === "edit_proposal_timeline") {
    let result = await queryLatestSnapshot(proposal_id);

    if (Object.keys(result).length !== 0) {
      let latest_proposal_snapshot =
        result
          .thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots[0];
      console.log({
        method: "edit_proposal_timeline",
        latest_proposal_snapshot,
      });
      let proposal_snapshot = {
        proposal_id,
        block_height: blockHeight,
        ts: blockTimestamp,
        editor_id: author,
        labels: latest_proposal_snapshot.labels,
        name: latest_proposal_snapshot.name,
        category: latest_proposal_snapshot.category,
        summary: latest_proposal_snapshot.summary,
        description: latest_proposal_snapshot.description,
        linked_proposals: latest_proposal_snapshot.linked_proposals,
        requested_sponsorship_usd_amount:
          latest_proposal_snapshot.requested_sponsorship_usd_amount,
        requested_sponsorship_paid_in_currency:
          latest_proposal_snapshot.requested_sponsorship_paid_in_currency,
        requested_sponsor: latest_proposal_snapshot.requested_sponsor,
        receiver_account: latest_proposal_snapshot.receiver_account,
        supervisor: latest_proposal_snapshot.supervisor,
        timeline: args.timeline, // TimelineStatus
        views: latest_proposal_snapshot.views + 1,
      };
      await createProposalSnapshot(context, proposal_snapshot);
    } else {
      console.log("Empty object latest_proposal_snapshot result", { result });
    }
  }
}

async function createDump(
  context,
  {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    author,
    proposal_id,
  }
) {
  const dump = {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    author,
    proposal_id,
  };
  try {
    console.log("Creating a dump...");

    const mutationData = {
      dump,
    };
    await context.graphql(
      `
        mutation CreateDump($dump: thomasguntenaar_near_devhub_proposals_sierra_dumps_insert_input!) {
          insert_thomasguntenaar_near_devhub_proposals_sierra_dumps_one(
            object: $dump
          ) {
            receipt_id
          }
        }
      `,
      mutationData
    );
    console.log(
      `Dump ${author} ${method_name} proposal ${proposal_id} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating ${author} ${method_name} proposal ${proposal_id}: ${e}`
    );
    return e;
  }
}

async function createProposal(context, { id, author_id }) {
  const proposal = { id, author_id };
  try {
    console.log("Creating a Proposal");
    const mutationData = {
      proposal,
    };
    await context.graphql(
      `
      mutation CreateProposal($proposal: thomasguntenaar_near_devhub_proposals_sierra_proposals_insert_input!) {
        insert_thomasguntenaar_near_devhub_proposals_sierra_proposals_one(object: $proposal) {id}
      }
      `,
      mutationData
    );
    console.log(`Proposal ${id} has been added to the database`);
    return null;
  } catch (e) {
    console.log(`Error creating Proposal with id ${id}: ${e}`);
    return e;
  }
}

async function createProposalSnapshot(
  context,
  {
    proposal_id,
    block_height,
    ts, // Timestamp
    editor_id,
    labels,
    name,
    category,
    summary,
    description,
    linked_proposals, // Vec<ProposalId>
    requested_sponsorship_usd_amount, // u32
    requested_sponsorship_paid_in_currency, // ProposalFundingCurrency
    requested_sponsor, // AccountId
    receiver_account, // AccountId
    supervisor, // Option
    timeline, // TimelineStatus
    views,
  }
) {
  const proposal_snapshot = {
    proposal_id,
    block_height,
    ts,
    editor_id,
    labels,
    name,
    category,
    summary,
    description,
    linked_proposals:
      linked_proposals && linked_proposals.length
        ? linked_proposals.join(",")
        : "", // Vec<ProposalId>
    requested_sponsorship_usd_amount, // u32
    requested_sponsorship_paid_in_currency, // ProposalFundingCurrency
    requested_sponsor, // AccountId
    receiver_account, // AccountId
    supervisor, // Option<AccountId>
    views,
    timeline: JSON.stringify(timeline), // TimelineStatus
  };
  try {
    console.log("Creating a ProposalSnapshot");
    const mutationData = {
      proposal_snapshot,
    };
    await context.graphql(
      `
      mutation CreateProposalSnapshot($proposal_snapshot: thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots_insert_input!) {
        insert_thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots_one(object: $proposal_snapshot) {proposal_id, block_height}
      }
      `,
      mutationData
    );
    console.log(
      `Proposal Snapshot with proposal_id ${proposal_id} at block_height ${block_height} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating Proposal Snapshot with proposal_id ${proposal_id} at block_height ${block_height}: ${e}`
    );
    return e;
  }
}

const queryLatestSnapshot = async (proposal_id) => {
  const queryData = {
    proposal_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($proposal_id: Int!) {
        thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots(where: {proposal_id: {_eq: $proposal_id}}, order_by: {ts: desc}, limit: 1) {
          proposal_id
          block_height
          ts
          editor_id
          labels
          name
          category
          summary
          description
          linked_proposals
          requested_sponsorship_usd_amount
          requested_sponsorship_paid_in_currency
          requested_sponsor
          receiver_account
          supervisor
          timeline
          views
        }
      }
      `,
      queryData
    );
    console.log({ result });
    return result;
  } catch (e) {
    console.log("Error retrieving latest snapshot:", e);
    return null;
  }
};

const queryLatestViews = async (proposal_id) => {
  const queryData = {
    proposal_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($proposal_id: Int!) {
        thomasguntenaar_near_devhub_proposals_sierra_proposal_snapshots(where: {proposal_id: {_eq: $proposal_id}}, order_by: {ts: desc}, limit: 1) {
          proposal_id
          views
        }
      }
      `,
      queryData
    );
    console.log({ result });
    return result;
  } catch (e) {
    console.log("Error retrieving latest snapshot:", e);
    return null;
  }
};
