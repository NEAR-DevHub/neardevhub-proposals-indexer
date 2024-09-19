export interface EditProposalArgs {
  id: number;
  body: {
    name: string;
    category: string;
    summary: string;
    description: string;
    linked_proposals: any[];
    requested_sponsorship_usd_amount: string;
    requested_sponsorship_paid_in_currency: string;
    receiver_account: string;
    requested_sponsor: string;
    supervisor?: string;
    timeline: { status: string };
    linked_rfp?: number;
  }
  labels: any[];
}


export interface EditProposalLinkedRFPArgs {
  id: number;
  rfp_id?: number;
}

export interface NewProposal {
  proposal: {
    id: number;
    author_id: string;
    social_db_post_block_height: string;
    snapshot: {
      editor_id: string;
      timestamp: string;
      labels: any[];
      proposal_body_version: string;
      name: string;
      category: string;
      summary: string;
      description: string;
      linked_proposals: any[];
      requested_sponsorship_usd_amount: string;
      requested_sponsorship_paid_in_currency: string;
      receiver_account: string;
      requested_sponsor: string;
      supervisor: string;
      timeline: { status: string };
    };
    snapshot_history: any[];
  };
}

export interface NewDump {
  receipt_id: string;
  method_name: string;
  block_height: number;
  block_timestamp: number;
  args: string;
  author: string;
  proposal_id: number;
}


export interface AddProposalArgs {
  labels: any[];
  body: {
    proposal_body_version: string;
    name: string;
    description: string;
    category: string;
    summary: string;
    linked_proposals: any[];
    requested_sponsorship_usd_amount: string;
    requested_sponsorship_paid_in_currency: string;
    receiver_account: string;
    supervisor: string;
    requested_sponsor: string;
    timeline: { status: string };
  }
  accepted_terms_and_conditions_version: number;
}

export interface NewProposalTimelineArgs {
  id: string;
  timeline: VersionedTimelineStatus | TimelineStatusV1
}

export type TimelineStatus = TimelineStatusV2;

export type ReviewStatus = ReviewStatusV2;

export enum TimelineStatusV1 {
    Draft = "DRAFT",
    Review = "REVIEW",
    Approved = "APPROVED",
    Rejected = "REJECTED",
    ApprovedConditionally = "APPROVED_CONDITIONALLY",
    PaymentProcessing = "PAYMENT_PROCESSING",
    Funded = "FUNDED",
    Cancelled = "CANCELLED",
}

export type VersionedTimelineStatus = {
    timeline_version: TimelineStatusV2;
};

export enum TimelineStatusV2 {
    Draft = "DRAFT",
    Review = "REVIEW",
    Approved = "APPROVED",
    Rejected = "REJECTED",
    ApprovedConditionally = "APPROVED_CONDITIONALLY",
    PaymentProcessing = "PAYMENT_PROCESSING",
    Funded = "FUNDED",
    Cancelled = "CANCELLED",
}

export type ReviewStatusV1 = {
    sponsor_requested_review: boolean;
    reviewer_completed_attestation: boolean;
};

export type ReviewStatusV2 = {
    sponsor_requested_review: boolean;
    reviewer_completed_attestation: boolean;
    kyc_verified: boolean;
};

export type PaymentProcessingStatusV1 = {
    review_status: ReviewStatusV1;
    kyc_verified: boolean;
    test_transaction_sent: boolean;
    request_for_trustees_created: boolean;
};

export type PaymentProcessingStatusV2 = {
    review_status: ReviewStatusV2;
    kyc_verified_deprecated?: boolean;
    test_transaction_sent: boolean;
    request_for_trustees_created: boolean;
};

export type FundedStatusV1 = {
    payment_processing_status: PaymentProcessingStatusV1;
    trustees_released_payment: boolean;
    payouts: string[];
};

export type FundedStatusV2 = {
    payment_processing_status: PaymentProcessingStatusV2;
    trustees_released_payment: boolean;
    payouts: string[];
};


// Rfp

export interface SetRFPBlockHeightCallbackArgs {
  rfp: {
    id: number;
    author_id: number;
    social_db_post_block_height: number;
    snapshot: RFPSnapshot;
    snapshot_history: Array<number>;
  }
}

// Define the TypeScript type for RFPSnapshot
export type RFPSnapshot = {
  editor_id: string; // Corresponds to env::predecessor_account_id()
  timestamp: number; // Corresponds to env::block_timestamp()
  block_height: number; // Corresponds to env::block_height()
  labels: string[]; // Assuming labels is an array of strings
  body: any; // Replace 'any' with the appropriate type for body
  linked_proposals: number[]; // Changed from Set to an array of numbers
};

export interface EditRFPArgs {
  id: number;
  body: {
    name: string;
    description: string;
    category: string;
    summary: string;
    requested_sponsorship_usd_amount: string;
    requested_sponsorship_paid_in_currency: string;
  }
  labels: any[];
}
export enum RFPTimelineStatus {
  AcceptingSubmissions = "ACCEPTING_SUBMISSIONS",
  Evaluation = "EVALUATION",
  ProposalSelected = "PROPOSAL_SELECTED",
  Cancelled = "CANCELLED",
}

export interface EditRFPTimelineArgs {
  id: number;
  timeline: RFPTimelineStatus
}


export interface CancelRFPArgs {
  id: number;
  proposals_to_cancel: number[];
  proposals_to_unlink: number[];
}
