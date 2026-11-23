-- Fase 8: indeks langsung untuk foreign key meja agar penghapusan dan join tetap efisien.
create index if not exists seating_assignments_seating_table_fk_idx
  on public.seating_assignments(seating_table_id);
