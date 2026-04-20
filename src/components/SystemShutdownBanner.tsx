import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

function getTargetTime() {
  const now = new Date();
  const target = new Date();
  target.setHours(21, 0, 0, 0);
  return target;
}

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function SystemShutdownBanner() {
  const [remaining, setRemaining] = useState(() => getTargetTime().getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getTargetTime().getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (remaining <= 0) return null;

  return (
    <div
      dir="rtl"
      className="w-full bg-destructive text-destructive-foreground px-3 py-2 text-sm flex items-center justify-center gap-2 shadow-md flex-wrap"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-semibold">تنبيه:</span>
      <span>السيستم هيقف لعدم وجود تقدير — متبقي على الإيقاف:</span>
      <span className="font-mono font-bold tracking-wider bg-background/20 px-2 py-0.5 rounded">
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
