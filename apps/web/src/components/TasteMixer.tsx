'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight, Settings2 } from 'lucide-react';
import { defaultTaste, dimensions, type Taste } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { useEngine } from '@/lib/taste-engine';
import Modal from './Modal';
import { setTrailerSound, useTrailerSound } from '@/lib/trailer-sound';

export default function TasteMixer() {
  const app = useApp();
  const { engine, candidateCount } = useEngine();
  const sound = useTrailerSound();
  const value = app.prefs.titleLanguage;
  const router = useRouter();
  const close = () => app.setMixerOpen(false);
  return (
    <Modal title="Settings" onClose={close}>
      <div className="mixer-heading">
        <span className="mixer-icon">
          <Settings2 size={25} />
        </span>
        <h2>Settings</h2>
        <p>Make it yours. Everything saves in this browser and applies instantly.</p>
      </div>
      <section className="settings-group" aria-labelledby="display-settings">
        <h3 id="display-settings">Display</h3>
        <fieldset className="segmented">
          <legend>Show titles in</legend>
          {(
            [
              ['english', 'English'],
              ['romaji', 'Romaji'],
              ['native', 'Original script'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={app.prefs.titleLanguage === value ? 'selected' : ''}>
              <input
                type="radio"
                name="title-language"
                value={value}
                checked={app.prefs.titleLanguage === value}
                onChange={() => app.setPrefs({ titleLanguage: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="setting-hint">
          Example:{' '}
          {value === 'english'
            ? 'Frieren: Beyond Journey’s End'
            : value === 'romaji'
              ? 'Sousou no Frieren'
              : '葬送のフリーレン'}
        </p>
        <label className="switch-row">
          <span>
            <strong>Play trailers on hover</strong>
            <small>Rest the pointer on a cover or highlight to watch its trailer.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={app.prefs.hoverPreviews}
            onChange={(e) => app.setPrefs({ hoverPreviews: e.target.checked })}
          />
        </label>
        <label className="switch-row">
          <span>
            <strong>Trailer sound</strong>
            <small>Start trailers with sound. Your browser may still mute the first one.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={sound}
            onChange={(e) => setTrailerSound(e.target.checked)}
          />
        </label>
      </section>
      <section className="settings-group" aria-labelledby="taste-settings">
        <h3 id="taste-settings">Taste</h3>
        <p className="setting-hint">Drag the sliders. Your matches update straight away.</p>
      </section>
      <div className="taste-sliders">
        {dimensions.map((d, i) => (
          <label key={d}>
            <span>
              {d}
              <strong>{Math.round(app.taste[i] * 100)}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(app.taste[i] * 100)}
              onChange={(e) =>
                app.setTaste(
                  (t) => t.map((v, j) => (i === j ? Number(e.target.value) / 100 : v)) as Taste,
                )
              }
            />
          </label>
        ))}
      </div>
      <label className="variety-control">
        <span>
          Stick to what I like <strong>Surprise me more</strong>
        </span>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={app.variety}
          onChange={(e) => app.setVariety(Number(e.target.value))}
        />
      </label>
      <div className="engine-note">
        <span className="engine-dot" />
        <div>
          <strong>{engine}</strong>
          <p>
            Ranking {candidateCount} titles using {app.feedback.length} of your ratings, your
            library and these sliders, all inside your browser. The more you rate, the better we get
            at this.
          </p>
        </div>
      </div>
      {app.feedback.length > 0 && (
        <button className="text-button" onClick={app.clearRatings}>
          Forget my ratings
        </button>
      )}
      <div className="mixer-actions">
        <button
          className="text-button"
          onClick={() => {
            app.setTaste(defaultTaste);
            app.setVariety(1.2);
          }}
        >
          Reset taste
        </button>
        <button
          className="primary-button"
          onClick={() => {
            close();
            router.push('/for-you');
          }}
        >
          Show my matches <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
