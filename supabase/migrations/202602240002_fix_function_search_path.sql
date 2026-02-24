-- Fix Supabase linter warning 0011: function_search_path_mutable.
-- Lock trigger functions to a fixed search_path to avoid role/session-dependent resolution.
alter function public.set_updated_at() set search_path = public;
alter function public.consume_inventory_for_part() set search_path = public;
alter function public.log_work_order_changes() set search_path = public;
alter function public.log_work_log_created() set search_path = public;
alter function public.log_work_part_created() set search_path = public;
