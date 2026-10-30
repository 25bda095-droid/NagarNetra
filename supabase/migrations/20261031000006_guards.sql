-- Rate limiting and AI usage counting. Only the server (secret key) may call these.

create table public.rate_limits (
  key          text not null,               -- e.g. 'report:user:<uuid>' or 'report:ip:<ip>'
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

-- Adds one hit to the current window and returns true while the limit is not exceeded.
-- Atomic thanks to INSERT ... ON CONFLICT, so parallel requests can't slip through.
create function public.check_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count  integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Calls per day per provider/model, shown on the moderator page so quota problems are visible early.
create table public.ai_usage (
  day      date not null default current_date,
  provider text not null,
  model    text not null,
  calls    integer not null default 0,
  primary key (day, provider, model)
);

-- Records one AI call and returns today's total for that model.
create function public.record_ai_call(p_provider text, p_model text)
returns integer
language sql
as $$
  insert into public.ai_usage (day, provider, model, calls)
  values (current_date, p_provider, p_model, 1)
  on conflict (day, provider, model) do update set calls = public.ai_usage.calls + 1
  returning calls;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.record_ai_call(text, text) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.record_ai_call(text, text) to service_role;
