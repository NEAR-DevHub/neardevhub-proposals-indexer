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
  const rfpOps = getRFPOps(block);
  const proposalOps = getProposalOps(block);

  const rfpOpsLen = rfpOps.length;
  const proposalOpsLen = proposalOps.length;

  if (rfpOpsLen > 0 || proposalOpsLen > 0) {
    const authorToRFPId = buildAuthorToRFPIdMap(block);
    const authorToProposalId = buildAuthorToProposalIdMap(block);
    const blockHeight = block.blockHeight;
    const blockTimestamp = block.header().timestampNanosec;
    try {
      await Promise.all(
        rfpOps.map((op) =>
          indexRFPsOp(op, authorToRFPId, blockHeight, blockTimestamp, context)
        ).concat(
          proposalOps.map((op) =>
            indexProposalsOp(op, authorToProposalId, blockHeight, blockTimestamp, context)
          ))
      );
    } catch (error) {
      console.error('Error processing block operations:', error);
    }
  }
}

function getAddOrEditObject(block, startsWith) {
  const stateChanges = block.streamerMessage.shards
    .flatMap((e) => e.stateChanges)
    .filter(
      (stateChange) =>
        stateChange.change.accountId === "truedove38.near" &&
        stateChange.type === "data_update"
    );

  const addOrEditObject = stateChanges
    .map((stateChange) => stateChange.change)
    // In devhub contract there is a field rfps: Vector<VersionedRFP> ( initially = rfps: Vector::new(StorageKey::RFPs) )
    // In StorageKey enum it comes on 17th position (0x11 in hex).
    // So 0x11 is used as a prefix for the collection keys (https://docs.near.org/sdk/rust/contract-structure/collections). 
    .filter((change) => base64toHex(change.keyBase64).startsWith(startsWith))
    .map((c) => ({
      k: Buffer.from(c.keyBase64, "base64"),
      v: Buffer.from(c.valueBase64, "base64"),
    }));

  return addOrEditObject;
}

// Borsh https://github.com/near/borsh#specification
function buildAuthorToRFPIdMap(block) {
  return Object.fromEntries(
    getAddOrEditObject(block, "11").map((kv) => {
      return [
        // Here we read enum VersionedRFP. So we skip enum byte. This enum has just one variant RFP. 
        // It contains id: u32 (4 bytes) and then account_id which is string. 
        // String is serialized as length: u32 (4 bytes) and then content of the string
        kv.v.slice(9, 9 + kv.v.slice(5, 9).readUInt32LE()).toString("utf-8"),
        // In Vector, key is prefix + index, where index is u32 in little-endian format. 
        // So we skip prefix with slice(1) and read index with readBigUint64LE().
        Number(kv.k.slice(1).readBigUInt64LE())
      ]
    })
  );
}

function buildAuthorToProposalIdMap(block) {
  return Object.fromEntries(
    getAddOrEditObject(block, "0e").map((kv) => {
      return [
        kv.v.slice(9, 9 + kv.v.slice(5, 9).readUInt32LE()).toString("utf-8"),
        Number(kv.k.slice(1).readBigUInt64LE()),
      ];
    })
  );
}

function base64decode(encodedValue) {
  let buff = Buffer.from(encodedValue, "base64");
  return JSON.parse(buff.toString("utf-8"));
}

function base64toHex(encodedValue) {
  let buff = Buffer.from(encodedValue, "base64");
  return buff.toString("hex");
}

function getDevHubOps(block, methodNames, callbackNames) {
  return block
    .actions()
    .filter((action) => action.receiverId === "truedove38.near")
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
            methodNames.includes(operation.methodName) ||
            (callbackNames.includes(operation.methodName) && operation.caller === "truedove38.near")
        )
        .map((functionCallOperation) => ({
          ...functionCallOperation,
          args: base64decode(functionCallOperation.args),
          receiptId: action.receiptId,
        }))
    );
}

function getProposalOps(block) {
  return getDevHubOps(block, ["edit_proposal", "edit_proposal_internal", "edit_proposal_linked_rfp", "edit_proposal_timeline"], ["set_block_height_callback"]);
}

function getRFPOps(block) {
  return getDevHubOps(block, ["edit_rfp", "edit_rfp_timeline", "edit_rfp_internal", "cancel_rfp"], ["set_rfp_block_height_callback"]);
}

