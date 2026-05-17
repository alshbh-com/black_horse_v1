
-- Scan sessions
CREATE TABLE public.scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_scanned integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'open'
);
ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/Admin full scan_sessions" ON public.scan_sessions
  FOR ALL TO authenticated USING (is_owner_or_admin(auth.uid())) WITH CHECK (is_owner_or_admin(auth.uid()));
CREATE POLICY "Users read own scan_sessions" ON public.scan_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own scan_sessions" ON public.scan_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own scan_sessions" ON public.scan_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Scan session items
CREATE TABLE public.scan_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scan_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, order_id)
);
ALTER TABLE public.scan_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/Admin full scan_items" ON public.scan_session_items
  FOR ALL TO authenticated USING (is_owner_or_admin(auth.uid())) WITH CHECK (is_owner_or_admin(auth.uid()));
CREATE POLICY "Users manage own session items" ON public.scan_session_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scan_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.scan_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Scan logs
CREATE TABLE public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.scan_sessions(id) ON DELETE SET NULL,
  order_id uuid,
  user_id uuid NOT NULL,
  action text NOT NULL,
  old_value jsonb DEFAULT '{}'::jsonb,
  new_value jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/Admin read scan_logs" ON public.scan_logs
  FOR SELECT TO authenticated USING (is_owner_or_admin(auth.uid()));
CREATE POLICY "Auth insert scan_logs" ON public.scan_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Order status history
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  old_status_id uuid,
  new_status_id uuid,
  changed_by uuid,
  session_id uuid,
  reason text DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/Admin read history" ON public.order_status_history
  FOR SELECT TO authenticated USING (is_owner_or_admin(auth.uid()));
CREATE POLICY "Auth insert history" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- Add qr_value to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qr_value text;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_session_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
