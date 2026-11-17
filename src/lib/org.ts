import { supabase } from './supabase';

export async function getOrCreateOrg(userId: string): Promise<string | null> {
  const { data: memberships } = await supabase.from('organization_members').select('organization_id').eq('user_id', userId).eq('status', 'active').limit(1);
  if (memberships && memberships.length > 0) return memberships[0].organization_id;
  // create org
  const { data: org, error } = await supabase.from('organizations').insert({ name: 'My Practice', type: 'solo', plan: 'trial' }).select().single();
  if (error || !org) return null;
  await supabase.from('organization_members').insert({ organization_id: org.id, user_id: userId, role: 'owner', status: 'active', joined_at: new Date().toISOString() });
  await supabase.from('organization_settings').insert({ organization_id: org.id });
  await supabase.from('subscriptions').insert({ organization_id: org.id, plan: 'trial', status: 'trial', trial_start: new Date().toISOString(), trial_end: new Date(Date.now() + 14 * 86400000).toISOString() });
  return org.id;
}