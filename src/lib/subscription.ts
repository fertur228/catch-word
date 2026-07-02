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

// Кэш последнего известного статуса на время жизни приложения. Чтобы при
// повторном открытии экрана (напр. Настроек) хук стартовал СРАЗУ с правильным
// значением, а не мигал дефолтным «Free» до ответа Supabase.
let cachedPremium = false;
let cachedStatus: SubscriptionStatus = 'free';

export function useSubscription() {
  const { session } = useAuth();
  const [isPremium, setIsPremium] = useState(cachedPremium);
  const [status, setStatus] = useState<SubscriptionStatus>(cachedStatus);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let premium = false;
    let subStatus: SubscriptionStatus = 'free';

    if (session?.user) {
      const { data } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        subStatus = (data.status as SubscriptionStatus) ?? 'free';
        const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
        // Активен если: active, trialing, или canceled но ещё не истёк период.
        premium =
          subStatus === 'active' ||
          subStatus === 'trialing' ||
          (subStatus === 'canceled' && periodEnd !== null && periodEnd > new Date());
      }
    }

    cachedPremium = premium;
    cachedStatus = subStatus;
    setIsPremium(premium);
    setStatus(subStatus);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isPremium, status, loading, refresh };
}
