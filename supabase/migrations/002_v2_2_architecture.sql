-- V2.2 结构增量。可以重复执行。
-- 前置条件：supabase/submit_lead.sql 已经在该数据库执行过。
--
-- 本文件不删除 leads，不删除已有行，不删除、不替换任何 submit_lead 签名。
-- 不给 anon / authenticated 开放 leads 的 select、insert、update、delete。

alter table public.leads
  add column if not exists phone text not null default '',
  add column if not exists wechat text not null default '',
  add column if not exists model_id text not null default '',
  add column if not exists model_version text not null default '',
  add column if not exists campaign text not null default '',
  add column if not exists channel text not null default '';

-- status 继续是普通文本，默认 new。
-- 预留取值：new、contacted、wechat_added、following、converted、closed、invalid。
-- 这次不加检查约束，避免历史或手工填写的状态被拒绝。

create or replace function public.submit_lead_v2(
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
  p_source text,
  p_campaign text,
  p_channel text,
  p_model_id text,
  p_model_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(trim(p_name), '');
  v_phone text := coalesce(trim(p_phone), '');
  v_wechat text := coalesce(trim(p_wechat), '');
  v_source text := coalesce(nullif(trim(p_source), ''), 'family-assessment');
  v_campaign text := coalesce(trim(p_campaign), '');
  v_channel text := coalesce(trim(p_channel), '');
  v_model_id text := coalesce(trim(p_model_id), '');
  v_model_version text := coalesce(trim(p_model_version), '');
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
  if v_phone = '' and v_wechat = '' then
    raise exception 'missing contact';
  end if;
  if v_phone <> '' and v_phone !~ '^1[3-9][0-9]{9}$' then
    raise exception 'bad phone';
  end if;
  if char_length(v_wechat) > 50 then
    raise exception 'wechat too long';
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
  if v_model_id = '' or v_model_version = '' then
    raise exception 'missing model';
  end if;
  if char_length(v_attention) > 300
    or char_length(v_next) > 100
    or char_length(v_source) > 100
    or char_length(v_campaign) > 100
    or char_length(v_channel) > 100
    or char_length(v_model_id) > 100
    or char_length(v_model_version) > 40
  then
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
    lead_token, visitor_name, phone, wechat, family, parents, retirement, medical, income,
    focus, attention, next_step,
    total_score, profile_code, profile_title, answers, dimensions, source,
    campaign, channel, model_id, model_version, status
  ) values (
    p_token, v_name, v_phone, v_wechat, p_family, p_parents, p_retirement, p_medical, p_income,
    p_focus, v_attention, v_next,
    p_total_score, p_profile_code, p_profile_title, p_answers, p_dimensions, v_source,
    v_campaign, v_channel, v_model_id, v_model_version, 'new'
  )
  on conflict (lead_token) do update set
    visitor_name = excluded.visitor_name,
    phone = excluded.phone,
    wechat = excluded.wechat,
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
    campaign = excluded.campaign,
    channel = excluded.channel,
    model_id = excluded.model_id,
    model_version = excluded.model_version,
    updated_at = now();

  return jsonb_build_object('token', p_token);
end;
$$;

revoke all on function public.submit_lead_v2(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text, text, text, text, text) from public;
revoke all on function public.submit_lead_v2(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text, text, text, text, text) from anon, authenticated;
grant execute on function public.submit_lead_v2(uuid, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb, text, text, text, text, text) to anon;
