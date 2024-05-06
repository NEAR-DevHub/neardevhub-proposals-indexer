CREATE TABLE
  proposals (id serial primary key, author_id VARCHAR not null);

CREATE TABLE
  proposal_snapshots (
    -- due to how query api runs, an edit_proposal can be processed by the worker before corresponding add_proposal, so we can't enforce proposal_id as foreign key
    proposal_id int,
    block_height bigint,
    ts decimal(20, 0),
    editor_id varchar,
    labels jsonb,
    "name" text,
    category varchar,
    summary text,
    description text,
    linked_proposals varchar, -- array of proposal ids "1,2,3,4"
    linked_rfp int,
    requested_sponsorship_usd_amount decimal,
    requested_sponsorship_paid_in_currency varchar,
    requested_sponsor varchar,
    receiver_account varchar,
    supervisor varchar,
    timeline jsonb,
    views int,
    primary key (proposal_id, ts)
  );

CREATE TABLE
  dumps (
    receipt_id varchar primary key,
    method_name varchar,
    block_height bigint,
    block_timestamp decimal(20, 0),
    args varchar,
    author varchar,
    proposal_id bigint
  );

CREATE INDEX
  idx_proposals_author_id ON proposals (author_id);

CREATE INDEX
  idx_proposal_snapshots_proposal_id ON proposal_snapshots (proposal_id);

CREATE INDEX
  idx_proposal_snapshots_category ON proposal_snapshots (category);

CREATE INDEX
  idx_proposal_snapshots_ts ON proposal_snapshots (ts);

CREATE INDEX
  idx_proposal_snapshots_editor_id ON proposal_snapshots (editor_id);

CREATE INDEX
  idx_proposal_snapshots_labels ON proposal_snapshots USING GIN (labels);

CREATE INDEX
  idx_fulltext_proposal_snapshots_description ON proposal_snapshots USING gin (to_tsvector('english', description));

CREATE INDEX
  idx_fulltext_proposal_snapshots_summary ON proposal_snapshots USING gin (to_tsvector('english', summary));

CREATE INDEX
  idx_fulltext_proposal_snapshots_timeline ON proposal_snapshots USING gin (to_tsvector('english', timeline));

CREATE INDEX
  idx_fulltext_proposal_snapshots_name ON proposal_snapshots USING gin (to_tsvector('english', name));

CREATE INDEX
  idx_proposal_snapshots_sponsorship_supervisor ON proposal_snapshots (supervisor);

CREATE INDEX
  idx_proposal_snapshots_sponsorship_receiver_account ON proposal_snapshots (receiver_account);

CREATE INDEX
  idx_proposal_snapshots_views ON proposal_snapshots (views);

CREATE VIEW
  proposals_with_latest_snapshot AS
SELECT
  ps.proposal_id,
  p.author_id,
  ps.block_height,
  ps.ts,
  ps.editor_id,
  ps.labels,
  ps.name,
  ps.category,
  ps.summary,
  ps.description,
  ps.linked_proposals,
  ps.linked_rfp,
  ps.requested_sponsorship_usd_amount,
  ps.requested_sponsorship_paid_in_currency,
  ps.requested_sponsor,
  ps.receiver_account,
  ps.supervisor,
  ps.timeline,
  ps.views
FROM
  proposals p
  INNER JOIN (
    SELECT
      proposal_id,
      MAX(ts) AS max_ts
    FROM
      proposal_snapshots
    GROUP BY
      proposal_id
  ) latest_snapshots ON p.id = latest_snapshots.proposal_id
  INNER JOIN proposal_snapshots ps ON latest_snapshots.proposal_id = ps.proposal_id
  AND latest_snapshots.max_ts = ps.ts;
