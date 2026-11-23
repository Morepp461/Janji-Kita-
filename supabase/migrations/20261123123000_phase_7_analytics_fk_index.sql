-- Retain an index covering the analytics user foreign key and common user timeline lookup.
create index if not exists analytics_events_user_time_idx
  on public.analytics_events(user_id, occurred_at desc);

