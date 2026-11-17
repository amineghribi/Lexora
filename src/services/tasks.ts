import { supabase } from '../lib/supabase';
export async function listTasks(orgId: string) {
  const { data, error } = await supabase.from('tasks').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  return { data, error };
}
export async function createTask(orgId: string, payload: { title: string; priority?: string; due_date?: string | null }) {
  const { data, error } = await supabase.from('tasks').insert({ organization_id: orgId, status: 'todo', ...payload }).select().single();
  return { data, error };
}
export async function updateTaskStatus(id: string, status: string) {
  return supabase.from('tasks').update({ status }).eq('id', id);
}