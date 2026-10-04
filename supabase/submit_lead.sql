-- 在 Supabase SQL Editor 里整段执行。可以重复执行。
-- 不删除 leads，不删除已有行，不给 anon 开放表的 select/insert/update/delete。
--
-- 2026-10-04 在项目 azfmivoamqbbptrojodo 上核对过：
--   submit_lead 只有一个签名：
--   p_token uuid, p_name text, p_family text, p_parents text, p_retirement text,
--   p_medical text, p_income text, p_focus text, p_attention text, p_next text
--   anon 已有这个签名的 execute。leads 已开启 RLS，anon 没有表权限。当时有 3 行。
--
-- 线上 V1 页面仍会调用上面这个 10 个参数的函数。
-- 参数列表不同会变成重载，不能 drop 旧函数。
-- 新函数的额外参数不设默认值，PostgREST 才能按请求里的字段名选中其中一个。

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

alter table public.leads
  add column if not exists total_score integer not null default 0,
  add column if not exists profile_code text not null default '',
  add column if not exists profile_title text not null default '',
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists dimensions jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'family-assessment',
  add column if not exists status text not null default 'new',
  add column if not exists remark text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists wechat text not null default '';

alter table public.leads enable row level security;

revoke all on table public.leads from anon, authenticated;

-- 旧签名。正文与当前线上一致，V1 页面继续调用它。
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

-- 新签名。多出来的 integer / jsonb 参数没有默认值。
create or replace function public.submit_lead(
  p_token uuid,
  p_name text,
  p_family text,
  p_parents text,
  p_retirement text,
  p_medical text,
  p_income text,
  p_total_score integer,
  p_profile_code text,
  p_profile_title text,
  p_focus text,
  p_attention text,
  p_next text,
  p_answers jsonb,
  p_dimensions jsonb,
  p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(trim(p_name), '');
  v_source text := coalesce(nullif(trim(p_source), ''), 'family-assessment');
  v_attention text := coalesce(p_attention, '');
  v_next text := coalesce(p_next, '');
  v_key text;
  v_value text;
begin
  if p_token is null then
    raise exception 'missing token';
  end if;
  if char_length(v_name) > 20 then
    raise exception 'name too long';
  end if;
  if p_family not in ('单身', '已婚无孩', '已婚有孩子', '孩子已经成年') then
    raise exception 'bad family';
  end if;
  if p_parents not in ('', '50以下', '50～60', '60～70', '70+') then
    raise exception 'bad parents';
  end if;
  if p_retirement not in (
    '想过', '没算过', '不知道',
    '算过，而且已经有比较明确的安排',
    '大概想过，但没有认真计算',
    '完全不知道'
  ) then
    raise exception 'bad retirement';
  end if;
  if p_medical not in ('', '基本没问题', '有压力', '压力很大', '没想过') then
    raise exception 'bad medical';
  end if;
  if p_income not in ('', '20万以下', '20～50万', '50～100万', '100万+') then
    raise exception 'bad income';
  end if;
  if p_total_score is null or p_total_score < 0 or p_total_score > 18 then
    raise exception 'bad total_score';
  end if;
  if not (
    (p_profile_code = 'stable' and p_profile_title = '稳稳向前型')
    or (p_profile_code = 'future_pressure' and p_profile_title = '未来压力型')
    or (p_profile_code = 'single_dependency' and p_profile_title = '单点依赖型')
    or (p_profile_code = 'preparation_gap' and p_profile_title = '准备不足型')
  ) then
    raise exception 'bad profile';
  end if;
  if p_focus not in ('父母养老', '养老准备', '医疗安排', '家庭收入', '家庭责任', '长期规划') then
    raise exception 'bad focus';
  end if;
  if char_length(v_attention) > 300 or char_length(v_next) > 100 or char_length(v_source) > 100 then
    raise exception 'too long';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'bad answers';
  end if;
  if p_dimensions is null or jsonb_typeof(p_dimensions) <> 'object' then
    raise exception 'bad dimensions';
  end if;

  foreach v_key in array array[
    'income_resilience',
    'family_dependency',
    'health_resilience',
    'parent_care',
    'retirement',
    'planning'
  ]
  loop
    v_value := p_dimensions ->> v_key;
    if v_value is null or v_value not in ('0', '1', '2', '3') then
      raise exception 'bad dimensions';
    end if;
  end loop;

  insert into public.leads (
    lead_token, visitor_name, family, parents, retirement, medical, income,
    focus, attention, next_step,
    total_score, profile_code, profile_title, answers, dimensions, source, status
  ) values (
    p_token, v_name, p_family, p_parents, p_retirement, p_medical, p_income,
    p_focus, v_attention, v_next,
    p_total_score, p_profile_code, p_profile_title, p_answers, p_dimensions, v_source, 'new'
  )
  on conflict (lead_token) do update set
    visitor_name = excluded.visitor_name,
    family = excluded.family,
    parents = excluded.parents,
    retirement = excluded.retirement,
    medical = excluded.medical,
    income = excluded.income,
    total_score = excluded.total_score,
    profile_code = excluded.profile_code,
    profile_title = excluded.profile_title,
    focus = excluded.focus,
    attention = excluded.attention,
    next_step = excluded.next_step,
    answers = excluded.answers,
    dimensions = excluded.dimensions,
    source = excluded.source,
    updated_at = now();
end;
$$;

revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) from public;
revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) from anon, authenticated;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) to anon;

-- V2.1 联系方式签名。保留上面的 10 参数和 16 参数签名。
create or replace function public.submit_lead(
  p_token uuid,
  p_name text,
  p_phone text,
  p_wechat text,
  p_family text,
  p_parents text,
  p_retirement text,
  p_medical text,
  p_income text,
  p_total_score integer,
  p_profile_code text,
  p_profile_title text,
  p_focus text,
  p_attention text,
  p_next text,
  p_answers jsonb,
  p_dimensions jsonb,
  p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := coalesce(trim(p_phone), '');
  v_wechat text := coalesce(trim(p_wechat), '');
begin
  if v_phone = '' and v_wechat = '' then
    raise exception 'missing contact';
  end if;
  if v_phone <> '' and v_phone !~ '^1[3-9][0-9]{9}$' then
    raise exception 'bad phone';
  end if;
  if char_length(v_wechat) > 50 then
    raise exception 'wechat too long';
  end if;

  perform public.submit_lead(
    p_token, p_name, p_family, p_parents, p_retirement, p_medical, p_income,
    p_total_score, p_profile_code, p_profile_title, p_focus, p_attention,
    p_next, p_answers, p_dimensions, p_source
  );

  update public.leads
  set phone = v_phone,
      wechat = v_wechat,
      updated_at = now()
  where lead_token = p_token;
end;
$$;

revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) from public;
revoke all on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) from anon, authenticated;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text) to anon;
