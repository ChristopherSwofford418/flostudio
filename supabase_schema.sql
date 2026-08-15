-- FloStudio Backend Token Ledger & Billing Schema

CREATE TABLE IF NOT EXISTS public.user_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 50,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'starter', 'pro', 'enterprise'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.token_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL, -- positive for refill, negative for usage
  action_type TEXT NOT NULL, -- e.g. 'generate_post', 'ai_image', 'campaign', 'refill'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON public.user_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON public.user_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON public.token_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON public.token_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