function strArray(arr) {
  return arr && arr.length
        ? arr.join(",")
        : ""; // Vec<ProposalId>
}

async function indexProposalsOp(
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

    let linked_rfp = args.proposal.snapshot.linked_rfp;
    let linked_proposals = args.proposal.snapshot.linked_proposals;

    let proposal_snapshot = {
      ...args.proposal.snapshot,
      timeline: JSON.stringify(args.proposal.snapshot.timeline),
      proposal_id,
      block_height: blockHeight,
      proposal_version: args.proposal.proposal_version,
      social_db_post_block_height: 0,
      ts: blockTimestamp,
      views: 1,
      linked_proposals,
    }
    await createProposalSnapshot(context, proposal_snapshot);
    await checkAndUpdateLinkedProposals(proposal_id, linked_rfp, blockHeight, blockTimestamp);
  }

  if (method_name === "edit_proposal") {
    let linked_rfp = args.body.linked_rfp;

    let result = await queryLatestProposalViews(proposal_id);
    let latest_snapshot = result.polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
    let labels = (linked_rfp === undefined) ? args.labels : latest_snapshot.labels;

    let proposal_snapshot = {
      ...args.body,
      timeline: JSON.stringify(args.body.timeline),
      proposal_id,
      proposal_version: latest_snapshot.proposal_version,
      social_db_post_block_height: latest_snapshot.social_db_post_block_height,
      block_height: blockHeight,
      ts: blockTimestamp, // Timestamp
      editor_id: author,
      labels,
      linked_rfp,
      views: latest_snapshot.views + 1,
    };
    await createProposalSnapshot(context, proposal_snapshot);
    await checkAndUpdateLinkedProposals(proposal_id, linked_rfp, blockHeight, blockTimestamp);
  }

  if (method_name === "edit_proposal_internal") {
    let linked_rfp = args.body.linked_rfp;

    let result = await queryLatestProposalViews(proposal_id);
    let latest_snapshot = result.polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
    let labels = (linked_rfp === undefined) ? args.labels : latest_snapshot.labels;

    let proposal_snapshot = {
      ...args.body,
      timeline: JSON.stringify(args.body.timeline),
      proposal_id,
      proposal_version: latest_snapshot.proposal_version,
      social_db_post_block_height: latest_snapshot.social_db_post_block_height,
      block_height: blockHeight,
      ts: blockTimestamp, // Timestamp
      editor_id: author,
      labels,
      linked_rfp,
      views: latest_snapshot.views + 1,
    };
    await createProposalSnapshot(context, proposal_snapshot);
    await checkAndUpdateLinkedProposals(proposal_id, linked_rfp, blockHeight, blockTimestamp);
  }

  if (method_name === "edit_proposal_timeline") {
    editProposalTimeline(context, proposal_id, author, blockHeight, blockTimestamp, args.timeline);
  }
  if (method_name == "edit_proposal_linked_rfp") {
    editProposalLinkedRFP(context, proposal_id, args.rfp_id, author, blockHeight, blockTimestamp, true);
  }
};

