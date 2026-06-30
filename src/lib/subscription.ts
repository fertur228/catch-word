import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'revoked';

export function useSubscription() {
  const { session } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus>('free');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setIsPremium(false);
      setStatus('free');
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      setIsPremium(false);
      setStatus('free');
      setLoading(false);
      return;
    }

    const subStatus = (data.status as SubscriptionStatus) ?? 'free';
    const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;

    // Активен если: active, trialing, или canceled но ещё не истёк период.
    const active =
      subStatus === 'active' ||
      subStatus === 'trialing' ||
      (subStatus === 'canceled' && periodEnd !== null && periodEnd > new Date());

    setIsPremium(active);
    setStatus(subStatus);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isPremium, status, loading, refresh };
}
