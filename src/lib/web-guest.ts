/**
 * «Гость» на вебе: пользователь нажал «Продолжить без аккаунта» на лендинге.
 * Тогда гейт в app/_layout пускает его в приложение без входа (паритет с
 * мобилкой, где вход не обязателен). Облако-синк включается только после входа.
 *
 * Маленький стор + хук-подписка, чтобы гейт реагировал на смену значения без
 * перезагрузки страницы. На нативе не используется (гейт — только web).
 */
import { useEffect, useState } from 'react';

const KEY = 'cw.guest';

function read(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

let guest = read();
const subs = new Set<() => void>();

export function isGuest(): boolean {
  return guest;
}

export function setGuest(v: boolean): void {
  guest = v;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(v));
  } catch {
    /* приватный режим — ок, останется в памяти */
  }
  subs.forEach((f) => f());
}

/** Реактивно следить за флагом гостя (гейт перерисуется при смене). */
export function useGuest(): boolean {
  const [value, setValue] = useState(guest);
  useEffect(() => {
    const f = () => setValue(guest);
    subs.add(f);
    f(); // синхронизируемся на случай изменения до подписки
    return () => {
      subs.delete(f);
    };
  }, []);
  return value;
}
