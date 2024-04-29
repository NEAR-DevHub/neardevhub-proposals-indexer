CREATE TABLE
  rfps (id serial primary key);

CREATE TABLE
  rfp_snapshots (
    -- due to how query api runs, an edit_rfp can be processed by the worker before corresponding add_rfp, so we can't enforce rfp_id as foreign key
    rfp_id int,
    block_height bigint,
    ts decimal(20, 0),
    labels jsonb,
    "name" text,
    category varchar,
    summary text,
    description text,
    timeline jsonb,
    submission_deadline decimal(20, 0),
    views int,
    primary key (rfp_id, ts)
  );

CREATE TABLE
  dumps (
    receipt_id varchar primary key,
    method_name varchar,
    block_height bigint,
    block_timestamp decimal(20, 0),
    args varchar,
    rfp_id bigint
  );

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
  ps.block_height,
  ps.ts,
  ps.labels,
  ps.name,
  ps.category,
  ps.summary,
  ps.description,
  ps.timeline,
  ps.views,
  ps.submission_deadline,
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
