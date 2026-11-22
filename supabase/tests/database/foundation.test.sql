begin;

select plan(4);

select has_schema('app_private', 'private application schema exists');
select ok(
  not has_schema_privilege('anon', 'app_private', 'USAGE'),
  'anonymous role cannot use the private application schema'
);
select ok(
  not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'authenticated role cannot use the private application schema'
);

create table public.phase0_rls_probe (id integer primary key);
alter table public.phase0_rls_probe enable row level security;
revoke all on table public.phase0_rls_probe from anon, authenticated;

select ok(
  not has_table_privilege('anon', 'public.phase0_rls_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.phase0_rls_probe', 'SELECT'),
  'new public tables are not readable without explicit grants'
);

select * from finish();

rollback;
