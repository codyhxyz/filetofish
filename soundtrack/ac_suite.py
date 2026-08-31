#!/usr/bin/env python3
"""Animal Crossing style OST Suite for FiletoFish (All 6 Times of Day).

Renders the complete 6-track suite of time-of-day dock music:
  1. dawn        (05:00-08:00) - 3/4 Gentle Waltz, D Maj, 78 BPM (Kalimba, Pizz Nylon, Soft Flute)
  2. morning     (08:00-11:00) - 4/4 Brisk Shuffle, G Maj, 98 BPM (Marimba, Upright Slap, Melodica)
  3. day         (11:00-17:00) - 4/4 Swung Bossa, C Maj, 92 BPM (FM Marimba, Walking Bass, Whistle Lead)
  4. sunset      (17:00-20:00) - 4/4 Laid-back Bossa, F Maj, 76 BPM (Warm Rhodes, Muted Vibe, Soft Nylon)
  5. night       (20:00-00:00) - 4/4 Lounge, E Maj, 66 BPM (Vibraphone, Glockenspiel, Deep Bass)
  6. late-night  (00:00-05:00) - 4/4 Ambient Satie, B Min, 56 BPM (Glass Chimes, Music Box, Clock Tick)
"""

import argparse
import math
import random
import struct
import subprocess
import wave
from array import array
from pathlib import Path

SR = 44_100
OUT_DIR = Path(__file__).parent / "previews"
OUT_DIR.mkdir(exist_ok=True)


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def apply_swing(beat_in_bar, swing=0.60, meter=4):
    """Calculate swung timestamp within a bar."""
    if meter == 3:
        # Straight lilt for waltz
        return beat_in_bar
    total_beats = int(beat_in_bar)
    frac = beat_in_bar - total_beats
    if frac == 0.0:
        offset = 0.0
    elif abs(frac - 0.5) < 0.05:
        offset = swing
    elif abs(frac - 0.25) < 0.05:
        offset = 0.25 * swing / 0.5
    elif abs(frac - 0.75) < 0.05:
        offset = swing + 0.25 * (1.0 - swing) / 0.5
    else:
        offset = frac
    return total_beats + offset


