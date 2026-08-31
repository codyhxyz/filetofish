#!/usr/bin/env python3
"""Animal Crossing style OST prototype for FiletoFish (Dock / Daytime MVP).

Key: C Major (Lush jazz/bossa chords: Cmaj9, A7b9, Dm9, G13, Em7, Fm6)
BPM: 92 with swung eighth notes (62/38 swing ratio)
Palette: FM Marimba, Upright Bass, Melodica/Whistle lead, Rhodes comping, Brushed Snare
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
SWING = 0.62  # 62% swing for downbeat 8th, 38% for upbeat 8th

OUT_DIR = Path(__file__).parent / "previews"
OUT_DIR.mkdir(exist_ok=True)
WAV_PATH = OUT_DIR / "dock_mvp.wav"


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def beat_to_sec(bar, beat_in_bar):
    """Convert bar (0-indexed) and beat float (0.0 - 4.0) to seconds with swing."""
    total_beats = bar * 4.0 + int(beat_in_bar)
    frac = beat_in_bar - int(beat_in_bar)
    # Apply swing to subdivisions
    if frac == 0.0:
        offset = 0.0
    elif abs(frac - 0.5) < 0.05:
        offset = SWING
    elif abs(frac - 0.25) < 0.05:
        offset = 0.25 * SWING / 0.5
    elif abs(frac - 0.75) < 0.05:
        offset = SWING + 0.25 * (1 - SWING) / 0.5
    else:
        offset = frac
    return (total_beats + (offset - frac if frac in (0.25, 0.5, 0.75) else frac)) * BEAT


def render_mvp():
    num_bars = 16
    total_duration = num_bars * 4 * BEAT + 2.5
    num_samples = int(total_duration * SR)

    left = array("f", [0.0]) * num_samples
    right = array("f", [0.0]) * num_samples
    rng = random.Random(42)

    def mix(pos, val, pan=0.0):
        idx = int(pos)
        if 0 <= idx < num_samples:
            l_gain = math.cos((pan + 1) * math.pi / 4)
            r_gain = math.sin((pan + 1) * math.pi / 4)
            left[idx] += val * l_gain
            right[idx] += val * r_gain

    # --- SYNTHESIS VOICES ---

    def play_upright_bass(t_start, dur_beats, midi_note, amp=0.18, pan=-0.1):
        f0 = midi_hz(midi_note)
        dur = dur_beats * BEAT
        n_samp = int(min(dur * 1.5, total_duration - t_start) * SR)
        start_samp = int(t_start * SR)

        for i in range(max(0, n_samp)):
            t = i / SR
            # Pitch drop transient
            pitch = f0 * (1.0 + 0.02 * math.exp(-t * 35))
            phase = 2 * math.pi * pitch * t

            # Warm lowpass decay
            env_fund = math.exp(-t * 2.2) * min(1.0, t * 120)
            env_harm2 = math.exp(-t * 4.5) * min(1.0, t * 150)
            env_harm3 = math.exp(-t * 7.5) * min(1.0, t * 200)

            sample = (
                math.sin(phase) * env_fund * 0.85
                + math.sin(2 * phase) * env_harm2 * 0.35
                + math.sin(3 * phase) * env_harm3 * 0.12
            )

            # Pluck finger transient
            if t < 0.03:
                noise = (rng.random() * 2 - 1) * math.exp(-t * 120) * 0.15
                sample += noise

            mix(start_samp + i, sample * amp, pan)

    def play_fm_marimba(t_start, dur_beats, midi_note, amp=0.14, pan=0.25):
        fc = midi_hz(midi_note)
        fm = fc * 3.84  # Woody inharmonic ratio
        dur = dur_beats * BEAT
        n_samp = int(min(dur * 1.8, total_duration - t_start) * SR)
        start_samp = int(t_start * SR)

        for i in range(max(0, n_samp)):
            t = i / SR
            env_amp = (1.0 - math.exp(-t * 250)) * math.exp(-t * 6.2)
            env_mod = math.exp(-t * 28.0) * 2.8

            mod = math.sin(2 * math.pi * fm * t) * env_mod
            carrier = math.sin(2 * math.pi * fc * t + mod)
            body = math.sin(4 * math.pi * fc * t) * 0.25 * math.exp(-t * 8.0)

            sample = (carrier + body) * env_amp
            mix(start_samp + i, sample * amp, pan)

    def play_rhodes(t_start, dur_beats, midi_note, amp=0.07, pan=-0.25):
        fc = midi_hz(midi_note)
        dur = dur_beats * BEAT
        n_samp = int(min(dur * 2.0, total_duration - t_start) * SR)
        start_samp = int(t_start * SR)

        for i in range(max(0, n_samp)):
            t = i / SR
            env = min(1.0, t * 80) * math.exp(-t * 1.8)
            tremolo = 1.0 + 0.15 * math.sin(2 * math.pi * 4.8 * t)

            phase = 2 * math.pi * fc * t
            mod = 0.6 * math.exp(-t * 3.5) * math.sin(phase)
            sample = (math.sin(phase + mod) + 0.22 * math.sin(2 * phase)) * env * tremolo
            mix(start_samp + i, sample * amp, pan)

    def play_whistle_lead(t_start, dur_beats, midi_note, amp=0.11, pan=0.05):
        f0 = midi_hz(midi_note)
        dur = dur_beats * BEAT
        n_samp = int(min((dur + 0.12), total_duration - t_start) * SR)
        start_samp = int(t_start * SR)

        for i in range(max(0, n_samp)):
            t = i / SR
            # Vibrato ramps in after 0.15s
            vib_onset = min(1.0, max(0.0, (t - 0.15) * 5.0))
            vibrato = 0.006 * vib_onset * math.sin(2 * math.pi * 5.4 * t)
            phase = 2 * math.pi * f0 * (1.0 + vibrato) * t

            # Envelope with smooth attack & release
            attack = min(1.0, t / 0.045)
            rel_t = max(0.0, t - dur)
            release = math.exp(-rel_t * 22.0)
            env = attack * release

            # Breathy reed harmonic structure
            sample = (
                math.sin(phase) * 0.80
                + math.sin(2 * phase) * 0.25
                + math.sin(3 * phase) * 0.12
                + math.sin(4 * phase) * 0.05
            )
            # Breath noise
            breath = (rng.random() * 2 - 1) * 0.04 * env
            mix(start_samp + i, (sample * env + breath) * amp, pan)

    def play_brush_snare(t_start, amp=0.05, pan=0.15):
        n_samp = int(0.18 * SR)
        start_samp = int(t_start * SR)
        lp = 0.0
        for i in range(min(n_samp, num_samples - start_samp)):
            t = i / SR
            raw = rng.random() * 2 - 1
            lp += 0.25 * (raw - lp)  # Bandpass-ish smoothing
            hp = raw - lp
            env = (1.0 - t / 0.18) ** 2.2 * min(1.0, t * 150)
            mix(start_samp + i, hp * env * amp, pan)

    def play_woodblock(t_start, amp=0.07, pan=-0.2):
        n_samp = int(0.06 * SR)
        start_samp = int(t_start * SR)
        for i in range(min(n_samp, num_samples - start_samp)):
            t = i / SR
            freq = 950 * math.exp(-t * 22)
            phase = 2 * math.pi * freq * t
            env = math.exp(-t * 65)
            mix(start_samp + i, math.sin(phase) * env * amp, pan)

    def play_shaker(t_start, amp=0.025, pan=-0.35):
        n_samp = int(0.08 * SR)
        start_samp = int(t_start * SR)
        for i in range(min(n_samp, num_samples - start_samp)):
            t = i / SR
            raw = rng.random() * 2 - 1
            env = (1.0 - t / 0.08) ** 1.8 * min(1.0, t * 250)
            mix(start_samp + i, raw * env * amp, pan)

    # --- CHORD PROGRESSION & BASSLINE (16 BARS) ---
    # Progression:
    # 0: Cmaj9   1: A7(b9)   2: Dm9     3: G13
    # 4: Em7     5: A7       6: Dm7     7: G7sus4 -> G7
    # 8: Fmaj7   9: Fm6      10: Em7    11: Am7
    # 12: Dm9    13: G13     14: Cmaj9  15: G7(turnaround)

    chords = [
        # (root_midi, chord_notes, bass_walk)
        (48, [64, 67, 71, 74], [48, 52, 55, 59]),       # Bar 0: Cmaj9 (C, E, G, B, D)
        (45, [61, 64, 67, 70], [45, 49, 52, 55]),       # Bar 1: A7b9 (A, C#, E, G, Bb)
        (50, [65, 69, 72, 76], [50, 53, 57, 53]),       # Bar 2: Dm9 (D, F, A, C, E)
        (43, [64, 67, 71, 74], [43, 47, 50, 47]),       # Bar 3: G13 (G, E, F, B, D)
        (40, [64, 67, 71, 74], [40, 43, 47, 50]),       # Bar 4: Em7
        (45, [61, 64, 67, 73], [45, 49, 52, 55]),       # Bar 5: A7
        (50, [65, 69, 72, 77], [50, 53, 56, 57]),       # Bar 6: Dm7 -> D#dim passing
        (43, [65, 67, 71, 74], [43, 50, 43, 47]),       # Bar 7: G7sus4
        (41, [64, 69, 72, 76], [41, 45, 48, 52]),       # Bar 8: Fmaj7 (Nostalgic shift)
        (41, [62, 68, 72, 74], [41, 44, 48, 51]),       # Bar 9: Fm6 (Classic Animal Crossing bittersweet IVm)
        (40, [64, 67, 71, 74], [40, 43, 47, 50]),       # Bar 10: Em7
        (45, [60, 67, 69, 72], [45, 48, 52, 55]),       # Bar 11: Am7
        (50, [65, 69, 72, 76], [50, 53, 57, 53]),       # Bar 12: Dm9
        (43, [64, 67, 71, 74], [43, 47, 50, 53]),       # Bar 13: G13
        (48, [64, 67, 71, 74], [48, 52, 55, 59]),       # Bar 14: Cmaj9
        (43, [62, 65, 71, 74], [43, 47, 50, 53]),       # Bar 15: G7 turnaround
    ]

    for bar_idx, (_, chord_notes, bass_notes) in enumerate(chords):
        # Bass: Swung walking / root-fifth pattern
        t0 = beat_to_sec(bar_idx, 0.0)
        t1 = beat_to_sec(bar_idx, 1.0)
        t2 = beat_to_sec(bar_idx, 2.0)
        t3 = beat_to_sec(bar_idx, 3.0)

        play_upright_bass(t0, 0.9, bass_notes[0], amp=0.20)
        play_upright_bass(t1, 0.8, bass_notes[1], amp=0.14)
        play_upright_bass(t2, 0.9, bass_notes[2], amp=0.18)
        play_upright_bass(t3, 0.8, bass_notes[3], amp=0.14)

        # Rhodes & Marimba Comping: Lazy syncopated stabs
        # Chords hit on "and of 1" and "beat 3" or "and of 3"
        t_stab1 = beat_to_sec(bar_idx, 0.5)
        t_stab2 = beat_to_sec(bar_idx, 2.5)

        for n in chord_notes:
            play_rhodes(t_stab1, 1.2, n, amp=0.045)
            play_rhodes(t_stab2, 1.4, n, amp=0.040)

        # Bouncy Marimba Arpeggio / Accents on alternate bars
        if bar_idx % 2 == 1:
            t_m1 = beat_to_sec(bar_idx, 1.5)
            t_m2 = beat_to_sec(bar_idx, 3.5)
            play_fm_marimba(t_m1, 0.4, chord_notes[-1], amp=0.08, pan=0.3)
            play_fm_marimba(t_m2, 0.4, chord_notes[-2], amp=0.06, pan=0.2)

        # Drums: Brushed snare on 2 & 4, woodblock on 4, shaker on swung 8ths
        play_brush_snare(t1, amp=0.045)
        play_brush_snare(t3, amp=0.055)
        play_woodblock(t3, amp=0.04)

        for b in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
            play_shaker(beat_to_sec(bar_idx, b), amp=0.018 if b % 1.0 != 0 else 0.012)

    # --- WHISTLE / REED MELODY (CALL & RESPONSE + NEGATIVE SPACE) ---
    # Signature 4-note motif: E5 - G5 - D5 - C5 (76, 79, 74, 72)
    melody_events = [
        # Phrase 1: The opening motif (Bars 0-1)
        (0, 0.0, 76, 0.8),   # E5
        (0, 1.0, 79, 0.6),   # G5
        (0, 2.0, 74, 0.8),   # D5
        (0, 3.0, 72, 1.8),   # C5 (held across bar line)
        (1, 2.5, 71, 0.5),   # B4
        (1, 3.0, 72, 0.9),   # C5
        # Bar 2-3: REST / BREATH (Negative space: let the bass & marimba play!)
        (3, 2.5, 74, 0.5),   # Pick-up D5 into phrase 2
        (3, 3.0, 76, 0.7),   # E5

        # Phrase 2: Ascending response (Bars 4-6)
        (4, 0.0, 79, 0.8),   # G5
        (4, 1.0, 81, 0.6),   # A5
        (4, 2.0, 83, 1.2),   # B5
        (5, 0.5, 81, 0.6),   # A5
        (5, 1.5, 79, 0.6),   # G5
        (5, 2.5, 76, 1.6),   # E5 (warm resolution)
        # Bar 6-7: REST / BREATH
        (7, 2.5, 72, 0.5),   # C5
        (7, 3.0, 74, 0.7),   # D5

        # Phrase 3: Bittersweet IVmaj7 -> IVm section (Bars 8-11)
        (8, 0.0, 76, 1.2),   # E5 over Fmaj7
        (8, 2.0, 77, 0.8),   # F5
        (8, 3.0, 79, 1.4),   # G5
        (9, 1.0, 77, 1.0),   # F5 over Fm6
        (9, 2.5, 75, 1.5),   # Eb5 over Fm6 (gorgeous nostalgic AC color!)
        (10, 1.0, 74, 0.8),  # D5 over Em7
        (10, 2.0, 72, 1.8),  # C5
        (11, 2.0, 69, 1.2),  # A4 over Am7

        # Phrase 4: Final resolution & Turnaround (Bars 12-15)
        (12, 0.5, 72, 0.6),  # C5
        (12, 1.5, 74, 0.6),  # D5
        (12, 2.5, 76, 1.2),  # E5
        (13, 1.0, 79, 0.7),  # G5
        (13, 2.0, 77, 0.6),  # F5
        (13, 3.0, 74, 1.0),  # D5
        (14, 0.5, 72, 2.2),  # C5 (home)
        # Bar 15: Rest for turnaround cadence
    ]

    for bar, beat, note, dur in melody_events:
        t = beat_to_sec(bar, beat)
        play_whistle_lead(t, dur, note, amp=0.09, pan=0.08)

    # Gentle ambient tide bed (very subtle ocean swell under dock)
    tide_lp = 0.0
    for i in range(num_samples):
        raw = rng.random() * 2 - 1
        tide_lp += 0.005 * (raw - tide_lp)
        t = i / SR
        swell = 0.5 + 0.5 * math.sin(2 * math.pi * t / 8.5)
        amb = tide_lp * 0.003 * swell
        left[i] += amb
        right[i] += amb * 0.9

    # Normalize & export to 16-bit stereo WAV
    peak = max(max(map(abs, left)), max(map(abs, right)))
    gain = 0.80 / max(peak, 1e-9)

    with wave.open(str(WAV_PATH), "wb") as f:
        f.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        chunk_size = 4096
        for offset in range(0, num_samples, chunk_size):
            chunk_l = left[offset:offset + chunk_size]
            chunk_r = right[offset:offset + chunk_size]
            samples = []
            for l, r in zip(chunk_l, chunk_r):
                sl = int(max(-1.0, min(1.0, l * gain)) * 32767)
                sr_ = int(max(-1.0, min(1.0, r * gain)) * 32767)
                samples.extend((sl, sr_))
            f.writeframesraw(struct.pack("<" + "h" * len(samples), *samples))

    print(f"Rendered: {WAV_PATH} ({total_duration:.1f}s, {num_bars} bars @ {BPM} BPM swung)")


if __name__ == "__main__":
    render_mvp()
