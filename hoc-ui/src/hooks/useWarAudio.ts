/**
 * useWarAudio — Procedural War Theater Audio Engine
 *
 * All sounds synthesized via Web Audio API — zero external files needed.
 * Provides ambient war room drone, radar sweeps, sonar pings,
 * missile launch SFX, and explosion impacts.
 *
 * Respects browser autoplay policy: audio context starts suspended
 * and resumes on first user interaction.
 */

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────

export interface WarAudioControls {
  /** Master volume 0–1 */
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  /** Ambient volume 0–1 */
  ambientVolume: number;
  setAmbientVolume: (v: number) => void;
  /** SFX volume 0–1 */
  sfxVolume: number;
  setSfxVolume: (v: number) => void;
  /** Global mute */
  muted: boolean;
  toggleMute: () => void;
  /** Has user interacted (audio unlocked)? */
  unlocked: boolean;
  /** Call on first user interaction to unlock audio */
  unlock: () => void;
  /** Fire-and-forget SFX triggers */
  playRadarPing: () => void;
  playSonarSweep: () => void;
  playMissileLaunch: () => void;
  playExplosion: () => void;
  playRadioChatter: () => void;
}

// ─── Procedural sound generators ───────────────────────────────────

function createBrownNoise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function playTone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  maxGain = 0.3,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(maxGain, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(dest);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  duration: number,
  maxGain = 0.4,
  lowFreq = 40,
  highFreq = 800,
) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime((lowFreq + highFreq) / 2, ctx.currentTime);
  filter.Q.setValueAtTime(1, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(maxGain, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter).connect(gain).connect(dest);
  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useWarAudio(): WarAudioControls {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const sfxGainRef = useRef<GainNode | null>(null);
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientFilterRef = useRef<BiquadFilterNode | null>(null);
  const radarIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false); // Ref mirror of muted state for interval callbacks

  const [masterVolume, setMasterVolumeState] = useState(0.5);
  const [ambientVolume, setAmbientVolumeState] = useState(0.3);
  const [sfxVolume, setSfxVolumeState] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Initialize audio context lazily
  const getCtx = useCallback(() => {
    if (ctxRef.current) { return ctxRef.current; }

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    // Master gain → destination
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.5, ctx.currentTime);
    master.connect(ctx.destination);
    masterGainRef.current = master;

    // Ambient gain → master
    const ambient = ctx.createGain();
    ambient.gain.setValueAtTime(0.3, ctx.currentTime);
    ambient.connect(master);
    ambientGainRef.current = ambient;

    // SFX gain → master
    const sfx = ctx.createGain();
    sfx.gain.setValueAtTime(0.6, ctx.currentTime);
    sfx.connect(master);
    sfxGainRef.current = sfx;

    return ctx;
  }, []);

  // Start ambient sound (brown noise drone)
  const startAmbient = useCallback(() => {
    const ctx = getCtx();
    if (ambientSourceRef.current || !ambientGainRef.current) { return; }

    const source = createBrownNoise(ctx, 2);

    // Low-pass filter for deep war-room drone
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.Q.setValueAtTime(1, ctx.currentTime);
    ambientFilterRef.current = filter;

    source.connect(filter).connect(ambientGainRef.current);
    source.start();
    ambientSourceRef.current = source;

    // Periodic radar sweep — uses mutedRef to avoid recreating on mute changes
    radarIntervalRef.current = setInterval(() => {
      if (sfxGainRef.current && !mutedRef.current) {
        playTone(ctx, sfxGainRef.current, 1000, 0.15, "sine", 0.08);
      }
    }, 4000);
  }, [getCtx]); // Removed `muted` dep — use mutedRef instead

  // Unlock audio (call on first user interaction)
  const unlock = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    if (!unlocked) {
      setUnlocked(true);
      startAmbient();
    }
  }, [getCtx, unlocked, startAmbient]);

  // Volume setters
  const setMasterVolume = useCallback(
    (v: number) => {
      setMasterVolumeState(v);
      const ctx = ctxRef.current;
      if (masterGainRef.current && ctx) {
        masterGainRef.current.gain.setValueAtTime(muted ? 0 : v, ctx.currentTime);
      }
    },
    [muted],
  );

  const setAmbientVolume = useCallback((v: number) => {
    setAmbientVolumeState(v);
    const ctx = ctxRef.current;
    if (ambientGainRef.current && ctx) {
      ambientGainRef.current.gain.setValueAtTime(v, ctx.currentTime);
    }
  }, []);

  const setSfxVolume = useCallback((v: number) => {
    setSfxVolumeState(v);
    const ctx = ctxRef.current;
    if (sfxGainRef.current && ctx) {
      sfxGainRef.current.gain.setValueAtTime(v, ctx.currentTime);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next; // Keep ref in sync
      const ctx = ctxRef.current;
      if (masterGainRef.current && ctx) {
        masterGainRef.current.gain.setValueAtTime(next ? 0 : masterVolume, ctx.currentTime);
      }
      return next;
    });
  }, [masterVolume]);

  // ── SFX Triggers ──

  const playRadarPing = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sfxGainRef.current || mutedRef.current) { return; }
    playTone(ctx, sfxGainRef.current, 1200, 0.25, "sine", 0.2);
  }, []);

  const playSonarSweep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sfxGainRef.current || mutedRef.current) { return; }
    // Rising frequency sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(sfxGainRef.current);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  }, []);

  const playMissileLaunch = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sfxGainRef.current || mutedRef.current) { return; }
    // White noise burst + rising pitch
    playNoiseBurst(ctx, sfxGainRef.current, 1.2, 0.3, 200, 4000);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(gain).connect(sfxGainRef.current);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.0);
  }, []);

  const playExplosion = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sfxGainRef.current || mutedRef.current) { return; }
    // Low-freq noise burst with distortion
    playNoiseBurst(ctx, sfxGainRef.current, 1.5, 0.5, 30, 400);
    // Sub-bass thump
    playTone(ctx, sfxGainRef.current, 40, 0.6, "sine", 0.4);
  }, []);

  const playRadioChatter = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed" || !sfxGainRef.current || mutedRef.current) { return; }
    // Filtered noise with random amplitude modulation
    playNoiseBurst(ctx, sfxGainRef.current, 0.8, 0.12, 800, 3000);
  }, []);

  // Cleanup on unmount — full audio graph teardown
  useEffect(() => {
    return () => {
      if (radarIntervalRef.current) {
        clearInterval(radarIntervalRef.current);
        radarIntervalRef.current = null;
      }
      if (ambientSourceRef.current) {
        try {
          ambientSourceRef.current.stop();
          ambientSourceRef.current.disconnect();
        } catch {
          /* already stopped */
        }
        ambientSourceRef.current = null;
      }
      // Disconnect filter node
      if (ambientFilterRef.current) {
        try { ambientFilterRef.current.disconnect(); } catch { /* ok */ }
        ambientFilterRef.current = null;
      }
      // Disconnect gain nodes
      if (ambientGainRef.current) {
        try { ambientGainRef.current.disconnect(); } catch { /* ok */ }
        ambientGainRef.current = null;
      }
      if (sfxGainRef.current) {
        try { sfxGainRef.current.disconnect(); } catch { /* ok */ }
        sfxGainRef.current = null;
      }
      if (masterGainRef.current) {
        try { masterGainRef.current.disconnect(); } catch { /* ok */ }
        masterGainRef.current = null;
      }
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
      }
      ctxRef.current = null;
    };
  }, []);

  return {
    masterVolume,
    setMasterVolume,
    ambientVolume,
    setAmbientVolume: setAmbientVolume,
    sfxVolume,
    setSfxVolume: setSfxVolume,
    muted,
    toggleMute,
    unlocked,
    unlock,
    playRadarPing,
    playSonarSweep,
    playMissileLaunch,
    playExplosion,
    playRadioChatter,
  };
}