class Synthesizer:
    def __init__(self, duration, seed=42):
        self.num_samples = int(duration * SR)
        self.left = array("f", [0.0]) * self.num_samples
        self.right = array("f", [0.0]) * self.num_samples
        self.rng = random.Random(seed)
        self.duration = duration

    def mix(self, pos, val, pan=0.0):
        idx = int(pos)
        if 0 <= idx < self.num_samples:
            l_gain = math.cos((pan + 1.0) * math.pi / 4.0)
            r_gain = math.sin((pan + 1.0) * math.pi / 4.0)
            self.left[idx] += val * l_gain
            self.right[idx] += val * r_gain

    def play_upright_bass(self, t_start, dur_s, midi_note, amp=0.18, pan=-0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.5, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            pitch = f0 * (1.0 + 0.02 * math.exp(-t * 35))
            phase = 2 * math.pi * pitch * t
            env_f = math.exp(-t * 2.2) * min(1.0, t * 120)
            env_h2 = math.exp(-t * 4.5) * min(1.0, t * 150)
            env_h3 = math.exp(-t * 7.5) * min(1.0, t * 200)
            sample = (
                math.sin(phase) * env_f * 0.85
                + math.sin(2 * phase) * env_h2 * 0.35
                + math.sin(3 * phase) * env_h3 * 0.12
            )
            if t < 0.03:
                sample += (self.rng.random() * 2 - 1) * math.exp(-t * 120) * 0.15
            self.mix(start_samp + i, sample * amp, pan)

    def play_sub_bass(self, t_start, dur_s, midi_note, amp=0.20, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 2.0, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            phase = 2 * math.pi * f0 * t
            env = min(1.0, t * 30) * math.exp(-t * 1.2)
            sample = math.sin(phase) + 0.15 * math.sin(2 * phase)
            self.mix(start_samp + i, sample * env * amp, pan)

    def play_fm_marimba(self, t_start, dur_s, midi_note, amp=0.14, pan=0.25):
        fc = midi_hz(midi_note)
        fm = fc * 3.84
        n_samp = int(min(dur_s * 1.8, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env_amp = (1.0 - math.exp(-t * 250)) * math.exp(-t * 6.2)
            env_mod = math.exp(-t * 28.0) * 2.8
            mod = math.sin(2 * math.pi * fm * t) * env_mod
            carrier = math.sin(2 * math.pi * fc * t + mod)
            body = math.sin(4 * math.pi * fc * t) * 0.25 * math.exp(-t * 8.0)
            sample = (carrier + body) * env_amp
            self.mix(start_samp + i, sample * amp, pan)

    def play_kalimba(self, t_start, dur_s, midi_note, amp=0.12, pan=0.3):
        fc = midi_hz(midi_note)
        fm = fc * 5.42
        n_samp = int(min(dur_s * 2.2, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env_amp = (1.0 - math.exp(-t * 300)) * math.exp(-t * 4.0)
            env_mod = math.exp(-t * 35.0) * 1.8
            mod = math.sin(2 * math.pi * fm * t) * env_mod
            sample = math.sin(2 * math.pi * fc * t + mod) * env_amp
            self.mix(start_samp + i, sample * amp, pan)

    def play_rhodes(self, t_start, dur_s, midi_note, amp=0.07, pan=-0.25):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 2.0, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env = min(1.0, t * 80) * math.exp(-t * 1.8)
            tremolo = 1.0 + 0.15 * math.sin(2 * math.pi * 4.8 * t)
            phase = 2 * math.pi * fc * t
            mod = 0.6 * math.exp(-t * 3.5) * math.sin(phase)
            sample = (math.sin(phase + mod) + 0.22 * math.sin(2 * phase)) * env * tremolo
            self.mix(start_samp + i, sample * amp, pan)

    def play_vibraphone(self, t_start, dur_s, midi_note, amp=0.10, pan=0.1):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 2.5, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env = (1.0 - math.exp(-t * 150)) * math.exp(-t * 1.6)
            tremolo = 1.0 + 0.22 * math.sin(2 * math.pi * 5.0 * t)
            phase = 2 * math.pi * fc * t
            sample = (
                math.sin(phase)
                + 0.18 * math.sin(3.0 * phase) * math.exp(-t * 2.5)
                + 0.08 * math.sin(5.0 * phase) * math.exp(-t * 4.0)
            ) * env * tremolo
            self.mix(start_samp + i, sample * amp, pan)

    def play_glass(self, t_start, dur_s, midi_note, amp=0.08, pan=-0.2):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 3.0, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env = (1.0 - math.exp(-t * 100)) * math.exp(-t * 1.2)
            phase = 2 * math.pi * fc * t
            sample = (
                math.sin(phase)
                + 0.25 * math.sin(3.01 * phase)
                + 0.10 * math.sin(5.04 * phase)
            ) * env
            self.mix(start_samp + i, sample * amp, pan)

    def play_nylon_pluck(self, t_start, dur_s, midi_note, amp=0.10, pan=-0.2):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.6, self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            env = (1.0 - math.exp(-t * 200)) * math.exp(-t * 4.5)
            phase = 2 * math.pi * fc * t
            sample = (
                math.sin(phase)
                + 0.4 * math.sin(2 * phase) * math.exp(-t * 6.0)
                + 0.2 * math.sin(3 * phase) * math.exp(-t * 10.0)
            ) * env
            self.mix(start_samp + i, sample * amp, pan)

    def play_whistle_lead(self, t_start, dur_s, midi_note, amp=0.10, pan=0.05):
        f0 = midi_hz(midi_note)
        n_samp = int(min((dur_s + 0.12), self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib_onset = min(1.0, max(0.0, (t - 0.15) * 5.0))
            vibrato = 0.006 * vib_onset * math.sin(2 * math.pi * 5.4 * t)
            phase = 2 * math.pi * f0 * (1.0 + vibrato) * t
            attack = min(1.0, t / 0.045)
            rel_t = max(0.0, t - dur_s)
            release = math.exp(-rel_t * 22.0)
            env = attack * release
            sample = (
                math.sin(phase) * 0.80
                + math.sin(2 * phase) * 0.25
                + math.sin(3 * phase) * 0.12
                + math.sin(4 * phase) * 0.05
            )
            breath = (self.rng.random() * 2 - 1) * 0.035 * env
            self.mix(start_samp + i, (sample * env + breath) * amp, pan)

    def play_flute_lead(self, t_start, dur_s, midi_note, amp=0.09, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min((dur_s + 0.15), self.duration - t_start) * SR)
        start_samp = int(t_start * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib_onset = min(1.0, max(0.0, (t - 0.18) * 4.0))
            vibrato = 0.005 * vib_onset * math.sin(2 * math.pi * 4.8 * t)
            phase = 2 * math.pi * f0 * (1.0 + vibrato) * t
            attack = min(1.0, t / 0.07)
            rel_t = max(0.0, t - dur_s)
            release = math.exp(-rel_t * 18.0)
            env = attack * release
            sample = (math.sin(phase) + 0.15 * math.sin(2 * phase)) * env
            air = (self.rng.random() * 2 - 1) * 0.04 * env
            self.mix(start_samp + i, (sample + air) * amp, pan)

    def play_brush_snare(self, t_start, amp=0.045, pan=0.15):
        n_samp = int(0.18 * SR)
        start_samp = int(t_start * SR)
        lp = 0.0
        for i in range(min(n_samp, self.num_samples - start_samp)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            lp += 0.25 * (raw - lp)
            hp = raw - lp
            env = (1.0 - t / 0.18) ** 2.2 * min(1.0, t * 150)
            self.mix(start_samp + i, hp * env * amp, pan)

    def play_woodblock(self, t_start, amp=0.05, pan=-0.2):
        n_samp = int(0.06 * SR)
        start_samp = int(t_start * SR)
        for i in range(min(n_samp, self.num_samples - start_samp)):
            t = i / SR
            freq = 950 * math.exp(-t * 22)
            phase = 2 * math.pi * freq * t
            env = math.exp(-t * 65)
            self.mix(start_samp + i, math.sin(phase) * env * amp, pan)

    def play_shaker(self, t_start, amp=0.02, pan=-0.35):
        n_samp = int(0.08 * SR)
        start_samp = int(t_start * SR)
        for i in range(min(n_samp, self.num_samples - start_samp)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            env = (1.0 - t / 0.08) ** 1.8 * min(1.0, t * 250)
            self.mix(start_samp + i, raw * env * amp, pan)

    def play_clock_tick(self, t_start, amp=0.03, pan=0.2):
        n_samp = int(0.02 * SR)
        start_samp = int(t_start * SR)
        for i in range(min(n_samp, self.num_samples - start_samp)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            env = math.exp(-t * 250)
            self.mix(start_samp + i, raw * env * amp, pan)

    def add_ocean_swell(self, swell_period=8.0, strength=0.003):
        lp = 0.0
        for i in range(self.num_samples):
            raw = self.rng.random() * 2 - 1
            lp += 0.005 * (raw - lp)
            t = i / SR
            swell = 0.5 + 0.5 * math.sin(2 * math.pi * t / swell_period)
            amb = lp * strength * swell
            self.left[i] += amb
            self.right[i] += amb * 0.9

    def export_wav(self, path):
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
        return path


# ==============================================================================
# TRACK DEFINITIONS
# ==============================================================================

def render_dawn():
    """Dawn: 05:00-08:00, 3/4 Gentle Waltz, D Maj, 78 BPM."""
    bpm = 78
    beat_dur = 60.0 / bpm
    num_bars = 16
    dur = num_bars * 3 * beat_dur + 2.5
    synth = Synthesizer(dur, seed=101)

    # Chords (3/4 time): root, chord_notes
    # Dmaj7 -> Bm7 -> Em9 -> A7sus4 -> F#m7 -> B7b9 -> Em7 / Gm6 -> Dmaj9
    chords = [
        (50, [62, 66, 69, 73]), # Dmaj7
        (50, [62, 66, 69, 73]),
        (47, [59, 62, 66, 69]), # Bm7
        (47, [59, 62, 66, 69]),
        (40, [64, 67, 71, 74]), # Em9
        (40, [64, 67, 71, 74]),
        (45, [62, 64, 67, 69]), # A7sus4 -> A7
        (45, [61, 64, 67, 69]),
        (42, [61, 66, 69, 73]), # F#m7
        (47, [59, 63, 66, 69]), # B7
        (40, [64, 67, 71, 74]), # Em7
        (43, [62, 67, 70, 74]), # Gm6 (nostalgic dawn minor 4th)
        (50, [62, 66, 69, 73]), # Dmaj7
        (40, [64, 67, 71, 74]), # Em7
        (50, [62, 66, 69, 73]), # Dmaj7
        (45, [61, 64, 67, 69]), # A7
    ]

    for bar, (bass, chord_notes) in enumerate(chords):
        t0 = bar * 3 * beat_dur
        t1 = (bar * 3 + 1) * beat_dur
        t2 = (bar * 3 + 2) * beat_dur

        # Bass on beat 1
        synth.play_upright_bass(t0, beat_dur * 1.5, bass, amp=0.18)
        # Nylon / Kalimba on beats 2 & 3
        for n in chord_notes:
            synth.play_nylon_pluck(t1, beat_dur * 0.9, n, amp=0.035, pan=-0.2)
            synth.play_kalimba(t2, beat_dur * 0.9, n, amp=0.030, pan=0.25)
        # Soft shaker / brush on 2 & 3
        synth.play_brush_snare(t1, amp=0.02)
        synth.play_brush_snare(t2, amp=0.025)

    # Flute melody (motif: D5 - F#5 - E5 - B4)
    melody = [
        (0, 0.0, 74, 1.8), (0, 2.0, 78, 1.0), (1, 0.0, 76, 2.0), (1, 2.0, 71, 1.5),
        # Space in bars 2-3
        (3, 1.0, 74, 1.0), (3, 2.0, 76, 1.0),
        (4, 0.0, 78, 1.8), (4, 2.0, 81, 1.0), (5, 0.0, 78, 2.0), (5, 2.0, 74, 1.5),
        # Bittersweet shift in bar 10-11
        (8, 0.0, 78, 1.5), (9, 0.0, 79, 1.5), (10, 0.0, 76, 1.5), (11, 0.0, 75, 1.8), # Eb5 over Gm6
        (12, 0.0, 74, 2.2), # D5 home
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 3 + beat) * beat_dur
        synth.play_flute_lead(t, dur_b * beat_dur, note, amp=0.09, pan=0.0)

    synth.add_ocean_swell(swell_period=9.0, strength=0.003)
    out_path = OUT_DIR / "ac_dawn.wav"
    synth.export_wav(out_path)
    print(f"ac_dawn.wav       ({dur:.1f}s, 78 BPM Waltz)")
    return out_path


def render_morning():
    """Morning: 08:00-11:00, 4/4 Brisk Shuffle, G Maj, 98 BPM."""
    bpm = 98
    beat_dur = 60.0 / bpm
    swing = 0.64
    num_bars = 16
    dur = num_bars * 4 * beat_dur + 2.5
    synth = Synthesizer(dur, seed=102)

    chords = [
        (43, [59, 62, 66, 69], [43, 47, 50, 52]),       # Gmaj9
        (40, [58, 62, 65, 68], [40, 44, 47, 50]),       # E7b9
        (45, [60, 64, 67, 71], [45, 48, 52, 55]),       # Am9
        (38, [59, 62, 65, 69], [38, 42, 45, 48]),       # D13
        (47, [59, 62, 66, 69], [47, 50, 54, 57]),       # Bm7
        (40, [58, 62, 65, 71], [40, 44, 47, 50]),       # E7
        (45, [60, 64, 67, 72], [45, 48, 51, 52]),       # Am7 -> A#dim
        (38, [60, 62, 67, 69], [38, 45, 38, 42]),       # D7sus4
        (48, [59, 64, 67, 71], [48, 52, 55, 59]),       # Cmaj7
        (48, [57, 63, 67, 69], [48, 51, 55, 58]),       # Cm6 (nostalgic IVm)
        (47, [59, 62, 66, 69], [47, 50, 54, 57]),       # Bm7
        (40, [55, 62, 64, 67], [40, 43, 47, 50]),       # Em7
        (45, [60, 64, 67, 71], [45, 48, 52, 55]),       # Am9
        (38, [59, 62, 65, 69], [38, 42, 45, 48]),       # D13
        (43, [59, 62, 66, 69], [43, 47, 50, 52]),       # Gmaj9
        (38, [57, 60, 66, 69], [38, 42, 45, 48]),       # D7 turnaround
    ]

    for bar, (_, chord_notes, bass_notes) in enumerate(chords):
        t0 = (bar * 4 + apply_swing(0.0, swing)) * beat_dur
        t1 = (bar * 4 + apply_swing(1.0, swing)) * beat_dur
        t2 = (bar * 4 + apply_swing(2.0, swing)) * beat_dur
        t3 = (bar * 4 + apply_swing(3.0, swing)) * beat_dur

        # Upright slap bass
        synth.play_upright_bass(t0, beat_dur * 0.9, bass_notes[0], amp=0.20)
        synth.play_upright_bass(t1, beat_dur * 0.8, bass_notes[1], amp=0.14)
        synth.play_upright_bass(t2, beat_dur * 0.9, bass_notes[2], amp=0.18)
        synth.play_upright_bass(t3, beat_dur * 0.8, bass_notes[3], amp=0.14)

        # Snappy marimba chords on offbeats
        t_off1 = (bar * 4 + apply_swing(0.5, swing)) * beat_dur
        t_off2 = (bar * 4 + apply_swing(2.5, swing)) * beat_dur
        for n in chord_notes:
            synth.play_fm_marimba(t_off1, beat_dur * 0.5, n, amp=0.045, pan=-0.2)
            synth.play_fm_marimba(t_off2, beat_dur * 0.5, n, amp=0.040, pan=0.2)

        # Percussion: Brush snare on 2 & 4, woodblock on 4, shakers on 8ths
        synth.play_brush_snare(t1, amp=0.05)
        synth.play_brush_snare(t3, amp=0.06)
        synth.play_woodblock(t3, amp=0.045)
        for b in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
            t_shk = (bar * 4 + apply_swing(b, swing)) * beat_dur
            synth.play_shaker(t_shk, amp=0.02)

    # Melodica/Whistle Lead (Brisk, cheerful, swung)
    melody = [
        (0, 0.0, 71, 0.8), (0, 1.0, 74, 0.6), (0, 2.0, 69, 0.8), (0, 3.0, 67, 1.8),
        (1, 2.5, 66, 0.5), (1, 3.0, 67, 0.9),
        (3, 2.5, 69, 0.5), (3, 3.0, 71, 0.7),
        (4, 0.0, 74, 0.8), (4, 1.0, 76, 0.6), (4, 2.0, 78, 1.2),
        (5, 0.5, 76, 0.6), (5, 1.5, 74, 0.6), (5, 2.5, 71, 1.6),
        (7, 2.5, 67, 0.5), (7, 3.0, 69, 0.7),
        (8, 0.0, 71, 1.2), (8, 2.0, 72, 0.8), (8, 3.0, 74, 1.4),
        (9, 1.0, 72, 1.0), (9, 2.5, 70, 1.5), # Bb4 over Cm6
        (10, 1.0, 69, 0.8), (10, 2.0, 67, 1.8),
        (12, 0.5, 67, 0.6), (12, 1.5, 69, 0.6), (12, 2.5, 71, 1.2),
        (13, 1.0, 74, 0.7), (13, 2.0, 72, 0.6), (13, 3.0, 69, 1.0),
        (14, 0.5, 67, 2.2), # G4 home
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 4 + apply_swing(beat, swing)) * beat_dur
        synth.play_whistle_lead(t, dur_b * beat_dur, note, amp=0.10, pan=0.08)

    synth.add_ocean_swell(swell_period=7.5, strength=0.0025)
    out_path = OUT_DIR / "ac_morning.wav"
    synth.export_wav(out_path)
    print(f"ac_morning.wav    ({dur:.1f}s, 98 BPM Shuffle)")
    return out_path


def render_day():
    """Day: 11:00-17:00, 4/4 Swung Bossa, C Maj, 92 BPM (The Dock MVP)."""
    bpm = 92
    beat_dur = 60.0 / bpm
    swing = 0.62
    num_bars = 16
    dur = num_bars * 4 * beat_dur + 2.5
    synth = Synthesizer(dur, seed=103)

    chords = [
        (48, [64, 67, 71, 74], [48, 52, 55, 59]),       # Cmaj9
        (45, [61, 64, 67, 70], [45, 49, 52, 55]),       # A7b9
        (50, [65, 69, 72, 76], [50, 53, 57, 53]),       # Dm9
        (43, [64, 67, 71, 74], [43, 47, 50, 47]),       # G13
        (40, [64, 67, 71, 74], [40, 43, 47, 50]),       # Em7
        (45, [61, 64, 67, 73], [45, 49, 52, 55]),       # A7
        (50, [65, 69, 72, 77], [50, 53, 56, 57]),       # Dm7 -> D#dim
        (43, [65, 67, 71, 74], [43, 50, 43, 47]),       # G7sus4
        (41, [64, 69, 72, 76], [41, 45, 48, 52]),       # Fmaj7
        (41, [62, 68, 72, 74], [41, 44, 48, 51]),       # Fm6 (IVm)
        (40, [64, 67, 71, 74], [40, 43, 47, 50]),       # Em7
        (45, [60, 67, 69, 72], [45, 48, 52, 55]),       # Am7
        (50, [65, 69, 72, 76], [50, 53, 57, 53]),       # Dm9
        (43, [64, 67, 71, 74], [43, 47, 50, 53]),       # G13
        (48, [64, 67, 71, 74], [48, 52, 55, 59]),       # Cmaj9
        (43, [62, 65, 71, 74], [43, 47, 50, 53]),       # G7 turnaround
    ]

    for bar, (_, chord_notes, bass_notes) in enumerate(chords):
        t0 = (bar * 4 + apply_swing(0.0, swing)) * beat_dur
        t1 = (bar * 4 + apply_swing(1.0, swing)) * beat_dur
        t2 = (bar * 4 + apply_swing(2.0, swing)) * beat_dur
        t3 = (bar * 4 + apply_swing(3.0, swing)) * beat_dur

        synth.play_upright_bass(t0, beat_dur * 0.9, bass_notes[0], amp=0.20)
        synth.play_upright_bass(t1, beat_dur * 0.8, bass_notes[1], amp=0.14)
        synth.play_upright_bass(t2, beat_dur * 0.9, bass_notes[2], amp=0.18)
        synth.play_upright_bass(t3, beat_dur * 0.8, bass_notes[3], amp=0.14)

        t_stab1 = (bar * 4 + apply_swing(0.5, swing)) * beat_dur
        t_stab2 = (bar * 4 + apply_swing(2.5, swing)) * beat_dur
        for n in chord_notes:
            synth.play_rhodes(t_stab1, beat_dur * 1.2, n, amp=0.045)
            synth.play_rhodes(t_stab2, beat_dur * 1.4, n, amp=0.040)

        if bar % 2 == 1:
            t_m1 = (bar * 4 + apply_swing(1.5, swing)) * beat_dur
            t_m2 = (bar * 4 + apply_swing(3.5, swing)) * beat_dur
            synth.play_fm_marimba(t_m1, beat_dur * 0.4, chord_notes[-1], amp=0.08, pan=0.3)
            synth.play_fm_marimba(t_m2, beat_dur * 0.4, chord_notes[-2], amp=0.06, pan=0.2)

        synth.play_brush_snare(t1, amp=0.045)
        synth.play_brush_snare(t3, amp=0.055)
        synth.play_woodblock(t3, amp=0.04)
        for b in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
            synth.play_shaker((bar * 4 + apply_swing(b, swing)) * beat_dur, amp=0.018 if b % 1.0 != 0 else 0.012)

    melody = [
        (0, 0.0, 76, 0.8), (0, 1.0, 79, 0.6), (0, 2.0, 74, 0.8), (0, 3.0, 72, 1.8),
        (1, 2.5, 71, 0.5), (1, 3.0, 72, 0.9),
        (3, 2.5, 74, 0.5), (3, 3.0, 76, 0.7),
        (4, 0.0, 79, 0.8), (4, 1.0, 81, 0.6), (4, 2.0, 83, 1.2),
        (5, 0.5, 81, 0.6), (5, 1.5, 79, 0.6), (5, 2.5, 76, 1.6),
        (7, 2.5, 72, 0.5), (7, 3.0, 74, 0.7),
        (8, 0.0, 76, 1.2), (8, 2.0, 77, 0.8), (8, 3.0, 79, 1.4),
        (9, 1.0, 77, 1.0), (9, 2.5, 75, 1.5), # Eb5 over Fm6
        (10, 1.0, 74, 0.8), (10, 2.0, 72, 1.8),
        (11, 2.0, 69, 1.2),
        (12, 0.5, 72, 0.6), (12, 1.5, 74, 0.6), (12, 2.5, 76, 1.2),
        (13, 1.0, 79, 0.7), (13, 2.0, 77, 0.6), (13, 3.0, 74, 1.0),
        (14, 0.5, 72, 2.2),
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 4 + apply_swing(beat, swing)) * beat_dur
        synth.play_whistle_lead(t, dur_b * beat_dur, note, amp=0.09, pan=0.08)

    synth.add_ocean_swell(swell_period=8.5, strength=0.003)
    out_path = OUT_DIR / "ac_day.wav"
    synth.export_wav(out_path)
    print(f"ac_day.wav        ({dur:.1f}s, 92 BPM Bossa)")
    return out_path


def render_sunset():
    """Sunset: 17:00-20:00, 4/4 Laid-back Bossa, F Maj, 76 BPM."""
    bpm = 76
    beat_dur = 60.0 / bpm
    swing = 0.58
    num_bars = 16
    dur = num_bars * 4 * beat_dur + 2.5
    synth = Synthesizer(dur, seed=104)

    chords = [
        (41, [57, 60, 64, 67], [41, 45, 48, 52]),       # Fmaj9
        (38, [56, 60, 63, 66], [38, 42, 45, 48]),       # D7b9
        (43, [58, 62, 65, 69], [43, 46, 50, 53]),       # Gm9
        (36, [57, 60, 63, 67], [36, 40, 43, 46]),       # C13
        (45, [57, 60, 64, 67], [45, 48, 52, 55]),       # Am7
        (38, [56, 60, 63, 69], [38, 42, 45, 48]),       # D7
        (43, [58, 62, 65, 70], [43, 46, 49, 50]),       # Gm7 -> G#dim
        (36, [58, 60, 65, 67], [36, 43, 36, 40]),       # C7sus4
        (46, [57, 62, 65, 69], [46, 50, 53, 57]),       # Bbmaj7
        (46, [55, 61, 65, 67], [46, 49, 53, 56]),       # Bbm6 (lush sunset IVm)
        (45, [57, 60, 64, 67], [45, 48, 52, 55]),       # Am7
        (38, [53, 60, 62, 65], [38, 41, 45, 48]),       # Dm7
        (43, [58, 62, 65, 69], [43, 46, 50, 53]),       # Gm9
        (36, [57, 60, 63, 67], [36, 40, 43, 46]),       # C13
        (41, [57, 60, 64, 67], [41, 45, 48, 52]),       # Fmaj9
        (36, [55, 58, 64, 67], [36, 40, 43, 46]),       # C7 turnaround
    ]

    for bar, (_, chord_notes, bass_notes) in enumerate(chords):
        t0 = (bar * 4 + apply_swing(0.0, swing)) * beat_dur
        t1 = (bar * 4 + apply_swing(1.0, swing)) * beat_dur
        t2 = (bar * 4 + apply_swing(2.0, swing)) * beat_dur
        t3 = (bar * 4 + apply_swing(3.0, swing)) * beat_dur

        # Smooth acoustic bass
        synth.play_upright_bass(t0, beat_dur * 1.2, bass_notes[0], amp=0.17)
        synth.play_upright_bass(t2, beat_dur * 1.1, bass_notes[2], amp=0.15)

        # Warm Rhodes & Nylon chords on bossa syncopations (0, 1.5, 2.5, 3.5)
        t_b1 = (bar * 4 + apply_swing(0.0, swing)) * beat_dur
        t_b2 = (bar * 4 + apply_swing(1.5, swing)) * beat_dur
        t_b3 = (bar * 4 + apply_swing(3.0, swing)) * beat_dur
        for n in chord_notes:
            synth.play_rhodes(t_b1, beat_dur * 1.2, n, amp=0.040, pan=-0.2)
            synth.play_rhodes(t_b2, beat_dur * 1.2, n, amp=0.035, pan=-0.2)
            synth.play_nylon_pluck(t_b3, beat_dur * 0.9, n, amp=0.025, pan=0.25)

        # Soft brush on 2 & 4
        synth.play_brush_snare(t1, amp=0.035)
        synth.play_brush_snare(t3, amp=0.040)
        synth.play_shaker(t0, amp=0.015)
        synth.play_shaker(t2, amp=0.015)

    # Vibraphone Lead (Mellow, sustained, warm tremolo)
    melody = [
        (0, 0.0, 69, 1.8), (0, 2.0, 72, 1.0), (1, 0.0, 67, 2.0), (1, 2.0, 65, 1.5),
        # Space
        (3, 2.0, 67, 1.0), (3, 3.0, 69, 1.0),
        (4, 0.0, 72, 1.8), (4, 2.0, 76, 1.2), (5, 0.5, 74, 1.5), (5, 2.5, 69, 1.8),
        # Nostalgic Bbm6 bar
        (8, 0.0, 69, 1.5), (8, 2.0, 70, 1.0), (9, 0.0, 70, 1.5), (9, 2.0, 68, 1.8), # Db5 over Bbm6
        (10, 1.0, 67, 1.0), (10, 2.0, 65, 1.8),
        (12, 0.5, 65, 0.8), (12, 2.0, 69, 1.2), (13, 1.0, 67, 1.5),
        (14, 0.0, 65, 2.5), # F4 home
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 4 + apply_swing(beat, swing)) * beat_dur
        synth.play_vibraphone(t, dur_b * beat_dur, note, amp=0.10, pan=0.05)

    synth.add_ocean_swell(swell_period=9.5, strength=0.0035)
    out_path = OUT_DIR / "ac_sunset.wav"
    synth.export_wav(out_path)
    print(f"ac_sunset.wav     ({dur:.1f}s, 76 BPM Bossa)")
    return out_path


def render_night():
    """Night: 20:00-00:00, 4/4 Lounge, E Maj, 66 BPM."""
    bpm = 66
    beat_dur = 60.0 / bpm
    swing = 0.56
    num_bars = 16
    dur = num_bars * 4 * beat_dur + 2.5
    synth = Synthesizer(dur, seed=105)

    chords = [
        (40, [59, 63, 66, 71], [40, 47, 40, 47]),       # Emaj9
        (45, [58, 62, 65, 70], [45, 52, 45, 52]),       # C#m9
        (42, [57, 61, 64, 69], [42, 49, 42, 49]),       # F#m9
        (35, [59, 62, 65, 69], [35, 42, 35, 42]),       # B13
        (44, [59, 63, 66, 71], [44, 51, 44, 51]),       # G#m7
        (45, [58, 62, 65, 71], [45, 52, 45, 52]),       # C#7
        (42, [57, 61, 64, 71], [42, 49, 42, 49]),       # F#m7
        (35, [57, 59, 64, 66], [35, 42, 35, 42]),       # B7sus4
        (45, [56, 61, 64, 68], [45, 49, 52, 56]),       # Amaj7
        (45, [54, 60, 64, 66], [45, 48, 52, 55]),       # Am6 (sweet night IVm)
        (44, [59, 63, 66, 71], [44, 51, 44, 51]),       # G#m7
        (45, [58, 62, 65, 70], [45, 52, 45, 52]),       # C#m7
        (42, [57, 61, 64, 69], [42, 49, 42, 49]),       # F#m9
        (35, [59, 62, 65, 69], [35, 42, 35, 42]),       # B13
        (40, [59, 63, 66, 71], [40, 47, 40, 47]),       # Emaj9
        (35, [57, 59, 65, 68], [35, 42, 35, 42]),       # B7 turnaround
    ]

    for bar, (_, chord_notes, bass_notes) in enumerate(chords):
        t0 = (bar * 4 + apply_swing(0.0, swing)) * beat_dur
        t2 = (bar * 4 + apply_swing(2.0, swing)) * beat_dur
        t1 = (bar * 4 + apply_swing(1.0, swing)) * beat_dur
        t3 = (bar * 4 + apply_swing(3.0, swing)) * beat_dur

        # Deep upright bass
        synth.play_upright_bass(t0, beat_dur * 1.6, bass_notes[0], amp=0.18)
        synth.play_upright_bass(t2, beat_dur * 1.4, bass_notes[1], amp=0.14)

        # Soft Rhodes stabs
        t_st = (bar * 4 + apply_swing(1.5, swing)) * beat_dur
        for n in chord_notes:
            synth.play_rhodes(t_st, beat_dur * 1.8, n, amp=0.035, pan=-0.2)

        # Glockenspiel / Glass accents on alternate bars
        if bar % 2 == 1:
            t_gl = (bar * 4 + apply_swing(3.5, swing)) * beat_dur
            synth.play_glass(t_gl, beat_dur * 1.5, chord_notes[-1], amp=0.04, pan=0.3)

        # Light side-stick & soft brush
        synth.play_brush_snare(t1, amp=0.025)
        synth.play_woodblock(t3, amp=0.035)

    # Vibraphone lead (Sparse, delicate, space between notes)
    melody = [
        (0, 0.0, 75, 1.8), (0, 2.0, 78, 1.2), (1, 0.0, 73, 2.0), (1, 2.5, 71, 1.5),
        # Rest 2 bars
        (3, 2.0, 73, 1.0), (3, 3.0, 75, 1.0),
        (4, 0.0, 78, 2.0), (4, 2.5, 80, 1.2), (5, 1.0, 78, 1.8), (5, 3.0, 75, 1.5),
        # Am6 bar
        (8, 0.0, 75, 1.5), (8, 2.0, 76, 1.2), (9, 0.0, 76, 1.5), (9, 2.0, 72, 2.0), # C5 over Am6
        (10, 1.0, 71, 1.5), (10, 2.5, 68, 1.8),
        (12, 0.5, 71, 1.0), (12, 2.0, 73, 1.2), (13, 1.0, 71, 1.8),
        (14, 0.0, 68, 2.8), # G#4 home
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 4 + apply_swing(beat, swing)) * beat_dur
        synth.play_vibraphone(t, dur_b * beat_dur, note, amp=0.09, pan=0.05)

    synth.add_ocean_swell(swell_period=10.0, strength=0.003)
    out_path = OUT_DIR / "ac_night.wav"
    synth.export_wav(out_path)
    print(f"ac_night.wav      ({dur:.1f}s, 66 BPM Lounge)")
    return out_path


def render_late_night():
    """Late Night: 00:00-05:00, 4/4 Ambient Satie Minimalism, B Min, 56 BPM."""
    bpm = 56
    beat_dur = 60.0 / bpm
    num_bars = 16
    dur = num_bars * 4 * beat_dur + 3.0
    synth = Synthesizer(dur, seed=106)

    # Slow 2-bar changes: Bm9 -> Em9 -> Amaj7 -> Dmaj9 -> Gmaj7 -> F#7alt -> Bm9
    chords = [
        (35, [59, 62, 66, 71]), # Bm9 (Bars 0-1)
        (35, [59, 62, 66, 71]),
        (40, [59, 64, 67, 71]), # Em9 (Bars 2-3)
        (40, [59, 64, 67, 71]),
        (45, [57, 61, 64, 69]), # Amaj7 (Bars 4-5)
        (45, [57, 61, 64, 69]),
        (50, [57, 62, 66, 69]), # Dmaj9 (Bars 6-7)
        (50, [57, 62, 66, 69]),
        (43, [59, 62, 67, 71]), # Gmaj7 (Bars 8-9)
        (43, [59, 62, 67, 71]),
        (42, [58, 61, 64, 68]), # F#7alt (Bars 10-11)
        (42, [58, 61, 64, 68]),
        (35, [59, 62, 66, 71]), # Bm9 (Bars 12-13)
        (35, [59, 62, 66, 71]),
        (35, [59, 62, 66, 71]), # Bm9 (Bars 14-15)
        (42, [58, 61, 66, 69]), # F#7sus4 turnaround
    ]

    for bar, (bass, chord_notes) in enumerate(chords):
        t0 = bar * 4 * beat_dur
        t2 = (bar * 4 + 2) * beat_dur

        # Deep sub bass
        synth.play_sub_bass(t0, beat_dur * 2.2, bass, amp=0.20)
        synth.play_sub_bass(t2, beat_dur * 1.8, bass + 7, amp=0.12)

        # Glass chimes arpeggiating slowly
        for k, n in enumerate(chord_notes):
            t_ch = (bar * 4 + k * 0.75) * beat_dur
            synth.play_glass(t_ch, beat_dur * 2.0, n, amp=0.035, pan=-0.3 + k * 0.2)

        # Clock ticking bed on every second/beat
        for b in range(4):
            synth.play_clock_tick((bar * 4 + b) * beat_dur, amp=0.015)

    # Kalimba / Music Box solo (Very sparse, reflective)
    melody = [
        (0, 0.0, 71, 2.0), (1, 1.0, 74, 2.0), (1, 3.0, 73, 2.0),
        # Space in bars 2-3
        (4, 0.0, 69, 2.5), (5, 1.0, 73, 2.0), (5, 3.0, 71, 2.0),
        # Deep mystery in bars 8-11
        (8, 0.0, 71, 2.0), (9, 1.0, 74, 1.8), (10, 0.0, 72, 2.0), (11, 1.0, 70, 2.5),
        # Return home
        (12, 0.0, 71, 3.5),
    ]
    for bar, beat, note, dur_b in melody:
        t = (bar * 4 + beat) * beat_dur
        synth.play_kalimba(t, dur_b * beat_dur, note, amp=0.10, pan=0.1)

    synth.add_ocean_swell(swell_period=12.0, strength=0.004)
    out_path = OUT_DIR / "ac_late-night.wav"
    synth.export_wav(out_path)
    print(f"ac_late-night.wav ({dur:.1f}s, 56 BPM Ambient)")
    return out_path


def combine_album(paths):
    target = OUT_DIR / "ac_suite_album.wav"
    silence = b"\0" * int(SR * 2 * 2 * 1.5)  # 1.5s silence between tracks
    with wave.open(str(target), "wb") as out:
        out.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        for i, p in enumerate(paths):
            with wave.open(str(p), "rb") as src:
                assert src.getparams()[:3] == (2, 2, SR)
                out.writeframes(src.readframes(src.getnframes()))
            if i + 1 < len(paths):
                out.writeframes(silence)
    print(f"\n=> Combined album exported: {target}")
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tracks", nargs="*", help="Track slugs (dawn, morning, day, sunset, night, late-night)")
    parser.add_argument("--play", action="store_true", help="Play the rendered album")
    args = parser.parse_args()

    track_map = {
        "dawn": render_dawn,
        "morning": render_morning,
        "day": render_day,
        "sunset": render_sunset,
        "night": render_night,
        "late-night": render_late_night,
    }

    wanted = args.tracks if args.tracks else list(track_map.keys())
    for w in wanted:
        if w not in track_map:
            parser.error(f"Unknown track: {w}. Options: {', '.join(track_map.keys())}")

    print(f"Rendering {len(wanted)} Animal Crossing OST track(s)...")
    paths = [track_map[name]() for name in wanted]

    album_path = combine_album(paths) if len(paths) > 1 else paths[0]

    if args.play:
        subprocess.run(["afplay", str(album_path)], check=False)


if __name__ == "__main__":
    main()
