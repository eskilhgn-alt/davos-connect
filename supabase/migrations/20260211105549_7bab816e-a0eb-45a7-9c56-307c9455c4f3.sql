
-- Add email verification columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token text,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz;

-- Mark ALL existing users as verified (they already have accounts)
UPDATE public.profiles SET email_verified = true WHERE email_verified = false;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_profiles_verification_token ON public.profiles (email_verification_token) WHERE email_verification_token IS NOT NULL;
