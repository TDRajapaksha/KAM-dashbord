insert into storage.buckets (id, name, public)
values ('survey-media', 'survey-media', true)
on conflict (id) do update set public = true;
