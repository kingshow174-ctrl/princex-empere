-- Run this in Supabase SQL Editor

-- Users profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid references auth.users(id) primary key,
  full_name  text,
  email      text,
  created_at timestamptz default now()
);

-- Signals table
CREATE TABLE IF NOT EXISTS signals (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id),
  pair        text,
  direction   text,
  confidence  text,
  rsi         text,
  macd        text,
  candle1     text,
  candle2     text,
  candle3     text,
  created_at  timestamptz default now()
);

-- EMA cross alerts table
CREATE TABLE IF NOT EXISTS ema_alerts (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id),
  pair        text,
  cross_type  text,
  signal      text,
  price       text,
  ema20       text,
  ema50       text,
  created_at  timestamptz default now()
);

-- Enable RLS on all tables
ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ema_alerts ENABLE ROW LEVEL SECURITY;

-- Drop old policies if exist
DROP POLICY IF EXISTS "allow_all"      ON profiles;
DROP POLICY IF EXISTS "allow_all"      ON signals;
DROP POLICY IF EXISTS "allow_all"      ON ema_alerts;
DROP POLICY IF EXISTS "user_own"       ON profiles;
DROP POLICY IF EXISTS "user_signals"   ON signals;
DROP POLICY IF EXISTS "user_alerts"    ON ema_alerts;

-- Profiles: users see only their own
CREATE POLICY "user_own" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Signals: users see only their own
CREATE POLICY "user_signals" ON signals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- EMA alerts: users see only their own
CREATE POLICY "user_alerts" ON ema_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
