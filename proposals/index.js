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

    let latest_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);
    let labels = (linked_rfp === undefined || linked_rfp === null) ? args.labels : latest_snapshot.labels;

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

    let latest_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);
    let labels = (linked_rfp === undefined || linked_rfp === null) ? args.labels : latest_snapshot.labels;

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
    let latest_snapshot = await queryLatestRFPSnapshot(rfp_id, blockTimestamp);
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
      let latest_rfp_snapshot = await queryLatestRFPSnapshot(rfp_id, blockTimestamp);
      if (latest_rfp_snapshot) {
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
        console.log("Empty object latest_rfp_snapshot result", { latest_rfp_snapshot });
      }
    } catch (error) {
      console.error("Error editing rfp timeline:", error);
    }
  }
  if (method_name === "cancel_rfp") {
    try {
      let proposals_to_cancel = args.proposals_to_cancel;
      let proposals_to_unlink = args.proposals_to_unlink;

      let latest_rfp_snapshot = await queryLatestRFPSnapshot(rfp_id, blockTimestamp);
      if (latest_rfp_snapshot) {
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
        console.log("Empty object latest_rfp_snapshot result", { latest_rfp_snapshot });
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
  let latest_rfp_snapshot = await queryLatestRFPSnapshot(rfp_id, blockTimestamp);
  if (latest_rfp_snapshot) {
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
    console.log("Empty object latest_rfp_snapshot result", { latest_rfp_snapshot });
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
    let last_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);
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
    let latest_proposal_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);

    if (latest_proposal_snapshot) {
      let linked_rfp = new_rfp_id;
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
  let latest_proposal_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);

    if (latest_proposal_snapshot) {
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
      console.log("Empty object latest_proposal_snapshot result", { latest_proposal_snapshot });
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
        let latest_proposal_snapshot = await queryLatestProposalSnapshot(proposal_id, blockTimestamp);
        if (latest_proposal_snapshot) {
          let proposal_snapshot = {
            ...latest_proposal_snapshot,
            labels: new_labels,
            block_height: blockHeight,
            ts: blockTimestamp,
          };
          await createProposalSnapshot(context, proposal_snapshot);
        } else {
          console.log("Empty object latest_proposal_snapshot result", { latest_proposal_snapshot });
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
    await context.db.Dumps.insert(dump);
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
    await context.db.Proposals.insert(proposal);
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
    labels: JSON.stringify(labels),
    proposal_body_version,
    name,
    category,
    summary,
    description,
    linked_proposals: JSON.stringify(linked_proposals),
    linked_rfp, // Option<RFPId>
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
    await context.db.ProposalSnapshots.insert(proposal_snapshot);
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

function getLatestObject(array, blockTimestamp) {
  if (array == null || array.length === 0) {
    return null;
  }
  console.log(array.length);
  let result = array.reduce((prev, current) => (prev.ts > current.ts && prev.ts < blockTimestamp || current.ts >= blockTimestamp) ? prev : current);
  if (result == null || result.ts >= blockTimestamp) {
    return null;
  }
  return result;
}

const queryLatestProposalSnapshot = async (proposal_id, blockTimestamp) => {
  try {
    let snapshots = await context.db.ProposalSnapshots.select({proposal_id: proposal_id}, limit = null);
    let latest_snapshot = getLatestObject(snapshots, blockTimestamp);
    return latest_snapshot;
  } catch (e) {
    console.log("Error retrieving latest Proposal snapshot:", e);
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
    context.db.RfpDumps.insert(dump);
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
    await context.db.Rfps.insert(rfp);
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
    labels: JSON.stringify(labels),
    linked_proposals: JSON.stringify(linked_proposals),
    rfp_body_version,
    name,
    summary,
    description,
    views,
    timeline: JSON.stringify(timeline), // TimelineStatus
    submission_deadline,
  };
  try {
    console.log("Creating a rfpSnapshot");
    await context.db.RfpSnapshots.insert(rfp_snapshot);
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

const queryLatestRFPSnapshot = async (rfp_id, blockTimestamp) => {
  try {
    let snapshots = await context.db.RfpSnapshots.select({rfp_id: rfp_id}, limit = null);
    let latest_snapshot = getLatestObject(snapshots, blockTimestamp);
    return latest_snapshot;
  } catch (e) {
    console.log("Error retrieving latest RFP snapshot:", e);
    return null;
  }
};