async function indexRFPsOp(
  op,
  authorToRFPId,
  blockHeight,
  blockTimestamp,
  context
) {
  let receipt_id = op.receiptId;
  let author = Object.keys(authorToRFPId)[0];
  let args = op.args;
  let rfp_id = authorToRFPId[author] ?? null;
  let method_name = op.methodName;

  console.log(`Indexing ${method_name} by ${author} at ${blockHeight}, rfp_id = ${rfp_id}`);

  let err = await createRFPDump(context, {
    receipt_id,
    method_name,
    block_height: blockHeight,
    block_timestamp: blockTimestamp,
    args: JSON.stringify(args),
    author,
    rfp_id,
  });
  if (err !== null) {
    return;
  }

  // currently Query API cannot tell if it's a failed receipt, so we estimate by looking the state changes.
  if (rfp_id === null) {
    console.log(
      `Receipt to ${method_name} with receipt_id ${receipt_id} at ${blockHeight} doesn't result in a state change, it's probably a failed receipt, please check`
    );
    return;
  }

  if (method_name === "set_rfp_block_height_callback") {
    let rfp = {
      id: rfp_id,
      author_id: author,
    };

    let err = await createRFP(context, rfp);
    if (err !== null) {
      return;
    }

    await createrfpSnapshot(context, {
      ...args.rfp.snapshot,
      timeline: JSON.stringify(args.rfp.snapshot.timeline),
      rfp_id,
      linked_proposals: [],
      block_height: blockHeight,
      rfp_version: args.rfp.rfp_version,
      social_db_post_block_height: 0,
      ts: blockTimestamp,
      views: 1,
    });
  }

  if (method_name === "edit_rfp") {
    let labels = args.labels;
    let result = await queryLatestRFPViews(rfp_id);
    let latest_snapshot = result.polyprogrammist_near_devhub_objects_test_rfp_snapshots[0];
    let rfp_snapshot = {
      ...args.body,
      timeline: JSON.stringify(args.body.timeline),
      rfp_id,
      block_height: blockHeight,
      social_db_post_block_height: latest_snapshot.social_db_post_block_height,
      rfp_version: latest_snapshot.rfp_version,
      ts: blockTimestamp, // Timestamp
      editor_id: author,
      linked_proposals: latest_snapshot.linked_proposals,
      labels,
      views:latest_snapshot.views + 1,
    };
    await createrfpSnapshot(context, rfp_snapshot);
    await checkAndUpdateLabels(latest_snapshot.labels, labels, latest_snapshot.linked_proposals, blockHeight, blockTimestamp);
  }

  if (method_name === "edit_rfp_timeline") {
    try {
      let result = await queryLatestRFPSnapshot(rfp_id);
      if (Object.keys(result).length !== 0) {
        let latest_rfp_snapshot =
          result
            .polyprogrammist_near_devhub_objects_test_rfp_snapshots[0];
        let rfp_snapshot = {
          ...latest_rfp_snapshot,
          rfp_id,
          block_height: blockHeight,
          ts: blockTimestamp,
          editor_id: author,
          timeline: JSON.stringify(args.timeline), // TimelineStatus
          views: latest_rfp_snapshot.views + 1,
        };
        await createrfpSnapshot(context, rfp_snapshot);
      } else {
        console.log("Empty object latest_rfp_snapshot result", { result });
      }
    } catch (error) {
      console.error("Error editing rfp timeline:", error);
    }
  }
  if (method_name === "cancel_rfp") {
    try {
      let proposals_to_cancel = args.proposals_to_cancel;
      let proposals_to_unlink = args.proposals_to_unlink;

      let result = await queryLatestRFPSnapshot(rfp_id);
      if (Object.keys(result).length !== 0) {
        let latest_rfp_snapshot =
          result
            .polyprogrammist_near_devhub_objects_test_rfp_snapshots[0];

        let linked_proposals = latest_rfp_snapshot.linked_proposals;
        for (let proposal_id of proposals_to_unlink) {
          linked_proposals = removeFromLinkedProposals(linked_proposals, proposal_id);
          await editProposalLinkedRFP(context, proposal_id, null, author, blockHeight, blockTimestamp, false);
        }

        for (let proposal_id of proposals_to_cancel) {
          await editProposalTimeline(context, proposal_id, author, blockHeight, blockTimestamp, {"status": "CANCELLED"});
        }

        let rfp_snapshot = {
          ...latest_rfp_snapshot,
          rfp_id,
          block_height: blockHeight,
          ts: blockTimestamp,
          editor_id: author,
          timeline: JSON.stringify({"status": "CANCELLED"}), // TimelineStatus
          linked_proposals,
          views: latest_rfp_snapshot.views + 1,
        };
        await createrfpSnapshot(context, rfp_snapshot);
      } else {
        console.log("Empty object latest_rfp_snapshot result", { result });
      }
    } catch (error) {
      console.error("Error editing rfp timeline:", error);
    }
  }
}

function arrayFromStr(str) {
  return str ? str.split(",").filter((x) => x !== ""): [];
}

function addToLinkedProposals(linked_proposals, proposal_id) {
  linked_proposals.push(proposal_id);
  return linked_proposals;
}

function removeFromLinkedProposals(linked_proposals, proposal_id) {
  return linked_proposals.filter((id) => id !== proposal_id);
}

