CREATE TABLE
  proposals (id serial primary key, author_id VARCHAR not null);

CREATE TABLE
  proposal_snapshots (
    -- due to how query api runs, an edit_proposal can be processed by the worker before corresponding add_proposal, so we can't enforce proposal_id as foreign key
    proposal_id int,
    block_height bigint,
    ts decimal(20, 0),
    editor_id varchar,
    social_db_post_block_height bigint,
    labels jsonb,
    proposal_version varchar,
    proposal_body_version varchar,
    "name" text,
    category varchar,
    summary text,
    description text,
    linked_proposals jsonb,
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
  ps.social_db_post_block_height,
  ps.labels,
  ps.proposal_version,
  ps.proposal_body_version,
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

CREATE TABLE
  rfps (id serial primary key, author_id VARCHAR not null);

CREATE TABLE
  rfp_snapshots (
    -- due to how query api runs, an edit_rfp can be processed by the worker before corresponding add_rfp, so we can't enforce rfp_id as foreign key
    rfp_id int REFERENCES rfps(id),
    block_height bigint,
    ts decimal(20, 0),
    editor_id varchar,
    social_db_post_block_height bigint,
    labels jsonb,
    linked_proposals jsonb,
    rfp_version varchar,
    rfp_body_version varchar,
    "name" text,
    category varchar,
    summary text,
    description text,
    timeline jsonb,
    submission_deadline decimal(20, 0),
    views int,
    primary key (rfp_id, ts)
  );

CREATE INDEX
  idx_rfps_author_id ON rfps (author_id);

CREATE INDEX
  idx_rfp_snapshots_rfp_id ON rfp_snapshots (rfp_id);

CREATE INDEX
  idx_rfp_snapshots_category ON rfp_snapshots (category);

CREATE INDEX
  idx_rfp_snapshots_ts ON rfp_snapshots (ts);

CREATE INDEX
  idx_rfp_snapshots_editor_id ON rfp_snapshots (editor_id);

CREATE INDEX
  idx_rfp_snapshots_labels ON rfp_snapshots USING GIN (labels);

CREATE INDEX
  idx_fulltext_rfp_snapshots_description ON rfp_snapshots USING gin (to_tsvector('english', description));

CREATE INDEX
  idx_fulltext_rfp_snapshots_summary ON rfp_snapshots USING gin (to_tsvector('english', summary));

CREATE INDEX
  idx_fulltext_rfp_snapshots_timeline ON rfp_snapshots USING gin (to_tsvector('english', timeline));

CREATE INDEX
  idx_fulltext_rfp_snapshots_name ON rfp_snapshots USING gin (to_tsvector('english', name));

CREATE INDEX
  idx_rfp_snapshots_views ON rfp_snapshots (views);

CREATE VIEW
  rfps_with_latest_snapshot AS
SELECT
  ps.rfp_id,
  p.author_id,
  ps.block_height,
  ps.ts,
  ps.editor_id,
  ps.social_db_post_block_height,
  ps.labels,
  ps.linked_proposals,
  ps.rfp_version,
  ps.rfp_body_version,
  ps.name,
  ps.category,
  ps.summary,
  ps.description,
  ps.timeline,
  ps.views,
  ps.submission_deadline
FROM 
  rfps p
  INNER JOIN (
    SELECT
      rfp_id,
      MAX(ts) AS max_ts
    FROM
      rfp_snapshots
    GROUP BY
      rfp_id
  ) latest_snapshots ON p.id = latest_snapshots.rfp_id
  INNER JOIN rfp_snapshots ps ON latest_snapshots.rfp_id = ps.rfp_id
  AND latest_snapshots.max_ts = ps.ts;

CREATE TABLE
  rfp_dumps (
    receipt_id varchar primary key,
    method_name varchar,
    block_height bigint,
    block_timestamp decimal(20, 0),
    args varchar,
    author varchar,
    rfp_id bigint
  );
