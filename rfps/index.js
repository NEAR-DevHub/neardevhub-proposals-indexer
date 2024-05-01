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
  // await context.db.Dumps.delete({ receipt_id: "FiKmh8utcScQVADhMwUZ1v6TfCtJZ6No8PcvqpFkNGPU"})
  // await context.db.Rfps.delete({ id: 1})
  const devhubOps = getDevHubOps(block);

  if (devhubOps.length > 0) {
    console.log({ devhubOps });
    const authorToProposalId = buildAuthorToRFPIdMap(block);
    const blockHeight = block.blockHeight;
    const blockTimestamp = block.header().timestampNanosec;
    await Promise.all(
      devhubOps.map((op) =>
        indexOp(op, authorToProposalId, blockHeight, blockTimestamp, context)
      )
    );
  }
}


// Borsh
function buildAuthorToRFPIdMap(block) {
  const stateChanges = block.streamerMessage.shards
    .flatMap((e) => e.stateChanges)
    .filter(
      (stateChange) =>
        stateChange.change.accountId === "truedove38.near" &&
        stateChange.type === "data_update"
    );

  const addOrEditProposal = stateChanges
    .map((stateChange) => stateChange.change)
    .filter((change) => base64toHex(change.keyBase64).startsWith("11"))
    .map((c) => ({
      k: Buffer.from(c.keyBase64, "base64"),
      v: Buffer.from(c.valueBase64, "base64"),
    }));

  const proposalIds = Object.fromEntries(
    addOrEditProposal.map((kv) => {
      return[
        "hey",
        Number(kv.k.slice(1).readBigUInt64LE())
      ]
    })
  );

  return proposalIds;
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
            operation.methodName === "edit_rfp" ||
            operation.methodName === "edit_rfp_internal" ||
            operation.methodName === "edit_rfp_timeline" ||
            (operation.methodName === "set_rfp_block_height_callback" &&
              operation.caller === "truedove38.near") // callback from add_rfp from devhub contract
        )
        .map((functionCallOperation) => ({
          ...functionCallOperation,
          args: base64decode(functionCallOperation.args),
          receiptId: action.receiptId,
        }))
    );
}

async function indexOp(
  op,
  authorToProposalId,
  blockHeight,
  blockTimestamp,
  context
) {
  let receipt_id = op.receiptId;
  let author = Object.keys(authorToProposalId)[0];
  let args = op.args;
  let rfp_id = authorToProposalId[author] ?? null;
  let method_name = op.methodName;

  let err = await createDump(context, {
    receipt_id,
    method_name,
    block_height: blockHeight,
    block_timestamp: blockTimestamp,
    args: JSON.stringify(args),
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
    };

    let err = await createrfp(context, rfp);
    if (err !== null) {
      return;
    }

    await createrfpSnapshot(context, {
      rfp_id,
      block_height: blockHeight,
      ts: blockTimestamp,
      views: 1,
      ...args.rfp.snapshot,
    });
  }

  if (method_name === "edit_rfp") {
    let labels = args.labels;
    let name = args.body.name;
    let category = args.body.category;
    let summary = args.body.summary;
    let description = args.body.description;
    let timeline = args.body.timeline;
    let submission_deadline = args.body.submission_deadline;

    let result = await queryLatestViews(rfp_id);
    let rfp_snapshot = {
      rfp_id,
      block_height: blockHeight,
      ts: blockTimestamp, // Timestamp
      labels,
      name,
      category,
      summary,
      description,
      timeline, // TimelineStatus
      submission_deadline,
      views:
        result
          .polyprogrammist_near_rfp_fix_editor_rfp_snapshots[0]
          .views + 1,
    };
    await createrfpSnapshot(context, rfp_snapshot);
  }

  if (method_name === "edit_rfp_timeline") {
    let result = await queryLatestSnapshot(rfp_id);

    if (Object.keys(result).length !== 0) {
      let latest_rfp_snapshot =
        result
          .polyprogrammist_near_rfp_fix_editor_rfp_snapshots[0];
      console.log({
        method: "edit_rfp_timeline",
        latest_rfp_snapshot,
      });
      let rfp_snapshot = {
        rfp_id,
        block_height: blockHeight,
        ts: blockTimestamp,
        labels: latest_rfp_snapshot.labels,
        name: latest_rfp_snapshot.name,
        category: latest_rfp_snapshot.category,
        summary: latest_rfp_snapshot.summary,
        description: latest_rfp_snapshot.description,
        timeline: args.timeline, // TimelineStatus
        submission_deadline: latest_rfp_snapshot.submission_deadline,
        views: latest_rfp_snapshot.views + 1,
      };
      await createrfpSnapshot(context, rfp_snapshot);
    } else {
      console.log("Empty object latest_rfp_snapshot result", { result });
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
    rfp_id,
  }
) {
  const dump = {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    rfp_id,
  };
  try {
    console.log("Creating a dump...");

    const mutationData = {
      dump,
    };
    await context.graphql(
      `
        mutation CreateDump($dump: polyprogrammist_near_rfp_fix_editor_dumps_insert_input!) {
          insert_polyprogrammist_near_rfp_fix_editor_dumps_one(
            object: $dump
          ) {
            receipt_id
          }
        }
      `,
      mutationData
    );
    console.log(
      `Dump ${method_name} rfp ${rfp_id} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating ${method_name} rfp ${rfp_id}: ${e}`
    );
    return e;
  }
}

async function createrfp(context, { id }) {
  const rfp = { id };
  try {
    console.log("Creating a rfp");
    const mutationData = {
      rfp,
    };
    await context.graphql(
      `
      mutation Createrfp($rfp: polyprogrammist_near_rfp_fix_editor_rfps_insert_input!) {
        insert_polyprogrammist_near_rfp_fix_editor_rfps_one(object: $rfp) {id}
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
    ts, // Timestamp
    labels,
    name,
    category,
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
    ts,
    labels,
    name,
    category,
    summary,
    description,
    views,
    timeline: JSON.stringify(timeline), // TimelineStatus
    submission_deadline,
  };
  try {
    console.log("Creating a rfpSnapshot");
    const mutationData = {
      rfp_snapshot,
    };
    await context.graphql(
      `
      mutation CreaterfpSnapshot($rfp_snapshot: polyprogrammist_near_rfp_fix_editor_rfp_snapshots_insert_input!) {
        insert_polyprogrammist_near_rfp_fix_editor_rfp_snapshots_one(object: $rfp_snapshot) {rfp_id, block_height}
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

const queryLatestSnapshot = async (rfp_id) => {
  const queryData = {
    rfp_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($rfp_id: Int!) {
        polyprogrammist_near_rfp_fix_editor_rfp_snapshots(where: {rfp_id: {_eq: $rfp_id}}, order_by: {ts: desc}, limit: 1) {
          rfp_id
          block_height
          ts
          labels
          name
          category
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
    console.log("Error retrieving latest snapshot:", e);
    return null;
  }
};

const queryLatestViews = async (rfp_id) => {
  const queryData = {
    rfp_id,
  };
  try {
    const result = await context.graphql(
      `
      query GetLatestSnapshot($rfp_id: Int!) {
        polyprogrammist_near_rfp_fix_editor_rfp_snapshots(where: {rfp_id: {_eq: $rfp_id}}, order_by: {ts: desc}, limit: 1) {
          rfp_id
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
