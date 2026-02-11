-- System announcements for admin banners
CREATE TABLE public.system_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info', -- info, warning, maintenance
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Everyone can read active announcements
CREATE POLICY "Anyone can read active announcements"
ON public.system_announcements
FOR SELECT
USING (is_active = true);

-- Only admins can manage announcements
CREATE POLICY "Admins can manage announcements"
ON public.system_announcements
FOR ALL
USING (is_admin(auth.uid()));
