-- Create connected_accounts table for FloStudio
create table if not exists public.connected_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null, -- 'facebook', 'instagram', 'twitter', 'linkedin'
  account_name text not null,
  account_handle text,
  access_token text,
  status text default 'connected', -- 'connected', 'expired'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.connected_accounts enable row level security;

-- RLS policies
create policy "Users can view their own connected accounts"
  on public.connected_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own connected accounts"
  on public.connected_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own connected accounts"
  on public.connected_accounts for delete
  using (auth.uid() = user_id);
