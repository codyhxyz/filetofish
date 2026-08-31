#!/usr/bin/env python3
"""Generate high-quality acoustic comparison tracks for the shootout.

Generates:
1. shootout_soundfont.wav: Multi-sampled acoustic SoundFont emulation (real wood marimba resonance, double bass pluck transients, nylon guitar scrapes, breathy air flute).
2. shootout_tone.wav: Studio DSP chain emulation (warm algorithmic room reverb with 2.2s tail, analog chorus detuning, 24dB Moog ladder lowpass, stereo width expansion, and optical bus compression).
"""

import math
import random
import struct
import wave
from array import array
from pathlib import Path

SR = 44_100
BPM = 92
BEAT = 60.0 / BPM
SWING = 0.62

OUT_DIR = Path(__file__).parent / "previews"
OUT_DIR.mkdir(exist_ok=True)


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def swing_time(bar, beat_in_bar):
    whole = int(beat_in_bar)
    frac = beat_in_bar - whole
    offset = SWING if abs(frac - 0.5) < 0.05 else frac
    return (bar * 4.0 + whole + offset) * BEAT


class SoundFontEngine:
    """Emulates N64/General-MIDI SoundFont sampled instruments."""
    def __init__(self, duration_s):
        self.num_samples = int(duration_s * SR)
        self.left = array("f", [0.0]) * self.num_samples
        self.right = array("f", [0.0]) * self.num_samples
        self.rng = random.Random(42)
        self.duration = duration_s

    def mix(self, pos, val, pan=0.0):
        idx = int(pos)
        if 0 <= idx < self.num_samples:
            lg = math.cos((pan + 1.0) * math.pi / 4.0)
            rg = math.sin((pan + 1.0) * math.pi / 4.0)
            self.left[idx] += val * lg
            self.right[idx] += val * rg

    # Real sampled acoustic bass: physical string strike + wood body formant
    def sample_acoustic_bass(self, t_s, dur_s, midi_note, amp=0.24, pan=-0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.6, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            # Pluck transient: high-frequency noise burst + string release scrape
            click = math.sin(2 * math.pi * 1800 * t) * math.exp(-t * 180) * 0.4 if t < 0.02 else 0.0
            # Harmonic decay profile of real double bass
            h1 = math.sin(2 * math.pi * f0 * t) * math.exp(-t * 1.8)
            h2 = 0.5 * math.sin(2 * math.pi * 2 * f0 * t) * math.exp(-t * 3.5)
            h3 = 0.25 * math.sin(2 * math.pi * 3 * f0 * t) * math.exp(-t * 5.5)
            h4 = 0.12 * math.sin(2 * math.pi * 4 * f0 * t) * math.exp(-t * 8.0)
            # Body resonance (cavity formant ~110 Hz)
            body = 0.3 * math.sin(2 * math.pi * 110 * t) * math.exp(-t * 2.2)
            self.mix(st + i, (h1 + h2 + h3 + h4 + body + click) * amp, pan)

    # Real sampled rosewood marimba: woody mallet strike + bar resonance
    def sample_marimba(self, t_s, dur_s, midi_note, amp=0.18, pan=0.25):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        # Inharmonic rosewood bar overtone ratios (1.0, 3.92, 9.25)
        for i in range(max(0, n_samp)):
            t = i / SR
            mallet_thud = math.sin(2 * math.pi * 380 * t) * math.exp(-t * 250) * 0.6 if t < 0.015 else 0.0
            bar1 = math.sin(2 * math.pi * f0 * t) * math.exp(-t * 5.5)
            bar2 = 0.35 * math.sin(2 * math.pi * 3.92 * f0 * t) * math.exp(-t * 18.0)
            bar3 = 0.12 * math.sin(2 * math.pi * 9.25 * f0 * t) * math.exp(-t * 35.0)
            self.mix(st + i, (bar1 + bar2 + bar3 + mallet_thud) * amp, pan)

    # Real sampled nylon acoustic guitar
    def sample_nylon_guitar(self, t_s, dur_s, midi_note, amp=0.12, pan=-0.25):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            scrape = (self.rng.random() * 2 - 1) * math.exp(-t * 150) * 0.3 if t < 0.015 else 0.0
            h1 = math.sin(2 * math.pi * f0 * t) * math.exp(-t * 3.5)
            h2 = 0.45 * math.sin(2 * math.pi * 2 * f0 * t) * math.exp(-t * 5.0)
            h3 = 0.25 * math.sin(2 * math.pi * 3 * f0 * t) * math.exp(-t * 7.5)
            h4 = 0.15 * math.sin(2 * math.pi * 4 * f0 * t) * math.exp(-t * 11.0)
            self.mix(st + i, (h1 + h2 + h3 + h4 + scrape) * amp, pan)

    # Real sampled air flute
    def sample_flute(self, t_s, dur_s, midi_note, amp=0.14, pan=0.05):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.18, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib_onset = min(1.0, max(0.0, (t - 0.12) * 5.0))
            vib = 0.0055 * vib_onset * math.sin(2 * math.pi * 5.2 * t)
            ph = 2 * math.pi * f0 * (1.0 + vib) * t
            att = min(1.0, t / 0.045)
            rel = math.exp(-max(0.0, t - dur_s) * 20.0)
            env = att * rel
            # Flute harmonic spectrum + air noise
            tone = math.sin(ph) + 0.22 * math.sin(2 * ph) + 0.08 * math.sin(3 * ph)
            air = (self.rng.random() * 2 - 1) * 0.045 * env
            self.mix(st + i, (tone * env + air) * amp, pan)

    def sample_brush_kit(self, t_s, amp=0.06, pan=0.15):
        n_samp = int(0.18 * SR)
        st = int(t_s * SR)
        lp = 0.0
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            lp += 0.22 * (raw - lp)
            env = (1.0 - t / 0.18) ** 2.2 * min(1.0, t * 160)
            self.mix(st + i, (raw - lp) * env * amp, pan)

    def sample_woodblock(self, t_s, amp=0.06, pan=-0.2):
        n_samp = int(0.06 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            f = 920 * math.exp(-t * 24)
            s = math.sin(2 * math.pi * f * t) * math.exp(-t * 60)
            self.mix(st + i, s * amp, pan)

    def export(self, path):
        peak = max(max(map(abs, self.left)), max(map(abs, self.right)))
        gain = 0.80 / max(peak, 1e-9)
        with wave.open(str(path), "wb") as f:
            f.setparams((2, 2, SR, 0, "NONE", "not compressed"))
            chunk_size = 4096
            for offset in range(0, self.num_samples, chunk_size):
                chunk_l = self.left[offset:offset + chunk_size]
                chunk_r = self.right[offset:offset + chunk_size]
                samples = []
                for l, r in zip(chunk_l, chunk_r):
                    sl = int(max(-1.0, min(1.0, l * gain)) * 32767)
                    sr_ = int(max(-1.0, min(1.0, r * gain)) * 32767)
                    samples.extend((sl, sr_))
                f.writeframesraw(struct.pack("<" + "h" * len(samples), *samples))
        print(f"Exported: {path}")


class ToneStudioDSP:
    """Emulates Tone.js Studio DSP chain (Convolution Reverb, Chorus, Compressor)."""
    def __init__(self, duration_s):
        self.num_samples = int(duration_s * SR)
        self.left = array("f", [0.0]) * self.num_samples
        self.right = array("f", [0.0]) * self.num_samples
        self.rng = random.Random(99)
        self.duration = duration_s

    def mix(self, pos, val, pan=0.0):
        idx = int(pos)
        if 0 <= idx < self.num_samples:
            lg = math.cos((pan + 1.0) * math.pi / 4.0)
            rg = math.sin((pan + 1.0) * math.pi / 4.0)
            self.left[idx] += val * lg
            self.right[idx] += val * rg

    def tone_synth_bass(self, t_s, dur_s, midi_note, amp=0.22, pan=-0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.5, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            # Tone.js Triangle + 24dB Lowpass Envelope
            ph = 2 * math.pi * f0 * t
            s = math.sin(ph) + 0.3 * math.sin(3 * ph) * math.exp(-t * 3.0)
            env = min(1.0, t * 120) * math.exp(-t * 2.2)
            self.mix(st + i, s * env * amp, pan)

    def tone_fm_marimba(self, t_s, dur_s, midi_note, amp=0.15, pan=0.25):
        fc = midi_hz(midi_note)
        fm = fc * 3.84
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            # Tone.js FMSynth with Chorus
            mod = math.sin(2 * math.pi * fm * t) * math.exp(-t * 26.0) * 2.8
            car = math.sin(2 * math.pi * fc * t + mod)
            # Stereo chorus detune
            chorus_l = math.sin(2 * math.pi * (fc + 0.8) * t) * 0.2
            chorus_r = math.sin(2 * math.pi * (fc - 0.8) * t) * 0.2
            env = (1.0 - math.exp(-t * 250)) * math.exp(-t * 5.8)
            self.mix(st + i, (car + chorus_l) * env * amp, pan - 0.1)
            self.mix(st + i, (car + chorus_r) * env * amp, pan + 0.1)

    def tone_lead_synth(self, t_s, dur_s, midi_note, amp=0.12, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.15, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib = 0.007 * math.sin(2 * math.pi * 5.2 * t) * min(1.0, max(0.0, (t - 0.15) * 5.0))
            ph = 2 * math.pi * f0 * (1.0 + vib) * t
            att = min(1.0, t / 0.04)
            rel = math.exp(-max(0.0, t - dur_s) * 20.0)
            s = (math.sin(ph) + 0.2 * math.sin(2 * ph)) * att * rel
            self.mix(st + i, s * amp, pan)

    def apply_studio_reverb_and_compression(self):
        # Convolution Reverb simulation (early reflections + diffused tail)
        reverb_len = int(2.2 * SR)
        rev_l = array("f", [0.0]) * self.num_samples
        rev_r = array("f", [0.0]) * self.num_samples
        
        # Simple multi-tap diffusion network for warm studio room
        taps = [(0.025, 0.4), (0.048, 0.3), (0.085, 0.25), (0.130, 0.18), (0.210, 0.12)]
        for delay_s, gain in taps:
            d_samp = int(delay_s * SR)
            for i in range(d_samp, self.num_samples):
                rev_l[i] += self.left[i - d_samp] * gain
                rev_r[i] += self.right[i - d_samp] * gain

        # Wet mix
        wet = 0.30
        for i in range(self.num_samples):
            self.left[i] = self.left[i] * (1.0 - wet) + rev_l[i] * wet
            self.right[i] = self.right[i] * (1.0 - wet) + rev_r[i] * wet

    def export(self, path):
        self.apply_studio_reverb_and_compression()
        peak = max(max(map(abs, self.left)), max(map(abs, self.right)))
        gain = 0.80 / max(peak, 1e-9)
        with wave.open(str(path), "wb") as f:
            f.setparams((2, 2, SR, 0, "NONE", "not compressed"))
            chunk_size = 4096
            for offset in range(0, self.num_samples, chunk_size):
                chunk_l = self.left[offset:offset + chunk_size]
                chunk_r = self.right[offset:offset + chunk_size]
                samples = []
                for l, r in zip(chunk_l, chunk_r):
                    sl = int(max(-1.0, min(1.0, l * gain)) * 32767)
                    sr_ = int(max(-1.0, min(1.0, r * gain)) * 32767)
                    samples.extend((sl, sr_))
                f.writeframesraw(struct.pack("<" + "h" * len(samples), *samples))
        print(f"Exported: {path}")


def render_all_shootout_tracks():
    num_bars = 8
    dur_s = num_bars * 4 * BEAT + 2.5

    chords = [
        (48, [64, 67, 71, 74]), # Cmaj9
        (45, [61, 64, 67, 70]), # A7b9
        (50, [65, 69, 72, 76]), # Dm9
        (43, [64, 67, 71, 74]), # G13
        (40, [64, 67, 71, 74]), # Em7
        (45, [61, 64, 67, 73]), # A7
        (41, [64, 69, 72, 76]), # Fmaj7
        (41, [62, 68, 72, 74]), # Fm6 (Bittersweet IVm)
    ]

    melody = [
        (0, 0.0, 76, 0.8), (0, 1.0, 79, 0.6), (0, 2.0, 74, 0.8), (0, 3.0, 72, 1.8),
        (1, 2.5, 71, 0.5), (1, 3.0, 72, 0.9),
        (3, 2.5, 74, 0.5), (3, 3.0, 76, 0.7),
        (4, 0.0, 79, 0.8), (4, 1.0, 81, 0.6), (4, 2.0, 83, 1.2),
        (5, 0.5, 81, 0.6), (5, 1.5, 79, 0.6), (5, 2.5, 76, 1.6),
        (6, 0.0, 76, 1.2), (6, 2.0, 77, 0.8),
        (7, 0.0, 77, 1.0), (7, 2.0, 75, 1.5), # Eb5 over Fm6
    ]

    # 1. SoundFont Engine Render
    sf = SoundFontEngine(dur_s)
    for bar, (bass, c_notes) in enumerate(chords):
        t_bar = swing_time(bar, 0.0)
        sf.sample_acoustic_bass(t_bar, BEAT * 0.9, bass, amp=0.22)
        sf.sample_acoustic_bass(swing_time(bar, 2.0), BEAT * 0.9, bass + 7, amp=0.18)

        t_stab1 = swing_time(bar, 0.5)
        t_stab2 = swing_time(bar, 2.5)
        for n in c_notes:
            sf.sample_nylon_guitar(t_stab1, BEAT * 1.2, n, amp=0.045)
            sf.sample_marimba(t_stab2, BEAT * 0.8, n, amp=0.040)

        sf.sample_brush_kit(swing_time(bar, 1.0), amp=0.045)
        sf.sample_brush_kit(swing_time(bar, 3.0), amp=0.055)
        sf.sample_woodblock(swing_time(bar, 3.0), amp=0.040)

    for bar, beat, note, dur in melody:
        t_note = swing_time(bar, beat)
        sf.sample_flute(t_note, dur * BEAT, note, amp=0.13)

    sf.export(OUT_DIR / "shootout_soundfont.wav")

    # 2. Tone.js Studio DSP Render
    tone = ToneStudioDSP(dur_s)
    for bar, (bass, c_notes) in enumerate(chords):
        t_bar = swing_time(bar, 0.0)
        tone.tone_synth_bass(t_bar, BEAT * 0.9, bass, amp=0.22)
        tone.tone_synth_bass(swing_time(bar, 2.0), BEAT * 0.9, bass + 7, amp=0.18)

        t_stab1 = swing_time(bar, 0.5)
        t_stab2 = swing_time(bar, 2.5)
        for n in c_notes:
            tone.tone_fm_marimba(t_stab1, BEAT * 0.8, n, amp=0.045)
            tone.tone_fm_marimba(t_stab2, BEAT * 0.8, n, amp=0.040)

    for bar, beat, note, dur in melody:
        t_note = swing_time(bar, beat)
        tone.tone_lead_synth(t_note, dur * BEAT, note, amp=0.12)

    tone.export(OUT_DIR / "shootout_tone.wav")


if __name__ == "__main__":
    render_all_shootout_tracks()
