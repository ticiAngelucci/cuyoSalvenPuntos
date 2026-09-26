-- Ejecutar una vez en Supabase > SQL Editor.
-- La clave administrativa se configura después con una consulta separada
-- para evitar guardarla en GitHub o Vercel.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.salven_config (
  id boolean primary key default true check (id),
  admin_pin_hash text not null
);

create table if not exists public.partidas (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique check (char_length(client_id) between 1 and 100),
  nombre text not null check (char_length(nombre) between 1 and 80),
  apellido text not null check (char_length(apellido) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  edad smallint check (edad between 10 and 99),
  departamento text check (
    departamento is null or departamento in (
      'Capital', 'General Alvear', 'Godoy Cruz', 'Guaymallén', 'Junín',
      'La Paz', 'Las Heras', 'Lavalle', 'Luján de Cuyo', 'Maipú',
      'Malargüe', 'Rivadavia', 'San Carlos', 'San Martín', 'San Rafael',
      'Santa Rosa', 'Tunuyán', 'Tupungato'
    )
  ),
  puntos integer not null check (puntos between 0 and 1000000),
  premio text not null check (char_length(premio) between 1 and 200),
  nivel_alcanzado smallint not null check (nivel_alcanzado between 1 and 20),
  se_retiro boolean not null default false,
  fecha timestamptz not null default now(),
  respuestas jsonb not null default '[]'::jsonb check (
    jsonb_typeof(respuestas) = 'array'
    and jsonb_array_length(respuestas) <= 50
    and pg_column_size(respuestas) <= 131072
  ),
  creado_en timestamptz not null default now()
);

create index if not exists partidas_fecha_idx on public.partidas (fecha desc);
create index if not exists partidas_departamento_idx on public.partidas (departamento);

alter table public.partidas enable row level security;
revoke all on table public.partidas from public, anon, authenticated;
drop policy if exists "registrar partidas anonimas" on public.partidas;

create or replace function public.registrar_partidas(p_partidas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cantidad integer;
begin
  if p_partidas is null or jsonb_typeof(p_partidas) <> 'array' then
    raise exception 'El lote de partidas no es válido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_partidas) < 1 or jsonb_array_length(p_partidas) > 100 then
    raise exception 'El lote de partidas no es válido' using errcode = '22023';
  end if;

  insert into public.partidas (
    client_id, nombre, apellido, email, edad, departamento, puntos, premio,
    nivel_alcanzado, se_retiro, fecha, respuestas
  )
  select
    x.client_id, x.nombre, x.apellido, lower(x.email), x.edad, x.departamento,
    x.puntos, x.premio, x.nivel_alcanzado, x.se_retiro, x.fecha, x.respuestas
  from jsonb_to_recordset(p_partidas) as x(
    client_id text,
    nombre text,
    apellido text,
    email text,
    edad smallint,
    departamento text,
    puntos integer,
    premio text,
    nivel_alcanzado smallint,
    se_retiro boolean,
    fecha timestamptz,
    respuestas jsonb
  )
  on conflict (client_id) do nothing;

  get diagnostics cantidad = row_count;
  return cantidad;
end;
$$;

create or replace function private.pin_admin_valido(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.salven_config
    where admin_pin_hash = extensions.crypt(p_pin, admin_pin_hash)
  );
$$;

create or replace function public.admin_listar_partidas(
  p_pin text,
  p_offset integer default 0,
  p_limit integer default 1000
)
returns setof public.partidas
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.pin_admin_valido(p_pin) then
    raise exception 'Clave de administración incorrecta' using errcode = '42501';
  end if;

  return query
    select p.*
    from public.partidas p
    order by p.fecha desc, p.id desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 1000);
end;
$$;

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

  -- El filtro explícito es necesario cuando Supabase tiene habilitada la
  -- protección contra DELETE sin WHERE. `id` es la clave primaria y nunca es null.
  delete from public.partidas
  where id is not null;
  get diagnostics cantidad = row_count;
  return cantidad;
end;
$$;

revoke execute on function private.pin_admin_valido(text) from public, anon, authenticated;
revoke execute on function public.registrar_partidas(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_listar_partidas(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_borrar_partidas(text) from public, anon, authenticated;
grant execute on function public.registrar_partidas(jsonb) to anon;
grant execute on function public.admin_listar_partidas(text, integer, integer) to anon;
grant execute on function public.admin_borrar_partidas(text) to anon;

-- Verificación rápida: anon no puede leer ni escribir la tabla directamente.
-- Sólo puede registrar lotes validados mediante registrar_partidas().
