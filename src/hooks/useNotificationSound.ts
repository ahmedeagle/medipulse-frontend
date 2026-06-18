import { useRef, useCallback, useEffect } from 'react';

type SoundType = 'normal' | 'critical' | 'success';

// Persist mute preference across sessions
const MUTE_KEY = 'notification_sound_muted';

function getMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
    window.dispatchEvent(new CustomEvent('notification-mute-changed', { detail: muted }));
  } catch { /* ignore */ }
}

export function getNotificationSoundMuted(): boolean {
  return getMuted();
}

/**
 * Plays a Web Audio API chime — no file download, works offline.
 *
 * Tones:
 *   normal   → 880 Hz  → 1100 Hz  (soft ascending pop, 220ms)
 *   critical → 880 Hz  → 660 Hz   → 880 Hz (urgent double-beep, 400ms)
 *   success  → 660 Hz  → 880 Hz   → 1100 Hz (pleasant rising 3-tone, 330ms)
 */
function playChime(ctx: AudioContext, type: SoundType = 'normal') {
  const now = ctx.currentTime;
  const vol = 0.18; // quiet enough not to startle

  const createTone = (freq: number, start: number, duration: number, fade: number) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.setValueAtTime(vol, start + duration - fade);
    gain.gain.linearRampToValueAtTime(0, start + duration);

    osc.start(start);
    osc.stop(start + duration);
  };

  if (type === 'normal') {
    // Two-tone ascending pop (like Google Chat)
    createTone(880,  now,        0.12, 0.05);
    createTone(1100, now + 0.10, 0.12, 0.05);
  } else if (type === 'critical') {
    // Three-pulse urgent alert
    createTone(880, now,        0.10, 0.03);
    createTone(660, now + 0.13, 0.10, 0.03);
    createTone(880, now + 0.26, 0.14, 0.05);
  } else {
    // Three-tone rising success chime
    createTone(660,  now,        0.10, 0.03);
    createTone(880,  now + 0.11, 0.10, 0.03);
    createTone(1100, now + 0.22, 0.14, 0.05);
  }
}

export function useNotificationSound() {
  const ctxRef   = useRef<AudioContext | null>(null);
  const mutedRef = useRef<boolean>(getMuted());
  // debounce — don't play if another sound fired in the last 2s
  const lastPlay = useRef<number>(0);

  // Keep mutedRef in sync with localStorage changes (e.g. settings panel toggle)
  useEffect(() => {
    const handler = (e: Event) => {
      mutedRef.current = (e as CustomEvent<boolean>).detail;
    };
    window.addEventListener('notification-mute-changed', handler);
    return () => window.removeEventListener('notification-mute-changed', handler);
  }, []);

  const play = useCallback((type: SoundType = 'normal') => {
    if (mutedRef.current) return;

    const now = Date.now();
    if (now - lastPlay.current < 2000) return; // debounce 2s
    lastPlay.current = now;

    try {
      // Create (or resume) AudioContext only on user gesture or explicit call
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playChime(ctx, type));
      } else {
        playChime(ctx, type);
      }
    } catch { /* browser may block — silently ignore */ }
  }, []);

  return { play, getMuted: () => mutedRef.current };
}
