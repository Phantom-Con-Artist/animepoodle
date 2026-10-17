'use client';
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<void> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      loading = undefined;
      reject(new Error('timeout'));
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error('load'));
    };
    document.head.appendChild(script);
  }));
}
export default function HypeVerification({
  siteKey,
  title,
  onVerify,
  onClose,
}: {
  siteKey: string;
  title: string;
  onVerify: (token: string) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const callback = useRef(onVerify);
  callback.current = onVerify;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let widget: string | undefined;
    setError('');
    loadTurnstile()
      .then(() => {
        if (disposed || !root.current || !window.turnstile) return;
        widget = window.turnstile.render(root.current, {
          sitekey: siteKey,
          action: 'hype',
          size: 'flexible',
          callback: (token: string) => {
            if (!disposed) callback.current(token);
          },
          'error-callback': () => {
            if (!disposed) setError('Verification could not load. Please try again.');
          },
          'expired-callback': () => {
            if (!disposed) setError('Verification expired. Please try again.');
          },
        });
      })
      .catch(() => {
        if (!disposed) setError('Verification could not load. Please try again.');
      });
    return () => {
      disposed = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, attempt]);
  return (
    <Modal title="Send Hype" onClose={onClose}>
      <h2>One point for {title}</h2>
      <p className="setting-hint">
        A quick check keeps the Hype charts fair. Your point is sent when verification finishes.
      </p>
      <div className="hype-verification" ref={root} />
      {error && (
        <p role="alert">
          {error}{' '}
          <button className="text-button" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <button className="subtle-button" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
