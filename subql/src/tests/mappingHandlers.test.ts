import { subqlTest } from "@subql/testing";
import { NearActionEntity } from "../types";

/**
 * Source: https://academy.subquery.network/indexer/build/testing.html#example-project
 */

subqlTest(
  "handleEvent test", // test name
  1000003, // block height to process
  [
    NearActionEntity.create({
      id: "0x0ca3c88eaa25af380f243273e83ba2e161b207d935357af063e2bd5b8a2e9c40", // Replace this with the actual block hash for block 103
      // field1: 1000003,
      // id: string,
      sender: "thomasguntenaar.near",
      receiver: "devhub.near",
      amount: 10000000, // Changed amount to BigInt
    }),
  ], // dependent entities
  [
    NearActionEntity.create({
      id: "0x0ca3c88eaa25af380f243273e83ba2e161b207d935357af063e2bd5b8a2e9c40", // Replace this with the actual block hash for block 103
      sender: "thomasguntenaar.near",
      receiver: "devhub.near",
      amount: 10000000, // Changed amount to BigInt
    }),
  ], // expected entities
  "handleEvent" //handler name
);