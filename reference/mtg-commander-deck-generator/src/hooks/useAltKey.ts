import { useEffect, useState } from 'react';

/**
 * Tracks whether the Alt key is currently held down.
 * Used to show magnified previews on hover.
 */
export function useAltKey(): boolean {
  const [alt, setAlt] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Alt') setAlt(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Alt') setAlt(false); };
    const onBlur = () => setAlt(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return alt;
}