async function modifySnapshotLinkedProposal(rfp_id, proposal_id, blockHeight, blockTimestamp, modifyCallback) {
  let result = await queryLatestRFPSnapshot(rfp_id);

  if (Object.keys(result).length !== 0) {
    let latest_rfp_snapshot =
      result
        .polyprogrammist_near_devhub_objects_test_rfp_snapshots[0];

    let linked_proposals = modifyCallback(latest_rfp_snapshot.linked_proposals, proposal_id);
    let rfp_snapshot = {
      ...latest_rfp_snapshot,
      rfp_id,
      linked_proposals: linked_proposals,
      block_height: blockHeight,
      ts: blockTimestamp,
    };
    await createrfpSnapshot(context, rfp_snapshot);
  } else {
    console.log("Empty object latest_rfp_snapshot result", { result });
  }
}

async function addLinkedProposalToSnapshot(rfp_id, new_linked_proposal, blockHeight, blockTimestamp) {
  await modifySnapshotLinkedProposal(rfp_id, new_linked_proposal, blockHeight, blockTimestamp, addToLinkedProposals);
}

async function removeLinkedProposalFromSnapshot(rfp_id, proposal_id, blockHeight, blockTimestamp) {
  await modifySnapshotLinkedProposal(rfp_id, proposal_id, blockHeight, blockTimestamp, removeFromLinkedProposals);
}

async function checkAndUpdateLinkedProposals(proposal_id, new_linked_rfp, blockHeight, blockTimestamp) {
  try {
    let latest_linked_rfp = await queryLatestLinkedRFP(proposal_id, blockTimestamp);
    let last_snapshot = latest_linked_rfp.polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
    let latest_linked_rfp_id = undefined;
    if (last_snapshot != undefined) {
      latest_linked_rfp_id = last_snapshot.linked_rfp;
    }

    if (new_linked_rfp !== latest_linked_rfp_id) {
      if (new_linked_rfp !== undefined && new_linked_rfp !== null) {
        console.log(`Adding linked_rfp ${new_linked_rfp} to proposal ${proposal_id}`)
        await addLinkedProposalToSnapshot(new_linked_rfp, proposal_id, blockHeight, blockTimestamp);
        console.log(`Proposal added to new RFP snapshot`)
      }
      if (latest_linked_rfp_id !== undefined && latest_linked_rfp_id !== null) {
        console.log(`Removing linked_rfp ${latest_linked_rfp_id} from proposal ${proposal_id}`)
        await removeLinkedProposalFromSnapshot(latest_linked_rfp_id, proposal_id, blockHeight, blockTimestamp);
        console.log(`Proposal removed from old RFP snapshot`)
      }
    }
  } catch (error) {
    console.error("Error checking and updating linked proposals:", error);
  }
}

async function editProposalLinkedRFP(context, proposal_id, new_rfp_id, author, blockHeight, blockTimestamp, updateRfpSnapshot) {
    let result = await queryLatestProposalSnapshot(proposal_id);

    if (Object.keys(result).length !== 0) {
      let linked_rfp = new_rfp_id;
      let latest_proposal_snapshot =
        result
          .polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
      let proposal_snapshot = {
        ...latest_proposal_snapshot,
        proposal_id,
        linked_rfp: linked_rfp,
        block_height: blockHeight,
        ts: blockTimestamp,
        editor_id: author,
        views: latest_proposal_snapshot.views + 1,
      };
      await createProposalSnapshot(context, proposal_snapshot);
      if (updateRfpSnapshot) {
        await checkAndUpdateLinkedProposals(proposal_id, linked_rfp, blockHeight, blockTimestamp);
      }
    }
}

async function editProposalTimeline(context, proposal_id, author, blockHeight, blockTimestamp, timeline) {
  let result = await queryLatestProposalSnapshot(proposal_id);

    if (Object.keys(result).length !== 0) {
      let latest_proposal_snapshot =
        result
          .polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
      let proposal_snapshot = {
        ...latest_proposal_snapshot,
        proposal_id,
        block_height: blockHeight,
        ts: blockTimestamp,
        editor_id: author,
        timeline: JSON.stringify(timeline), // TimelineStatus
        views: latest_proposal_snapshot.views + 1,
      };
      await createProposalSnapshot(context, proposal_snapshot);
    } else {
      console.log("Empty object latest_proposal_snapshot result", { result });
    }
}

