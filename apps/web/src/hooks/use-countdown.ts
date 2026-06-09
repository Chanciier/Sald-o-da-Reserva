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

export function useCountdown(durationHours = 5) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    hours: durationHours,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    let target = Date.now() + durationHours * 3600 * 1000;
    setTimeLeft(getTimeLeft(target));

    const interval = setInterval(() => {
      if (target - Date.now() <= 0) {
        target = Date.now() + durationHours * 3600 * 1000;
      }
      setTimeLeft(getTimeLeft(target));
    }, 1000);
    return () => clearInterval(interval);
  }, [durationHours]);

  return timeLeft;
}

export const pad = (n: number) => n.toString().padStart(2, '0');
