// utils/usePurchasesSetup.ts
// Call once in app/_layout.tsx. Starts RevenueCat and keeps it tied to the signed-in Supabase user.
import { useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { identifyPurchaser, initPurchases } from '@/utils/purchases';

export function usePurchasesSetup() {
  useEffect(() => {
    if (!initPurchases()) return;

    supabase.auth.getSession().then(({ data }) => {
      identifyPurchaser(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid awaiting Supabase calls inside this callback.
      setTimeout(() => identifyPurchaser(session?.user.id ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}