async function checkAndUpdateLabels(old_labels, new_labels, linked_proposals, blockHeight, blockTimestamp) {
  try {
    const eqSet = (xs, ys) =>
      xs.size === ys.size &&
      [...xs].every((x) => ys.has(x));

    if (old_labels == undefined) {
      old_labels = [];
    }

    if (!eqSet(new Set(old_labels), new Set(new_labels))) {
      for (let proposal_id of linked_proposals) {
        let result = await queryLatestProposalSnapshot(proposal_id);
        if (Object.keys(result).length !== 0) {
          let latest_proposal_snapshot =
            result
              .polyprogrammist_near_devhub_objects_test_proposal_snapshots[0];
          let proposal_snapshot = {
            ...latest_proposal_snapshot,
            labels: new_labels,
            block_height: blockHeight,
            ts: blockTimestamp,
          };
          await createProposalSnapshot(context, proposal_snapshot);
        } else {
          console.log("Empty object latest_proposal_snapshot result", { result });
        }
      }
    }
  } catch (error) {
    console.error("Error checking and updating labels:", error);
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
        mutation CreateDump($dump: polyprogrammist_near_devhub_objects_test_dumps_insert_input!) {
          insert_polyprogrammist_near_devhub_objects_test_dumps_one(
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
      mutation CreateProposal($proposal: polyprogrammist_near_devhub_objects_test_proposals_insert_input!) {
        insert_polyprogrammist_near_devhub_objects_test_proposals_one(object: $proposal) {id}
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
    social_db_post_block_height,
    proposal_version,
    block_height,
    ts, // Timestamp
    editor_id,
    labels,
    proposal_body_version,
    name,
    category,
    summary,
    description,
    linked_proposals, // Vec<ProposalId>
    linked_rfp, // Option<RFPId>
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
    social_db_post_block_height,
    proposal_version,
    block_height,
    ts,
    editor_id,
    labels,
    proposal_body_version,
    name,
    category,
    summary,
    description,
    linked_proposals: linked_proposals,
    linked_rfp, // Option<RFPId>
    requested_sponsorship_usd_amount, // u32
    requested_sponsorship_paid_in_currency, // ProposalFundingCurrency
    requested_sponsor, // AccountId
    receiver_account, // AccountId
    supervisor, // Option<AccountId>
    views,
    timeline: timeline, // TimelineStatus
  };
  try {
    console.log("Creating a ProposalSnapshot");
    const mutationData = {
      proposal_snapshot,
    };
    await context.graphql(
      `
      mutation CreateProposalSnapshot($proposal_snapshot: polyprogrammist_near_devhub_objects_test_proposal_snapshots_insert_input!) {
        insert_polyprogrammist_near_devhub_objects_test_proposal_snapshots_one(object: $proposal_snapshot) {proposal_id, block_height}
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

const queryLatestProposalSnapshot = async (proposal_id) => {
  const queryData = {
    proposal_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($proposal_id: Int!) {
        polyprogrammist_near_devhub_objects_test_proposal_snapshots(where: {proposal_id: {_eq: $proposal_id}}, order_by: {ts: desc}, limit: 1) {
          proposal_id
          block_height
          proposal_version
          ts
          editor_id
          social_db_post_block_height
          labels
          proposal_body_version
          name
          category
          summary
          description
          linked_proposals
          linked_rfp
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
    console.log("Error retrieving latest Proposal snapshot:", e);
    return null;
  }
};

const queryLatestProposalViews = async (proposal_id) => {
  const queryData = {
    proposal_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($proposal_id: Int!) {
        polyprogrammist_near_devhub_objects_test_proposal_snapshots(where: {proposal_id: {_eq: $proposal_id}}, order_by: {ts: desc}, limit: 1) {
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
    console.log("Error retrieving latest  Proposal snapshot for views:", e);
    return null;
  }
};

async function createRFPDump(
  context,
  {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    author,
    rfp_id,
  }
) {
  const dump = {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    author,
    rfp_id,
  };
  try {
    console.log("Creating a dump...");

    const mutationData = {
      dump,
    };
    await context.graphql(
      `
        mutation CreateDump($dump: polyprogrammist_near_devhub_objects_test_rfp_dumps_insert_input!) {
          insert_polyprogrammist_near_devhub_objects_test_rfp_dumps_one(
            object: $dump
          ) {
            receipt_id
          }
        }
      `,
      mutationData
    );
    console.log(
      `Dump ${author} ${method_name} rfp ${rfp_id} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating ${author} ${method_name} rfp ${rfp_id}: ${e}`
    );
    return e;
  }
}

async function createRFP(context, { id, author_id }) {
  const rfp = { id, author_id };
  try {
    console.log("Creating a rfp");
    const mutationData = {
      rfp,
    };
    await context.graphql(
      `
      mutation Createrfp($rfp: polyprogrammist_near_devhub_objects_test_rfps_insert_input!) {
        insert_polyprogrammist_near_devhub_objects_test_rfps_one(object: $rfp) {id}
      }
      `,
      mutationData
    );
    console.log(`rfp ${id} has been added to the database`);
    return null;
  } catch (e) {
    console.log(`Error creating rfp with id ${id}: ${e}`);
    return e;
  }
}

async function createrfpSnapshot(
  context,
  {
    rfp_id,
    block_height,
    social_db_post_block_height,
    rfp_version,
    ts, // Timestamp
    editor_id,
    labels,
    linked_proposals,
    rfp_body_version,
    name,
    summary,
    description,
    timeline, // TimelineStatus
    submission_deadline,
    views,
  }
) {
  const rfp_snapshot = {
    rfp_id,
    block_height,
    social_db_post_block_height,
    rfp_version,
    ts,
    editor_id,
    labels,
    linked_proposals,
    rfp_body_version,
    name,
    summary,
    description,
    views,
    timeline: timeline, // TimelineStatus
    submission_deadline,
  };
  try {
    console.log("Creating a rfpSnapshot");
    const mutationData = {
      rfp_snapshot,
    };
    await context.graphql(
      `
      mutation CreaterfpSnapshot($rfp_snapshot: polyprogrammist_near_devhub_objects_test_rfp_snapshots_insert_input!) {
        insert_polyprogrammist_near_devhub_objects_test_rfp_snapshots_one(object: $rfp_snapshot) {rfp_id, block_height}
      }
      `,
      mutationData
    );
    console.log(
      `rfp Snapshot with rfp_id ${rfp_id} at block_height ${block_height} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating rfp Snapshot with rfp_id ${rfp_id} at block_height ${block_height}: ${e}`
    );
    return e;
  }
}

const queryLatestLinkedRFP = async (proposal_id, blockTimestamp) => {
  const queryData = {
    proposal_id,
    timestamp: blockTimestamp,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestLinkedRFP($proposal_id: Int!, $timestamp: numeric!) {
        polyprogrammist_near_devhub_objects_test_proposal_snapshots(where: {proposal_id: {_eq: $proposal_id}, ts: {_lt: $timestamp}}, order_by: {ts: desc}, limit: 1) {
          proposal_id
          linked_rfp
        }
      }
      `,
      queryData
    );
    console.log({ result });
    return result;
  } catch (e) {
    console.log("Error retrieving latest linked RFP:", e);
    return null;
  }
}

const queryLatestRFPSnapshot = async (rfp_id) => {
  const queryData = {
    rfp_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($rfp_id: Int!) {
        polyprogrammist_near_devhub_objects_test_rfp_snapshots(where: {rfp_id: {_eq: $rfp_id}}, order_by: {ts: desc}, limit: 1) {
          rfp_id
          block_height
          rfp_version
          ts
          editor_id
          social_db_post_block_height
          labels
          linked_proposals
          rfp_body_version
          name
          summary
          description
          timeline
          submission_deadline
          views
        }
      }
      `,
      queryData
    );
    console.log({ result });
    return result;
  } catch (e) {
    console.log("Error retrieving latest RFP snapshot:", e);
    return null;
  }
};

const  queryLatestRFPViews = async (rfp_id) => {
  const queryData = {
    rfp_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($rfp_id: Int!) {
        polyprogrammist_near_devhub_objects_test_rfp_snapshots(where: {rfp_id: {_eq: $rfp_id}}, order_by: {ts: desc}, limit: 1) {
          rfp_id
          linked_proposals
          views
        }
      }
      `,
      queryData
    );
    console.log({ result });
    return result;
  } catch (e) {
    console.log("Error retrieving latest RFP snapshot for views:", e);
    return null;
  }
};
