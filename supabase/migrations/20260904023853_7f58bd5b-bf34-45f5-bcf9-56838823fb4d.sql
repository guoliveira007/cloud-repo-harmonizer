CREATE POLICY "own resolucoes select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "own resolucoes delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resolucoes' AND (auth.uid())::text = (storage.foldername(name))[1]);