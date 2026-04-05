-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- content_items
-- ============================================================
create table if not exists content_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  content_type  text not null check (content_type in ('youtube','website','pdf','audio','ebook')),
  status        text not null default 'processing' check (status in ('processing','complete','error')),
  title         text not null default '',
  source_url    text,
  storage_path  text,
  extracted_text text,
  error_code    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table content_items enable row level security;

create policy "Users access own content_items"
  on content_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- transcript_segments
-- ============================================================
create table if not exists transcript_segments (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references content_items(id) on delete cascade,
  start_seconds float not null,
  text         text not null,
  sequence     integer not null,
  unique (content_id, sequence)
);

alter table transcript_segments enable row level security;

create policy "Users access own transcript_segments"
  on transcript_segments
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

-- ============================================================
-- ebook_chapters
-- ============================================================
create table if not exists ebook_chapters (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references content_items(id) on delete cascade,
  chapter_index integer not null,
  title         text not null default '',
  text          text not null default '',
  unique (content_id, chapter_index)
);

alter table ebook_chapters enable row level security;

create policy "Users access own ebook_chapters"
  on ebook_chapters
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

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_items_updated_at
  before update on content_items
  for each row execute function update_updated_at();

-- ============================================================
-- Storage bucket (run via Supabase dashboard or CLI separately)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
-- on conflict do nothing;
