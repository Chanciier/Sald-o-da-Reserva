'use client';

import { useEffect, useState } from 'react';

type TimeLeft = {
  hours: number;
  minutes: number;
  seconds: number;
};

function getTimeLeft(target: number): TimeLeft {
  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function getOrCreateDeadline(durationHours: number): number {
  const key = `promo_deadline_${durationHours}h`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const d = parseInt(stored, 10);
      if (d > Date.now()) return d;
    }
  } catch {
    // localStorage indisponível (SSR ou privado)
  }
  const d = Date.now() + durationHours * 3600 * 1000;
  try {
    localStorage.setItem(key, String(d));
  } catch {
    // ignore
  }
  return d;
}

export function useCountdown(durationHours = 5) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    hours: durationHours,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const key = `promo_deadline_${durationHours}h`;
    let deadline = getOrCreateDeadline(durationHours);
    setTimeLeft(getTimeLeft(deadline));

    const interval = setInterval(() => {
      if (Date.now() >= deadline) {
        deadline = Date.now() + durationHours * 3600 * 1000;
        try {
          localStorage.setItem(key, String(deadline));
        } catch {
          // ignore
        }
      }
      setTimeLeft(getTimeLeft(deadline));
    }, 1000);

    return () => clearInterval(interval);
  }, [durationHours]);

  return timeLeft;
}

export const pad = (n: number) => n.toString().padStart(2, '0');
