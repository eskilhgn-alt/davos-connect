
-- Shared agenda events
CREATE TABLE public.agenda_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  color TEXT DEFAULT 'primary',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Authenticated can view agenda" ON public.agenda_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated users can create
CREATE POLICY "Authenticated can create agenda" ON public.agenda_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

-- All authenticated users can update any event
CREATE POLICY "Authenticated can update agenda" ON public.agenda_events
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- All authenticated users can delete any event
CREATE POLICY "Authenticated can delete agenda" ON public.agenda_events
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_events;

-- Timestamp trigger
CREATE TRIGGER update_agenda_events_updated_at
  BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
