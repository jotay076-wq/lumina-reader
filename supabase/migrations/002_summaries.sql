-- ============================================================
-- summaries
-- ============================================================
create table if not exists summaries (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null unique references content_items(id) on delete cascade,
  status      text not null default 'processing' check (status in ('processing','complete','error')),
  error_code  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table summaries enable row level security;

create policy "Users access own summaries"
  on summaries
  for all
  using (
    content_id in (
      select id from content_items where user_id = auth.uid()
    )
  )
  with check (
    content_id in (
      select id from content_items where user_id = auth.uid()
    )
  );

create trigger summaries_updated_at
  before update on summaries
  for each row execute function update_updated_at();

-- ============================================================
-- summary_points
-- ============================================================
create table if not exists summary_points (
  id                    uuid primary key default gen_random_uuid(),
  summary_id            uuid not null references summaries(id) on delete cascade,
  text                  text not null,
  anchor_type           text not null check (anchor_type in ('timestamp','paragraph')),
  anchor_start_seconds  float,
  anchor_sequence       integer,
  anchor_paragraph_index integer,
  position              integer not null
);

alter table summary_points enable row level security;

create policy "Users access own summary_points"
  on summary_points
  for all
  using (
    summary_id in (
      select s.id from summaries s
      join content_items c on c.id = s.content_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    summary_id in (
      select s.id from summaries s
      join content_items c on c.id = s.content_id
      where c.user_id = auth.uid()
    )
  );

-- ============================================================
-- highlights
-- ============================================================
create table if not exists highlights (
  id                    uuid primary key default gen_random_uuid(),
  summary_id            uuid not null references summaries(id) on delete cascade,
  category              text not null check (category in ('key_insight','definition','conclusion')),
  text                  text not null,
  anchor_type           text not null check (anchor_type in ('timestamp','paragraph')),
  anchor_start_seconds  float,
  anchor_sequence       integer,
  anchor_paragraph_index integer
);

alter table highlights enable row level security;

create policy "Users access own highlights"
  on highlights
  for all
  using (
    summary_id in (
      select s.id from summaries s
      join content_items c on c.id = s.content_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    summary_id in (
      select s.id from summaries s
      join content_items c on c.id = s.content_id
      where c.user_id = auth.uid()
    )
  );
