import { subqlTest } from "@subql/testing";
import {  ProposalSnapshot, Proposal, LinkedProposal } from "../types";

/**
 * Source: https://academy.subquery.network/indexer/build/testing.html#example-project
 */
// maguila.near add_proposal 127684275
// gagdiez.near	edit_proposal	127721183 // But here there is no proposal added yet.
// add_proposal -> edit_proposal 
// 127273095 -> 127273392
subqlTest(
  "should add proposal without a problem",
  127273095, // block height to process Here it should at the proposal from 127273095
  [
    Proposal.create({
      id: "devhub.near_94",
      authorId: "24a2788251373b64d58200665f12b00cfb2d6c9d2dc79b209d39cd0e433f5b3f",
      instance: "devhub.near",
    }),
  ], // dependent entities
  [
    Proposal.create({
      id: "devhub.near_194",
      authorId: "24a2788251373b64d58200665f12b00cfb2d6c9d2dc79b209d39cd0e433f5b3f",
      instance: "devhub.near",
    }),
    ProposalSnapshot.create({
      id: "devhub.near_194",
      proposalId: "devhub.near_194",
      blockHeight: 127273095,
      proposalBodyVersion: "V0",
      name: "Funding for Race of Sloths [July-August 2024]",
      category: "Tooling & Infrastructure",
      socialDbPostBlockHeight: 0, // social.near set later gives a result 127273099 source: https://nearblocks.io/txns/GZ3XrGCFeMYxu8ueeRTDDrhSXGhvVxyyLYKNUnXaZL1j#execution
      requestedSponsorshipUsdAmount: "19050", 
      requestedSponsorshipPaidInCurrency: "USDT",
      requestedSponsor: "neardevdao.near",
      receiverAccount: "24a2788251373b64d58200665f12b00cfb2d6c9d2dc79b209d39cd0e433f5b3f",
      timeline: "{status: 'DRAFT'}",
      summary: "https://race-of-sloths.com\nRace of Sloth was successfully launched at the beginning of July. \nDuring this period we collected feedback, upgraded our GitHub bot, launched marketing activities (X,  Telegram), made a raffle for tickets to the UARust conference, and prepared a strategy for OctoberRoS.\n\nResults so far (July + August): \n- 50 developers joined Race of Sloths\n- 9 Hall of Fame members\n- 240+ Pull Requests with Race of Sloths",
      description: "Race of Sloths is a friendly competition where you can participate in challenges and compete with other open-source contributors within your normal workflow\n\nFor contributors:\n• Tag the bot inside your pull requests\n• Wait for the maintainer to review and score your pull request\n• Check out position in the leaderboard on the landing page\n• Keep weekly and monthly streaks to reach higher positions\n• Boast your contributions with a dynamic picture of your Profile\n\nFor maintainers:\n• Score pull requests that participate in the Race of Sloths\n• Engage contributors with fair scoring and fast responses so they keep their streaks\n• Promote the Race to the point where the Race starts promoting you\n• Grow the community of your contributors\n\nWe use NEAR for the backend implementation and will use on-chain rewards going forward, and as such onboard real open source developers to NEAR.\n\nlink to GitHub project: https://github.com/orgs/NEAR-DevHub/projects/6\nlink to GitHub repository: https://github.com/NEAR-DevHub/race-of-sloths\nlink to Website: https://race-of-sloths.com/\nlink to X: https://x.com/race_of_sloths\n\nPlan for September-November:\n\n• Add projects new projects with dependencies from NEAR\n• Attract new developers to Race of Sloths out of the NEAR ecosystem\n• Launch OctoberRoS \n\nTeam composition:\n• Alex Botezatu - ops lead - ex. NDC, Aurora, Bitfury\n• Gleb Palienko - product/project manager - ex. Calimero, Boosty labs, Bitfury\n• Artur-Yurii Korchynskyi - tech lead - ex. NDC, GGXchain\n• Paula Vulić - marketing lead - ex. Calimero\n• Andrii Saichuk - frontend developer - ex. NDC\n\nBudget for 2 months: $19.050\n",
      supervisor: "",
    }),
    LinkedProposal.create({
      id: "devhub.near_194_94",
      proposalId: "devhub.near_94",
      snapshotId: "devhub.near_194",
    })
  ], // expected entities
  "handleSetBlockHeightCallback" // handler name
);