-- Run once in Supabase → SQL Editor. Gives each pet a coat drawing and a tag colour. Safe to run more than once.
alter table public.pets add column if not exists coat text not null default 'plain';
alter table public.pets add column if not exists color text;
alter table public.pets drop constraint if exists pets_coat_check;
alter table public.pets add constraint pets_coat_check
  check (coat in ('pomeranian', 'tuxedo', 'tabby', 'bicolour', 'tricolour', 'plain'));
alter table public.pets drop constraint if exists pets_color_check;
alter table public.pets add constraint pets_color_check check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

update public.pets set coat = 'pomeranian', color = '#3E6FB0' where name = 'Murphy';
update public.pets set coat = 'tuxedo',     color = '#6B5CA8' where name = 'Panda';
update public.pets set coat = 'tricolour',  color = '#3B8F7A' where name = 'Watson';
update public.pets set coat = 'tabby',      color = '#D9688F' where name = 'Mochi';
update public.pets set coat = 'bicolour',   color = '#E39B2D' where name = 'Poppy';

select name, coat, color from public.pets order by sort;
