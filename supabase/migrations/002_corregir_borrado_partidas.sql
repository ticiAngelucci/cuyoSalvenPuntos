-- Aplicar en proyectos que ya ejecutaron 001_partidas.sql.
-- Supabase puede rechazar DELETE sin WHERE aunque se ejecute dentro de una RPC.

create or replace function public.admin_borrar_partidas(p_pin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cantidad integer;
begin
  if not private.pin_admin_valido(p_pin) then
    raise exception 'Clave de administración incorrecta' using errcode = '42501';
  end if;

  delete from public.partidas
  where id is not null;

  get diagnostics cantidad = row_count;
  return cantidad;
end;
$$;

revoke execute on function public.admin_borrar_partidas(text) from public, authenticated;
grant execute on function public.admin_borrar_partidas(text) to anon;
