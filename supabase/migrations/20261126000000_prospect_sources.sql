-- Prospects can now come from three places: added by hand, imported from a
-- list, or suggested by the weekly search. Suggested ones wait in the
-- "Suggested" status until the agency accepts them (New) or passes (Not a fit).

alter table public.prospects
  add column email      text not null default '' check (char_length(email) <= 320),
  add column source     text not null default 'manual' check (source in ('manual', 'import', 'suggested')),
  add column fit_score  smallint check (fit_score is null or fit_score between 0 and 100),
  add column fit_reason text not null default '' check (char_length(fit_reason) <= 1000),
  add column source_url text not null default '' check (char_length(source_url) <= 500);

alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('Suggested', 'New', 'Drafted', 'Approved', 'Sent', 'Replied', 'Call booked', 'Not a fit'));

-- The weekly suggestion cap counts recent suggested rows per workspace.
create index prospects_workspace_source_created_idx
  on public.prospects (workspace_id, source, created_at desc);
