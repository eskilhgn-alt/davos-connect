
-- Shared checklist/packing list
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read checklist" ON public.checklist_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can create checklist items" ON public.checklist_items FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated can update checklist items" ON public.checklist_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Creator or admin can delete checklist items" ON public.checklist_items FOR DELETE USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE TRIGGER update_checklist_updated_at BEFORE UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
