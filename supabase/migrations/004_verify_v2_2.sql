-- V2.2 迁移后验证。只读。
-- 在 DBeaver 里用「执行 SQL 脚本」(Alt+X) 跑整份文件。
-- 本文件不建表、不改函数、不插入、不更新、不删除。

-- 1. submit_lead_v2
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_lead_v2';

-- 2. 旧 submit_lead 必须仍是 3 个签名
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_lead'
order by identity_args;

-- 3. 新字段
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leads'
  and column_name in ('model_id', 'model_version', 'campaign', 'channel')
order by column_name;

-- 4. lead_token 单列唯一
select pg_get_indexdef(indexrelid) as lead_token_unique_index
from pg_index
where indrelid = to_regclass('public.leads')
  and indisunique
  and indnkeyatts = 1
  and pg_get_indexdef(indexrelid) ilike '%(lead_token)%';

-- 5. RLS
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'leads';

-- 6. leads 表权限，以及 anon 对 submit_lead_v2 的 EXECUTE
select
  has_table_privilege('anon', 'public.leads', 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.leads', 'INSERT') as anon_insert,
  has_table_privilege('anon', 'public.leads', 'UPDATE') as anon_update,
  has_table_privilege('anon', 'public.leads', 'DELETE') as anon_delete,
  has_table_privilege('authenticated', 'public.leads', 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', 'public.leads', 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', 'public.leads', 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', 'public.leads', 'DELETE') as authenticated_delete;

-- 汇总。verify_ok 为 true 之后，才做 H5 测试提交。
select
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'submit_lead_v2'
      and p.pronargs = 22
      and p.prosecdef
      and pg_get_function_result(p.oid) = 'jsonb'
      and 'search_path=public' = any (p.proconfig)
      and pg_get_function_identity_arguments(p.oid) = 'p_token uuid, p_name text, p_phone text, p_wechat text, p_family text, p_parents text, p_retirement text, p_medical text, p_income text, p_total_score integer, p_profile_code text, p_profile_title text, p_focus text, p_attention text, p_next text, p_answers jsonb, p_dimensions jsonb, p_source text, p_campaign text, p_channel text, p_model_id text, p_model_version text'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as submit_lead_v2_ok,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'submit_lead'
  ) = 3 as old_submit_lead_count_ok,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name in ('model_id', 'model_version', 'campaign', 'channel')
  ) = 4 as v22_columns_ok,
  exists (
    select 1
    from pg_index
    where indrelid = to_regclass('public.leads')
      and indisunique
      and indnkeyatts = 1
      and pg_get_indexdef(indexrelid) ilike '%(lead_token)%'
  ) as lead_token_unique_ok,
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
  ), false) as rls_ok,
  (
    not has_table_privilege('anon', 'public.leads', 'SELECT')
    and not has_table_privilege('anon', 'public.leads', 'INSERT')
    and not has_table_privilege('anon', 'public.leads', 'UPDATE')
    and not has_table_privilege('anon', 'public.leads', 'DELETE')
    and not has_table_privilege('authenticated', 'public.leads', 'SELECT')
    and not has_table_privilege('authenticated', 'public.leads', 'INSERT')
    and not has_table_privilege('authenticated', 'public.leads', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.leads', 'DELETE')
  ) as table_privileges_ok,
  (
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'submit_lead_v2'
        and p.pronargs = 22
        and p.prosecdef
        and pg_get_function_result(p.oid) = 'jsonb'
        and 'search_path=public' = any (p.proconfig)
        and pg_get_function_identity_arguments(p.oid) = 'p_token uuid, p_name text, p_phone text, p_wechat text, p_family text, p_parents text, p_retirement text, p_medical text, p_income text, p_total_score integer, p_profile_code text, p_profile_title text, p_focus text, p_attention text, p_next text, p_answers jsonb, p_dimensions jsonb, p_source text, p_campaign text, p_channel text, p_model_id text, p_model_version text'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    and (
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'submit_lead'
    ) = 3
    and (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'leads'
        and column_name in ('model_id', 'model_version', 'campaign', 'channel')
    ) = 4
    and exists (
      select 1
      from pg_index
      where indrelid = to_regclass('public.leads')
        and indisunique
        and indnkeyatts = 1
        and pg_get_indexdef(indexrelid) ilike '%(lead_token)%'
    )
    and coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'leads'
    ), false)
    and not has_table_privilege('anon', 'public.leads', 'SELECT')
    and not has_table_privilege('anon', 'public.leads', 'INSERT')
    and not has_table_privilege('anon', 'public.leads', 'UPDATE')
    and not has_table_privilege('anon', 'public.leads', 'DELETE')
    and not has_table_privilege('authenticated', 'public.leads', 'SELECT')
    and not has_table_privilege('authenticated', 'public.leads', 'INSERT')
    and not has_table_privilege('authenticated', 'public.leads', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.leads', 'DELETE')
  ) as verify_ok;
