-- Caught in PJs: database setup.
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- Before you run it, change the admin code on the last section's line to your own.

create extension if not exists pgcrypto;

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 30),
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists matchups (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references participants(id) on delete cascade,
  b uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (a <> b)
);

-- One vote per device per matchup. voter is a random id the browser keeps.
create table if not exists votes (
  matchup_id uuid not null references matchups(id) on delete cascade,
  voter text not null check (char_length(voter) between 8 and 64),
  pick text not null check (pick in ('a', 'b')),
  updated_at timestamptz not null default now(),
  primary key (matchup_id, voter)
);

create table if not exists results (
  matchup_id uuid primary key references matchups(id) on delete cascade,
  catcher uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Not readable from the site. Holds the code that unlocks recording results.
create table if not exists admin_settings (
  id int primary key default 1 check (id = 1),
  code text not null
);

alter table participants enable row level security;
alter table matchups enable row level security;
alter table votes enable row level security;
alter table results enable row level security;
alter table admin_settings enable row level security;

-- Anyone with the link can read the board, vote, add people and add matchups.
drop policy if exists "read participants" on participants;
create policy "read participants" on participants for select using (true);
drop policy if exists "add participants" on participants;
create policy "add participants" on participants for insert with check (true);

drop policy if exists "read matchups" on matchups;
create policy "read matchups" on matchups for select using (true);
drop policy if exists "add matchups" on matchups;
create policy "add matchups" on matchups for insert with check (true);

drop policy if exists "read votes" on votes;
create policy "read votes" on votes for select using (true);
drop policy if exists "cast votes" on votes;
create policy "cast votes" on votes for insert with check (true);
drop policy if exists "change votes" on votes;
create policy "change votes" on votes for update using (true) with check (true);
drop policy if exists "remove votes" on votes;
create policy "remove votes" on votes for delete using (true);

-- Results are read by everyone but only written through the functions below.
drop policy if exists "read results" on results;
create policy "read results" on results for select using (true);

create or replace function record_result(p_matchup uuid, p_catcher uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_settings where id = 1 and code = p_code) then
    raise exception 'wrong admin code';
  end if;
  insert into results (matchup_id, catcher) values (p_matchup, p_catcher)
  on conflict (matchup_id) do update set catcher = excluded.catcher, created_at = now();
end $$;

create or replace function clear_result(p_matchup uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_settings where id = 1 and code = p_code) then
    raise exception 'wrong admin code';
  end if;
  delete from results where matchup_id = p_matchup;
end $$;

create or replace function check_admin(p_code text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from admin_settings where id = 1 and code = p_code);
$$;

grant execute on function record_result(uuid, uuid, text) to anon;
grant execute on function clear_result(uuid, text) to anon;
grant execute on function check_admin(text) to anon;

-- Photo uploads from the "Add person" button.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;
drop policy if exists "upload photos" on storage.objects;
create policy "upload photos" on storage.objects for insert with check (bucket_id = 'photos');
drop policy if exists "read photos" on storage.objects;
create policy "read photos" on storage.objects for select using (bucket_id = 'photos');

-- Starting players and couples. Everyone starts at 0 votes and 0 catches.
insert into participants (name, photo_url, created_at) values
  ('Daniel',   'photos/daniel.jpg',   now() + interval '1 second'),
  ('Kristine', 'photos/kristine.jpg', now() + interval '2 second'),
  ('Theresa',  'photos/theresa.jpg',  now() + interval '3 second'),
  ('JG',       'photos/jg.jpg',       now() + interval '4 second'),
  ('Jas',      'photos/jas.jpg',      now() + interval '5 second'),
  ('Mike',     'photos/mike.jpg',     now() + interval '6 second'),
  ('Panha',    'photos/panha.jpg',    now() + interval '7 second'),
  ('Kat',      'photos/kat.jpg',      now() + interval '8 second'),
  ('Dan',      'photos/dan.jpg',      now() + interval '9 second'),
  ('Liz',      'photos/liz.jpg',      now() + interval '10 second'),
  ('Adam',     'photos/adam.jpg',     now() + interval '11 second')
on conflict (name) do nothing;

insert into matchups (a, b, created_at)
select pa.id, pb.id, now() + (x.n || ' second')::interval
from (values (1, 'Daniel', 'Kristine'), (2, 'Theresa', 'JG'), (3, 'Jas', 'Mike'), (4, 'Panha', 'Kat'), (5, 'Dan', 'Liz')) as x(n, a, b)
join participants pa on pa.name = x.a
join participants pb on pb.name = x.b
where not exists (select 1 from matchups m where m.a = pa.id and m.b = pb.id);

-- CHANGE THIS before running: the code you type to record who caught who.
insert into admin_settings (id, code) values (1, 'change-me-to-a-secret')
on conflict (id) do update set code = excluded.code;
