-- Fix RLS policies for adelantos — use auth.uid() IS NOT NULL pattern
DROP POLICY IF EXISTS "adelantos_select_authenticated" ON adelantos;
DROP POLICY IF EXISTS "adelantos_insert_authenticated" ON adelantos;
DROP POLICY IF EXISTS "adelantos_update_authenticated" ON adelantos;
DROP POLICY IF EXISTS "adelantos_delete_authenticated" ON adelantos;

CREATE POLICY "adelantos_select_auth" ON adelantos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "adelantos_insert_auth" ON adelantos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "adelantos_update_auth" ON adelantos
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "adelantos_delete_auth" ON adelantos
  FOR DELETE USING (auth.uid() IS NOT NULL);
