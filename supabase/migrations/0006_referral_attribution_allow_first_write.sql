-- Fix: the immutable-attribution trigger also blocked the INITIAL
-- attribution write (NULL → referrer id) at signup, so referrals never got
-- attributed. Attribution must be writable exactly once: allowed only from
-- NULL to a value; any change once set stays rejected.

create or replace function public.enforce_referred_by_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.referred_by is distinct from old.referred_by
     and old.referred_by is not null then
    raise exception 'referred_by is immutable after signup';
  end if;
  -- Allow only NULL → value (first attribution). Once set, never changes.
  return new;
end;
$$;
