-- Run once in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.cm_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  panel_mode TEXT NOT NULL DEFAULT 'paid' CHECK (panel_mode IN ('free', 'paid')),
  panel_name TEXT NOT NULL DEFAULT 'CyberMonks',
  logo_url TEXT NOT NULL DEFAULT '/assets/logo.png',
  telegram_bot_token TEXT NULL,
  telegram_chat_id TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cm_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cm_settings (id, panel_mode, panel_name, logo_url)
VALUES ('main', 'paid', 'CyberMonks', '/assets/logo.png')
ON CONFLICT (id) DO NOTHING;
