-- ============================================================
-- tutor_cards
-- ============================================================
create table if not exists tutor_cards (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references content_items(id) on delete cascade,
  style        text not null check (style in ('analogy', 'step-by-step', 'plain-english')),
  anchor_type  text not null check (anchor_type in ('timestamp', 'paragraph')),
  anchor_ref   integer not null,
  reexplanation text not null,
  created_at   timestamptz not null default now(),

  unique (content_id, anchor_type, anchor_ref, style)
);

alter table tutor_cards enable row level security;

create policy "Users access own tutor_cards"
  on tutor_cards
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
