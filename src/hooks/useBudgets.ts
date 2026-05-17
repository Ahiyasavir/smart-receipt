import { useState, useEffect, useCallback } from 'react';
import { UserBudgets } from '../types';
import { supabase } from '../utils/supabase';

const DEFAULT: UserBudgets = { weekly: {}, monthly: {} };

export function useBudgets(userId: string) {
  const [budgets,     setBudgets]     = useState<UserBudgets>(DEFAULT);
  const [emailDigest, setEmailDigest] = useState(false);

  useEffect(() => {
    if (!userId) { setBudgets(DEFAULT); return; }
    supabase
      .from('budgets')
      .select('weekly, monthly, email_digest')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('budgets load:', error.message); return; }
        if (data) {
          setBudgets({ weekly: data.weekly ?? {}, monthly: data.monthly ?? {} });
          setEmailDigest(data.email_digest ?? false);
        }
      });
  }, [userId]);

  const updateBudgets = useCallback(async (next: UserBudgets) => {
    if (!userId) return;
    const { error } = await supabase.from('budgets').upsert({
      user_id: userId,
      weekly:  next.weekly,
      monthly: next.monthly,
    }, { onConflict: 'user_id' });
    if (error) { console.error('updateBudgets:', error.message); return; }
    setBudgets(next);
  }, [userId]);

  const setEmailDigestPref = useCallback(async (enabled: boolean) => {
    if (!userId) return;
    const { error } = await supabase.from('budgets').upsert({
      user_id:      userId,
      weekly:       budgets.weekly,
      monthly:      budgets.monthly,
      email_digest: enabled,
    }, { onConflict: 'user_id' });
    if (error) { console.error('setEmailDigest:', error.message); return; }
    setEmailDigest(enabled);
  }, [userId, budgets]);

  return { budgets, updateBudgets, emailDigest, setEmailDigestPref };
}
