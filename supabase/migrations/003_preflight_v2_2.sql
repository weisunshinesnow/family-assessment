-- V2.2 上线前检查。只读。
-- 在 DBeaver 里用「执行 SQL 脚本」(Alt+X) 跑整份文件。
-- 本文件不建表、不改函数、不插入、不更新、不删除。

-- 1. leads 表
select to_regclass('public.leads') as leads_table;

-- 2. lead_token 的单列唯一索引或唯一约束
select pg_get_indexdef(indexrelid) as lead_token_unique_index
from pg_index
where indrelid = to_regclass('public.leads')
  and indisunique
  and indnkeyatts = 1
  and pg_get_indexdef(indexrelid) ilike '%(lead_token)%';

-- 3. 旧 submit_lead 的全部签名
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_lead'
order by identity_args;

-- 4. submit_lead_v2 是否已经存在
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'submit_lead_v2'
order by identity_args;

-- 5. V2.2 新字段。执行 002 之前预期是 0 行。
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leads'
  and column_name in ('model_id', 'model_version', 'campaign', 'channel')
order by column_name;

-- 6. RLS
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'leads';

-- 7. anon / authenticated 对 leads 的表权限
select
  has_table_privilege('anon', 'public.leads', 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.leads', 'INSERT') as anon_insert,
  has_table_privilege('anon', 'public.leads', 'UPDATE') as anon_update,
  has_table_privilege('anon', 'public.leads', 'DELETE') as anon_delete,
  has_table_privilege('authenticated', 'public.leads', 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', 'public.leads', 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', 'public.leads', 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', 'public.leads', 'DELETE') as authenticated_delete;

-- 汇总。preflight_ok 为 true 才可以执行 002。
select
  to_regclass('public.leads') is not null as leads_exists,
  exists (
    select 1
    from pg_index
    where indrelid = to_regclass('public.leads')
      and indisunique
      and indnkeyatts = 1
      and pg_get_indexdef(indexrelid) ilike '%(lead_token)%'
  ) as lead_token_unique,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'submit_lead'
  ) as submit_lead_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'submit_lead_v2'
  ) as submit_lead_v2_count,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name in ('model_id', 'model_version', 'campaign', 'channel')
  ) as v22_column_count,
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
  ), false) as rls_enabled,
  (
    to_regclass('public.leads') is not null
    and exists (
      select 1
      from pg_index
      where indrelid = to_regclass('public.leads')
        and indisunique
        and indnkeyatts = 1
        and pg_get_indexdef(indexrelid) ilike '%(lead_token)%'
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
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'submit_lead_v2'
    ) = 0
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
  ) as preflight_ok;
