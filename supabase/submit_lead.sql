-- 在 Supabase 项目的 SQL Editor 里整段执行一次。
-- 网页只用匿名密钥调用 submit_lead，不能读取这张表。
-- 后台 Table Editor 用的是项目管理员身份，可以看到每一行。

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  lead_token uuid not null unique,
  visitor_name text not null default '',
  family text not null,
  parents text not null,
  retirement text not null,
  medical text not null,
  income text not null,
  focus text not null,
  attention text not null,
  next_step text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated;

create or replace function public.submit_lead(
  p_token uuid,
  p_name text,
  p_family text,
  p_parents text,
  p_retirement text,
  p_medical text,
  p_income text,
  p_focus text,
  p_attention text,
  p_next text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(coalesce(trim(p_name), ''), 20);
begin
  if p_token is null then
    raise exception 'missing token';
  end if;
  if p_family not in ('单身', '已婚无孩', '已婚有孩子', '孩子已经成年') then
    raise exception 'bad family';
  end if;
  if p_parents not in ('50以下', '50～60', '60～70', '70+') then
    raise exception 'bad parents';
  end if;
  if p_retirement not in ('想过', '没算过', '不知道') then
    raise exception 'bad retirement';
  end if;
  if p_medical not in ('基本没问题', '有压力', '压力很大', '没想过') then
    raise exception 'bad medical';
  end if;
  if p_income not in ('20万以下', '20～50万', '50～100万', '100万+') then
    raise exception 'bad income';
  end if;
  if p_focus not in ('父母养老', '养老准备', '医疗安排', '这几件事的衔接') then
    raise exception 'bad focus';
  end if;
  if char_length(coalesce(p_attention, '')) > 80 or char_length(coalesce(p_next, '')) > 40 then
    raise exception 'too long';
  end if;

  insert into public.leads (
    lead_token, visitor_name, family, parents, retirement, medical, income, focus, attention, next_step
  ) values (
    p_token, v_name, p_family, p_parents, p_retirement, p_medical, p_income, p_focus,
    left(coalesce(p_attention, ''), 80), left(coalesce(p_next, ''), 40)
  )
  on conflict (lead_token) do update set
    visitor_name = excluded.visitor_name,
    family = excluded.family,
    parents = excluded.parents,
    retirement = excluded.retirement,
    medical = excluded.medical,
    income = excluded.income,
    focus = excluded.focus,
    attention = excluded.attention,
    next_step = excluded.next_step,
    updated_at = now();
end;
$$;

revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, text) from anon, authenticated;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, text) to anon;
