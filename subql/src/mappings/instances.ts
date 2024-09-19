export const INSTANCES: {
  [key: string]: {
    account: string;
    startBlockHeight: number;
  };
} = {
  devhub: {
    account: "devhub.near",
    // txn https://nearblocks.io/txns/J4Px3fsHRqLVhxfyku2kenqCYtkEG5R5NytC8uThXhHP
    startBlockHeight: 103193489,
  },
  eventsCommittee: {
     account: "events-committee.near",
     startBlockHeight: 118620288
  },
  infrastructureCommittee: {
    account:"infrastructure-committee.near",
    // txn https://nearblocks.io/txns/BjQ7uFbixv2TMPBAJiGetXQtjPy7ADozh22E2L1u1owK
    startBlockHeight: 119556377 
  },
}