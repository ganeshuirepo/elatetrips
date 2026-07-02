'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
// The Web Speech API isn't in the TS DOM lib, so the recognition object is typed
// loosely here. Support is Chromium-based browsers (Chrome/Edge) over https or
// localhost, with mic permission and (for Chrome) an internet connection.

export interface SpeechOptions {
  lang?: string;
  /** Called with each finalised chunk of speech (so callers can append it). */
  onResult?: (finalChunk: string) => void;
}

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  /** In-progress (not yet final) words, for a live preview. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition({ lang = 'en-IN', onResult }: SpeechOptions = {}): SpeechState {
  // Lazy (mount-time) support check — avoids setState inside the effect.
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const wantRef = useRef(false); // whether the user still intends to listen
  const cbRef = useRef(onResult);

  // Keep the latest callback without re-initialising recognition.
  useEffect(() => {
    cbRef.current = onResult;
  });

  useEffect(() => {
    if (!supported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e: any) => {
      let intr = '';
      let fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += chunk + ' ';
        else intr += chunk;
      }
      if (fin) cbRef.current?.(fin.replace(/\s+/g, ' ').trim());
      setInterim(intr);
    };
    rec.onerror = (e: any) => {
      const err = e?.error ?? 'error';
      setError(err);
      // Permission / policy errors won't recover on restart — stop trying.
      if (err === 'not-allowed' || err === 'service-not-allowed') wantRef.current = false;
    };
    rec.onend = () => {
      setInterim('');
      // The API ends after pauses even with continuous=true — restart while the
      // user still wants to listen; otherwise settle into the stopped state.
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore double-start */
        }
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;
    return () => {
      wantRef.current = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [lang, supported]);

  const start = useCallback(() => {
    setError(null);
    wantRef.current = true;
    try {
      recRef.current?.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => setInterim(''), []);

  return { supported, listening, interim, error, start, stop, reset };
}
