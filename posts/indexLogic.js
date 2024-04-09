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
    const authorToPostId = buildAuthorToPostIdMap(block);
    const blockHeight = block.blockHeight;
    const blockTimestamp = block.header().timestampNanosec;
    await Promise.all(
      devhubOps.map((op) =>
        indexOp(op, authorToPostId, blockHeight, blockTimestamp, context)
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
    .filter((action) => action.receiverId === "devgovgigs.near")
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
            operation.methodName === "add_post" ||
            operation.methodName === "edit_post" ||
            operation.methodName === "add_like"
        )
        .map((functionCallOperation) => ({
          ...functionCallOperation,
          args: base64decode(functionCallOperation.args),
          receiptId: action.receiptId,
        }))
    );
}

function buildAuthorToPostIdMap(block) {
  const stateChanges = block.streamerMessage.shards
    .flatMap((e) => e.stateChanges)
    .filter(
      (stateChange) =>
        stateChange.change.accountId === "devgovgigs.near" &&
        stateChange.type === "data_update"
    );
  const addOrEditPost = stateChanges
    .map((stateChange) => stateChange.change)
    .filter((change) => base64toHex(change.keyBase64).startsWith("05"))
    .map((c) => ({
      k: Buffer.from(c.keyBase64, "base64"),
      v: Buffer.from(c.valueBase64, "base64"),
    }));
  const authorToPostId = Object.fromEntries(
    addOrEditPost.map((kv) => [
      kv.v.slice(13, 13 + kv.v.slice(9, 13).readUInt32LE()).toString("utf-8"),
      Number(kv.k.slice(1).readBigUInt64LE()),
    ])
  );
  return authorToPostId;
}

async function indexOp(
  op,
  authorToPostId,
  blockHeight,
  blockTimestamp,
  context
) {
  let receipt_id = op.receiptId;
  let caller = op.caller;
  let args = op.args;
  let post_id = authorToPostId[op.caller] ?? null;
  let method_name = op.methodName;

  if (method_name == "add_like") {
    post_id = args.post_id;
  }
  let err = await createDump(context, {
    receipt_id,
    method_name,
    block_height: blockHeight,
    block_timestamp: blockTimestamp,
    args: JSON.stringify(args),
    caller,
    post_id,
  });
  if (err !== null) {
    return;
  }

  // currently Query API cannot tell if it's a failed receipt, so we estimate by looking the state changes.
  if (post_id === null) {
    console.log(
      `Receipt to ${method_name} with receipt_id ${receipt_id} at ${blockHeight} doesn't result in a state change, it's probably a failed receipt, please check`
    );
    return;
  }

  if (method_name === "add_like") {
    let like = {
      post_id,
      author_id: caller,
      ts: blockTimestamp,
    };
    await createLike(context, like);
    return;
  }

  if (method_name === "add_post") {
    let parent_id = args.parent_id;

    let post = {
      id: post_id,
      parent_id,
      author_id: caller,
    };
    let err = await createPost(context, post);
    if (err !== null) {
      return;
    }
  }

  if (method_name === "add_post" || method_name === "edit_post") {
    let labels = args.labels;
    let post_type = args.body.post_type;
    let description = args.body.description;
    let name = args.body.name;
    let sponsorship_token = args.body.sponsorship_token;
    let sponsorship_amount = args.body.amount;
    let sponsorship_supervisor = args.body.supervisor;

    let post_snapshot = {
      post_id,
      block_height: blockHeight,
      ts: blockTimestamp,
      editor_id: caller,
      labels,
      post_type,
      description,
      name,
      sponsorship_token,
      sponsorship_amount,
      sponsorship_supervisor,
    };
    await createPostSnapshot(context, post_snapshot);
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
    caller,
    post_id,
  }
) {
  const dump = {
    receipt_id,
    method_name,
    block_height,
    block_timestamp,
    args,
    caller,
    post_id,
  };
  try {
    console.log("Creating a dump...");

    const mutationData = {
      dump,
    };
    await context.graphql(
      `
        mutation CreateDump($dump: bo_near_devhub_v38_dumps_insert_input!) {
          insert_bo_near_devhub_v38_dumps_one(
            object: $dump
          ) {
            receipt_id
          }
        }
      `,
      mutationData
    );
    console.log(
      `Dump ${caller} ${method_name} post ${post_id} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating ${caller} ${method_name} post ${post_id}: ${e}`
    );
    return e;
  }
}

async function createPost(context, { id, parent_id, author_id }) {
  const post = { id, parent_id, author_id };
  try {
    console.log("Creating a Post");
    const mutationData = {
      post,
    };
    await context.graphql(
      `
      mutation CreatePost($post: bo_near_devhub_v38_posts_insert_input!) {
        insert_bo_near_devhub_v38_posts_one(object: $post) {id}
      }
      `,
      mutationData
    );
    console.log(`Post ${id} has been added to the database`);
    return null;
  } catch (e) {
    console.log(`Error creating Post with post_id ${id}: ${e}`);
    return e;
  }
}

async function createPostSnapshot(
  context,
  {
    post_id,
    block_height,
    ts,
    editor_id,
    labels,
    post_type,
    description,
    name,
    sponsorship_token,
    sponsorship_amount,
    sponsorship_supervisor,
  }
) {
  const post_snapshot = {
    post_id,
    block_height,
    ts,
    editor_id,
    labels,
    post_type,
    description,
    name,
    sponsorship_token: JSON.stringify(sponsorship_token),
    sponsorship_amount,
    sponsorship_supervisor,
  };
  try {
    console.log("Creating a PostSnapshot");
    const mutationData = {
      post_snapshot,
    };
    await context.graphql(
      `
      mutation CreatePostSnapshot($post_snapshot: bo_near_devhub_v38_post_snapshots_insert_input!) {
        insert_bo_near_devhub_v38_post_snapshots_one(object: $post_snapshot) {post_id, block_height}
      }
      `,
      mutationData
    );
    console.log(
      `Post Snapshot with post_id ${post_id} at block_height ${block_height} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating Post Snapshot with post_id ${post_id} at block_height ${block_height}: ${e}`
    );
    return e;
  }
}

async function createLike(context, { post_id, author_id, ts }) {
  try {
    console.log("Creating a Like");
    const mutationData = {
      author_id,
      post_id,
      ts,
    };
    await context.graphql(
      `
      mutation CreateLike($author_id: String, $post_id: Int, $ts: numeric) {
        insert_bo_near_devhub_v38_likes_one(
          on_conflict: {constraint: likes_pkey, update_columns: ts, where: {ts: {_lt: $ts}}}
          object: {post_id: $post_id, ts: $ts, author_id: $author_id}
        ) {
          author_id
          post_id
          ts
        }
      }
      `,
      mutationData
    );
    console.log(
      `Like ${post_id} by ${author_id} has been added to the database`
    );
    return null;
  } catch (e) {
    console.log(
      `Error creating Like to post_id ${post_id} by ${author_id}: ${e}`
    );
    return e;
  }
}
