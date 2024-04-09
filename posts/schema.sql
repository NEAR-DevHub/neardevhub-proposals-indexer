CREATE TABLE
  posts (
    id serial primary key,
    -- due to how query api runs, a child post can be processed by the worker before the parent post, so we can't enforce parent_id as foreign key
    parent_id int,
    author_id VARCHAR not null
  );

CREATE TABLE
  post_snapshots (
    -- due to how query api runs, an edit_post can be processed by the worker before corresponding add_post, so we can't enforce post_id as foreign key
    post_id int,
    block_height bigint,
    ts decimal(20, 0),
    editor_id varchar,
    labels jsonb,
    post_type varchar,
    description text,
    "name" text,
    sponsorship_token varchar,
    sponsorship_amount decimal,
    sponsorship_supervisor varchar,
    primary key (post_id, ts)
  );

CREATE TABLE
  dumps (
    receipt_id varchar primary key,
    block_height bigint,
    block_timestamp decimal(20, 0),
    method_name varchar,
    args varchar,
    caller varchar,
    post_id bigint
  );

create index
  idx_posts_author_id on posts (author_id);

create index
  idx_posts_parent_id on posts (parent_id);

CREATE INDEX
  idx_post_snapshots_post_id ON post_snapshots (post_id);

CREATE INDEX
  idx_post_snapshots_ts ON post_snapshots (ts);

CREATE INDEX
  idx_post_snapshots_editor_id ON post_snapshots (editor_id);

CREATE INDEX
  idx_post_snapshots_labels ON post_snapshots USING GIN (labels);

CREATE INDEX
  idx_fulltext_post_snapshots_description ON post_snapshots USING gin (to_tsvector('english', description));

CREATE INDEX
  idx_fulltext_post_snapshots_name ON post_snapshots USING gin (to_tsvector('english', name));

create index
  idx_post_snapshots_sponsorship_supervisor on post_snapshots (sponsorship_supervisor);

CREATE VIEW
  posts_with_latest_snapshot AS
SELECT
  ps.post_id,
  p.parent_id,
  p.author_id,
  ps.block_height,
  ps.ts,
  ps.editor_id,
  ps.labels,
  ps.post_type,
  ps.description,
  ps.name,
  ps.sponsorship_token,
  ps.sponsorship_amount,
  ps.sponsorship_supervisor
FROM
  posts p
  INNER JOIN (
    SELECT
      post_id,
      MAX(ts) AS max_ts
    FROM
      post_snapshots
    GROUP BY
      post_id
  ) latest_snapshots ON p.id = latest_snapshots.post_id
  INNER JOIN post_snapshots ps ON latest_snapshots.post_id = ps.post_id
  AND latest_snapshots.max_ts = ps.ts;

CREATE TABLE
  likes (
    post_id int not null,
    author_id varchar not null,
    ts decimal(20, 0) not null,
    primary key (post_id, author_id)
  );

create index
  idx_likes_post_id on likes (post_id);

create index
  idx_likes_author_id on likes (author_id);

create index
  idx_likes_ts on likes (ts);
