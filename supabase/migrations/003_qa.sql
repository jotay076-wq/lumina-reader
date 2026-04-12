-- ============================================================
-- qa_messages
-- ============================================================
create table if not exists qa_messages (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references content_items(id) on delete cascade,
  question    text not null,
  answer      text,
  created_at  timestamptz not null default now()
);

alter table qa_messages enable row level security;

create policy "Users access own qa_messages"
  on qa_messages
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
-- qa_anchors
-- ============================================================
create table if not exists qa_anchors (
  id                    uuid primary key default gen_random_uuid(),
  message_id            uuid not null references qa_messages(id) on delete cascade,
  anchor_type           text not null check (anchor_type in ('timestamp','paragraph')),
  anchor_start_seconds  float,
  anchor_sequence       integer,
  anchor_paragraph_index integer,
  position              integer not null
);

alter table qa_anchors enable row level security;

create policy "Users access own qa_anchors"
  on qa_anchors
  for all
  using (
    message_id in (
      select m.id from qa_messages m
      join content_items c on c.id = m.content_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    message_id in (
      select m.id from qa_messages m
      join content_items c on c.id = m.content_id
      where c.user_id = auth.uid()
    )
  );
