import { useState, useEffect, useCallback } from 'react';
import { Category } from '../types';
import { supabase } from '../utils/supabase';

/** Map of merchantKey → user-chosen Category */
export type MerchantOverrides = Record<string, Category>;

export function useMerchantOverrides(userId: string) {
  const [overrides, setOverrides] = useState<MerchantOverrides>({});

  useEffect(() => {
    if (!userId) { setOverrides({}); return; }
    supabase
      .from('merchant_overrides')
      .select('merchant_key, category')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!data) return;
        const map: MerchantOverrides = {};
        for (const row of data) {
          map[row.merchant_key as string] = row.category as Category;
        }
        setOverrides(map);
      });
  }, [userId]);

  /** Save a user correction for a merchant. Applies immediately in-memory. */
  const saveOverride = useCallback(async (key: string, category: Category) => {
    if (!userId) return;
    const { error } = await supabase.from('merchant_overrides').upsert({
      user_id:      userId,
      merchant_key: key,
      category,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id,merchant_key' });
    if (!error) setOverrides((prev) => ({ ...prev, [key]: category }));
  }, [userId]);

  return { overrides, saveOverride };
}
