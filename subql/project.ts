import {
  NearDatasourceKind,
  NearHandlerKind,
  NearProject,
} from "@subql/types-near";

import * as dotenv from 'dotenv';
import path from 'path';

const mode = process.env.NODE_ENV || 'production';

// Load the appropriate .env file
const dotenvPath = path.resolve(__dirname, `.env${mode !== 'production' ? `.${mode}` : ''}`);
dotenv.config({ path: dotenvPath });

const project: NearProject = {
  specVersion: "1.0.0",
  name: "near-subql-starter",
  version: "0.0.1",
  runner: {
    node: {
      name: "@subql/node-near",
      version: "*",
    },
    query: {
      name: "@subql/query",
      version: "*",
    },
  },
  description:
    "This is an example project that indexes price oracle feeds from the NEAR blockchain using SubQuery",
  repository: "https://github.com/subquery/near-subql-starter",
  schema: {
    file: "./schema.graphql",
  },
  network: {
    // chainId is the EVM Chain ID, for Near Aurora this is 1313161554
    // https://chainlist.org/chain/1313161554
    chainId: process.env.CHAIN_ID!,
    /**
     * These endpoint(s) should be public non-pruned archive node
     * We recommend providing more than one endpoint for improved reliability, performance, and uptime
     * Public nodes may be rate limited, which can affect indexing speed
     * When developing your project we suggest getting a private API key
     * If you use a rate limited endpoint, adjust the --batch-size and --workers parameters
     * These settings can be found in your docker-compose.yaml, they will slow indexing but prevent your project being rate limited
     */
    endpoint: process.env.ENDPOINT!?.split(',') as string[] | string,
    bypassBlocks: [81003306], // This is a missing block from the NEAR mainnet chain that we are skipping
  },
  dataSources: [
    {
      kind: NearDatasourceKind.Runtime, // We use ethereum runtime since NEAR Aurora is a layer-2 that is compatible
      startBlock: 127235357, // You can set any start block you want here. This block was when the sweat_welcome.near address was created
      mapping: {
        file: "./dist/index.js",
        handlers: [
          // {
          //   handler: "handleBlock",
          //   kind: NearHandlerKind.Block,
          //   filter: {
          //     // sender: "devhub.near",
          //     // type: "Fu"
          //     // receiver: "devhub.near",

          //   },
          // },
          {
            handler: "handleTransaction",
            kind: NearHandlerKind.Transaction, // We use ethereum runtime since NEAR Aurora is a layer-2 that is compatible
            filter: {
              // sender: "devhub.near",
              // methodName:"",
              receiver: "devhub.near",
            },
          },
          // {
          //   handler: "handleAction",
          //   kind: NearHandlerKind.Action,
          //   filter: {
          //     type: "FunctionCall",
          //     methodName: "storage_deposit",
          //     receiver: "token.sweat",
          //     /*
          //     Filter examples 
          //  filter:
          //     type: DeleteAccount
          //     beneficiaryId: ""
          //  filter:
          //     type: AddKey
          //     publicKey: ""
          //     accessKey: ""
          //  filter:
          //     type: DeleteKey
          //     publicKey: ""
          //  filter:
          //     type: Stake
          //     publicKey: ""
          //      */
          //   },
          // },
          {
            handler: "handleActionFunctionCall",
            kind: NearHandlerKind.Action,
            filter: {
              type: "FunctionCall",
              methodName: "add_proposal",
              receiver: "devhub.near"
            },
          },
          {
            handler: "handleActionFunctionCall",
            kind: NearHandlerKind.Action,
            filter: {
              type: "FunctionCall",
              methodName: "edit_proposal",
              receiver: "devhub.near"
            },
          }
        ],
      },
    },
  ],
};

export default project;
