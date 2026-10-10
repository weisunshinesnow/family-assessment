-- 利息差额计算器的联系方式提交。
-- 不修改 submit_lead、submit_lead_v2、RLS 和 leads 表结构。
-- 测算结果写入 answers，source / model_id 使用 interest-gap，避免和测评记录混在一起。

create or replace function public.submit_interest_lead(
  p_token uuid,
  p_name text,
  p_phone text,
  p_wechat text,
  p_amount text,
  p_current_rate text,
  p_compare_rate text,
  p_campaign text,
  p_channel text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(coalesce(trim(p_name), ''), 20);
  v_phone text := coalesce(trim(p_phone), '');
  v_wechat text := coalesce(trim(p_wechat), '');
  v_campaign text := coalesce(trim(p_campaign), '');
  v_channel text := coalesce(trim(p_channel), '');
  v_amount numeric;
  v_current_rate numeric;
  v_compare_rate numeric;
  v_current_annual numeric;
  v_compare_annual numeric;
  v_annual_gap numeric;
  v_cumulative_gap numeric;
  v_answers jsonb;
  v_attention text;
begin
  if p_token is null then
    raise exception 'missing token';
  end if;
  if v_phone = '' and v_wechat = '' then
    raise exception 'missing contact';
  end if;
  if v_phone <> '' and v_phone !~ '^1[3-9][0-9]{9}$' then
    raise exception 'bad phone';
  end if;
  if char_length(v_wechat) > 50
    or char_length(v_campaign) > 100
    or char_length(v_channel) > 100
  then
    raise exception 'too long';
  end if;
  if p_amount is null or p_amount !~ '^[0-9]+(\.[0-9]+)?$'
    or p_current_rate is null or p_current_rate !~ '^[0-9]+(\.[0-9]+)?$'
    or p_compare_rate is null or p_compare_rate !~ '^[0-9]+(\.[0-9]+)?$'
  then
    raise exception 'bad number';
  end if;

  v_amount := p_amount::numeric;
  v_current_rate := p_current_rate::numeric;
  v_compare_rate := p_compare_rate::numeric;
  if v_amount <= 0 or v_amount > 1000000000000
    or v_current_rate < 0 or v_current_rate > 100
    or v_compare_rate < 0 or v_compare_rate > 100
  then
    raise exception 'bad number';
  end if;

  v_current_annual := round(v_amount * v_current_rate / 100, 2);
  v_compare_annual := round(v_amount * v_compare_rate / 100, 2);
  v_annual_gap := round(v_compare_annual - v_current_annual, 2);
  v_cumulative_gap := round(v_annual_gap * 5, 2);
  v_answers := jsonb_build_object(
    'amount', v_amount,
    'currentRate', v_current_rate,
    'compareRate', v_compare_rate,
    'currentAnnual', v_current_annual,
    'compareAnnual', v_compare_annual,
    'annualGap', v_annual_gap,
    'cumulativeGap', v_cumulative_gap,
    'years', 5
  );
  v_attention := left(
    '存款' || trim(p_amount) || '元，现有利率' || trim(p_current_rate)
    || '%，对比利率' || trim(p_compare_rate)
    || '%。每年差额' || v_annual_gap::text
    || '元，五年累计差额' || v_cumulative_gap::text || '元。',
    300
  );

  insert into public.leads (
    lead_token, visitor_name, phone, wechat, family, parents, retirement, medical, income,
    focus, attention, next_step,
    total_score, profile_code, profile_title, answers, dimensions, source,
    campaign, channel, model_id, model_version, status
  ) values (
    p_token, v_name, v_phone, v_wechat, '', '', '', '', '',
    '利息差额', v_attention, '',
    0, '', '', v_answers, '{}'::jsonb, 'interest-gap',
    v_campaign, v_channel, 'interest-gap', '1', 'new'
  )
  on conflict (lead_token) do update set
    visitor_name = excluded.visitor_name,
    phone = excluded.phone,
    wechat = excluded.wechat,
    focus = excluded.focus,
    attention = excluded.attention,
    answers = excluded.answers,
    source = excluded.source,
    campaign = excluded.campaign,
    channel = excluded.channel,
    model_id = excluded.model_id,
    model_version = excluded.model_version,
    updated_at = now();

  return jsonb_build_object('token', p_token);
end;
$$;

revoke all on function public.submit_interest_lead(uuid, text, text, text, text, text, text, text, text) from public;
revoke all on function public.submit_interest_lead(uuid, text, text, text, text, text, text, text, text) from anon, authenticated;
grant execute on function public.submit_interest_lead(uuid, text, text, text, text, text, text, text, text) to anon;
