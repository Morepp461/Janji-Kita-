-- Fase 8: indeks komposit menutup seluruh foreign key pada tabel penempatan.
drop index if exists public.seating_assignments_guest_idx;
drop index if exists public.seating_assignments_seating_table_fk_idx;

create index if not exists seating_assignments_guest_invitation_fk_idx
  on public.seating_assignments(guest_id, invitation_id);
create index if not exists seating_assignments_table_invitation_fk_idx
  on public.seating_assignments(seating_table_id, invitation_id);

comment on function public.get_public_guest_seating(text) is
  'RPC token-gated untuk tautan tamu personal; hanya mengembalikan label meja dan kursi. SECURITY DEFINER disengaja, search_path tetap, helper app_private tidak dapat diakses anon.';
