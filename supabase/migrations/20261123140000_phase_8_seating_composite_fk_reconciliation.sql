-- Rekonsiliasi constraint penempatan untuk environment yang telah memiliki tabel seating lama.
-- Operasi idempoten: tidak mengubah data dan hanya menambahkan constraint yang belum ada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.guests'::regclass
      and conname = 'guests_id_invitation_unique'
  ) then
    alter table public.guests
      add constraint guests_id_invitation_unique unique (id, invitation_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seating_assignments'::regclass
      and conname = 'seating_assignments_guest_invitation_fk'
  ) then
    alter table public.seating_assignments
      add constraint seating_assignments_guest_invitation_fk
      foreign key (guest_id, invitation_id)
      references public.guests(id, invitation_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seating_assignments'::regclass
      and conname = 'seating_assignments_table_invitation_fk'
  ) then
    alter table public.seating_assignments
      add constraint seating_assignments_table_invitation_fk
      foreign key (seating_table_id, invitation_id)
      references public.seating_tables(id, invitation_id) on delete cascade;
  end if;
end
$$;
