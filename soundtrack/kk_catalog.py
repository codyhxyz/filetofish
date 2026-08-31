#!/usr/bin/env python3
"""Animal Crossing / K.K. Slider 26-Genre Style Suite for FiletoFish.

Renders 26 distinct, iconic genre prototypes with custom synthesis models:
  1. bossa             - K.K. Bossa (Nylon guitar, upright bass, shaker, flute)
  2. dub_reggae        - K.K. Pier Dub (Deep sub drop, offbeat organ, spring rimshot, melodica)
  3. calypso           - K.K. Calypso / Steelpan (Metallic FM steelpan, woodblock, congas)
  4. slack_key         - K.K. Hawaiian Slack Key (Open-G fingerpicked acoustic, ukulele, log drum)
  5. mambo             - K.K. Mambo / Son Cubano (Staccato piano montuno, muted trumpet, bongos)
  6. surf_rock         - K.K. Surf Rock (Twangy whammy guitar tremolo, fast surf beat)
  7. ragtime           - K.K. Ragtime / Stride (Tack/honky-tonk piano, tuba, washboard)
  8. western           - K.K. Western / Morricone (Baritone twang, lonely whistle, galloping beat)
  9. second_line       - K.K. New Orleans Second Line (Sousaphone, swampy clarinet, syncopated snare)
  10. cool_jazz        - K.K. Cool Jazz / Noir (Harmon-muted trumpet, walking bass, ride cymbal)
  11. musette          - K.K. Musette / French Waltz (Dual-detuned beating accordion, gypsy guitar)
  12. sea_shanty       - K.K. Sea Shanty / Celtic (Irish tin whistle, DADGAD guitar, bodhrán)
  13. bluegrass        - K.K. Bluegrass / Country (Fast banjo roll, acoustic bass runs, fiddle)
  14. flamenco         - K.K. Flamenco (Nylon rasgueado strum, palmas claps, Phrygian cadence)
  15. city_pop         - K.K. City Pop (Slap bass thumb pops, DX7 FM ep, chorus guitar, funk snare)
  16. lofi_chillhop    - K.K. Lo-Fi Chillhop (Tape-warped piano, vinyl crackle, unquantized beats)
  17. y2k_jungle       - K.K. Y2K Jungle / Breakbeat (Fast breakbeat chops, ambient Rhodes, sub-bass)
  18. chiptune         - K.K. Chiptune 8-Bit (12.5%/50% pulse waves, fast arpeggios, noise drums)
  19. deep_house       - K.K. Cozy Deep House (4-on-floor kick, swung hats, M1 organ stabs, FM bass)
  20. music_box        - K.K. Music Box / Lullaby (Metallic music box tines, celesta, bowed cello)
  21. satie_ambient    - K.K. Satie Minimalist (Sparse acoustic piano, long silences, church bell)
  22. raindrop_kalimba - K.K. Raindrop Kalimba (3 interlocking kalimbas, polyrhythmic water drops)
  23. chamber_strings  - K.K. Chamber / Museum (Pizzicato cello/viola, soaring violin lead)
  24. afrobeat         - K.K. Afrobeat (Interlocking clean guitars, talking drum, shekere, groove)
  25. tango            - K.K. Tango (Bandoneón accordion, piano marcato, habanera rhythm)
  26. march            - K.K. March / Stroll (Piccolo whistle, marching snare rudiments, tuba oom-pah)
"""

import json
import math
import random
import struct
import wave
from array import array
from pathlib import Path

SR = 32_000
OUT_DIR = Path(__file__).parent / "previews"
OUT_DIR.mkdir(exist_ok=True)


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


class Synth:
    def __init__(self, duration_s, seed=42):
        self.num_samples = int(duration_s * SR)
        self.left = array("f", [0.0]) * self.num_samples
        self.right = array("f", [0.0]) * self.num_samples
        self.rng = random.Random(seed)
        self.duration = duration_s

    def mix(self, pos, val, pan=0.0):
        idx = int(pos)
        if 0 <= idx < self.num_samples:
            lg = math.cos((pan + 1.0) * math.pi / 4.0)
            rg = math.sin((pan + 1.0) * math.pi / 4.0)
            self.left[idx] += val * lg
            self.right[idx] += val * rg

    # --- INSTRUMENT ENGINES ---

    def upright_bass(self, t_s, dur_s, midi_note, amp=0.22, pan=-0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.5, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            f = f0 * (1.0 + 0.025 * math.exp(-t * 40))
            ph = 2 * math.pi * f * t
            s = math.sin(ph) * math.exp(-t * 2.5) * 0.85 + math.sin(2 * ph) * math.exp(-t * 5.0) * 0.35
            if t < 0.025:
                s += (self.rng.random() * 2 - 1) * math.exp(-t * 120) * 0.2
            self.mix(st + i, s * amp, pan)

    def slap_bass(self, t_s, dur_s, midi_note, is_pop=False, amp=0.24, pan=-0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.2, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            f = f0 * (1.0 + 0.04 * math.exp(-t * 60))
            ph = 2 * math.pi * f * t
            decay = 4.5 if not is_pop else 7.0
            s = math.sin(ph) * math.exp(-t * decay) + 0.45 * math.sin(2 * ph) * math.exp(-t * decay * 1.5)
            # Slap pop transient
            if t < 0.015:
                s += math.sin(2 * math.pi * 2400 * t) * math.exp(-t * 200) * (0.8 if is_pop else 0.4)
            self.mix(st + i, s * amp, pan)

    def sub_bass(self, t_s, dur_s, midi_note, amp=0.25, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * f0 * t
            s = math.sin(ph) + 0.2 * math.sin(2 * ph)
            env = min(1.0, t * 40) * math.exp(-t * 1.2)
            self.mix(st + i, s * env * amp, pan)

    def sousaphone_tuba(self, t_s, dur_s, midi_note, amp=0.22, pan=-0.15):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.4, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * f0 * t
            # Brassy buzz
            buzz = math.sin(ph) + 0.5 * math.sin(2 * ph) + 0.3 * math.sin(3 * ph) + 0.15 * math.sin(4 * ph)
            env = (1.0 - math.exp(-t * 80)) * math.exp(-t * 3.2)
            self.mix(st + i, buzz * env * amp, pan)

    def nylon_guitar(self, t_s, dur_s, midi_note, amp=0.12, pan=-0.2):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.6, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * f0 * t
            s = math.sin(ph) + 0.35 * math.sin(2 * ph) * math.exp(-t * 6.0) + 0.15 * math.sin(3 * ph) * math.exp(-t * 10.0)
            env = (1.0 - math.exp(-t * 220)) * math.exp(-t * 4.8)
            self.mix(st + i, s * env * amp, pan)

    def banjo(self, t_s, dur_s, midi_note, amp=0.14, pan=0.2):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.4, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * f0 * t
            # Metallic ping
            s = (math.sin(ph) + 0.6 * math.sin(2 * ph) + 0.4 * math.sin(3 * ph) + 0.25 * math.sin(4 * ph))
            env = (1.0 - math.exp(-t * 400)) * math.exp(-t * 8.5)
            self.mix(st + i, s * env * amp, pan)

    def surf_guitar(self, t_s, dur_s, midi_note, whammy=0.0, amp=0.15, pan=0.1):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.1, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            pitch = f0 * (1.0 + whammy * math.sin(2 * math.pi * 3.5 * t) * math.exp(-t * 2.0))
            ph = 2 * math.pi * pitch * t
            s = math.sin(ph) + 0.5 * math.sin(2 * ph) + 0.35 * math.sin(3 * ph) + 0.2 * math.sin(5 * ph)
            # Spring reverb rattle
            reverb = 0.2 * math.sin(2 * math.pi * f0 * 1.5 * t) * math.exp(-t * 3.0)
            env = (1.0 - math.exp(-t * 180)) * math.exp(-t * 3.8)
            self.mix(st + i, (s + reverb) * env * amp, pan)

    def accordion_musette(self, t_s, dur_s, midi_note, amp=0.11, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.15, self.duration - t_s) * SR)
        st = int(t_s * SR)
        # Wet dual detuned reeds (gives authentic French beating vibrato)
        detune = 1.6  # Hz
        for i in range(max(0, n_samp)):
            t = i / SR
            ph1 = 2 * math.pi * (f0 - detune) * t
            ph2 = 2 * math.pi * (f0 + detune) * t
            reed1 = math.sin(ph1) + 0.4 * math.sin(2 * ph1) + 0.2 * math.sin(3 * ph1)
            reed2 = math.sin(ph2) + 0.4 * math.sin(2 * ph2) + 0.2 * math.sin(3 * ph2)
            att = min(1.0, t / 0.05)
            rel = math.exp(-max(0.0, t - dur_s) * 20.0)
            self.mix(st + i, (reed1 + reed2) * 0.5 * att * rel * amp, pan)

    def steelpan(self, t_s, dur_s, midi_note, amp=0.14, pan=0.2):
        fc = midi_hz(midi_note)
        fm = fc * 2.76  # Inharmonic steel drum ratio
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            mod = math.sin(2 * math.pi * fm * t) * math.exp(-t * 22.0) * 3.2
            car = math.sin(2 * math.pi * fc * t + mod)
            body = math.sin(4 * math.pi * fc * t) * 0.3 * math.exp(-t * 6.0)
            env = (1.0 - math.exp(-t * 300)) * math.exp(-t * 5.5)
            self.mix(st + i, (car + body) * env * amp, pan)

    def honky_tonk_piano(self, t_s, dur_s, midi_note, amp=0.12, pan=-0.15):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        detune = 1.4
        for i in range(max(0, n_samp)):
            t = i / SR
            ph1 = 2 * math.pi * (f0 - detune) * t
            ph2 = 2 * math.pi * (f0 + detune) * t
            s = (math.sin(ph1) + math.sin(ph2)) * 0.5 + 0.3 * math.sin(2 * ph1) * math.exp(-t * 4.0)
            # Tack hammer click
            if t < 0.012:
                s += math.sin(2 * math.pi * 3200 * t) * math.exp(-t * 250) * 0.6
            env = (1.0 - math.exp(-t * 200)) * math.exp(-t * 3.2)
            self.mix(st + i, s * env * amp, pan)

    def rhodes_ep(self, t_s, dur_s, midi_note, amp=0.08, pan=-0.2):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 2.0, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * fc * t
            mod = 0.5 * math.exp(-t * 3.0) * math.sin(ph)
            trem = 1.0 + 0.15 * math.sin(2 * math.pi * 4.8 * t)
            s = (math.sin(ph + mod) + 0.2 * math.sin(2 * ph)) * trem
            env = min(1.0, t * 90) * math.exp(-t * 1.8)
            self.mix(st + i, s * env * amp, pan)

    def organ_m1(self, t_s, dur_s, midi_note, amp=0.08, pan=-0.15):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.1, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * f0 * t
            # Drawbar organ mix
            s = math.sin(ph) + 0.5 * math.sin(2 * ph) + 0.3 * math.sin(3 * ph) + 0.25 * math.sin(4 * ph)
            # Key click
            if t < 0.01:
                s += (self.rng.random() * 2 - 1) * 0.4
            att = min(1.0, t / 0.015)
            rel = math.exp(-max(0.0, t - dur_s) * 25.0)
            self.mix(st + i, s * att * rel * amp, pan)

    def muted_trumpet(self, t_s, dur_s, midi_note, amp=0.10, pan=0.08):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.12, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib = 0.005 * min(1.0, max(0.0, (t - 0.12) * 5.0)) * math.sin(2 * math.pi * 5.8 * t)
            ph = 2 * math.pi * f0 * (1.0 + vib) * t
            # Harmon mute: buzzy narrow formant
            s = math.sin(ph) + 0.6 * math.sin(2 * ph) + 0.5 * math.sin(3 * ph) + 0.4 * math.sin(5 * ph)
            att = min(1.0, t / 0.035)
            rel = math.exp(-max(0.0, t - dur_s) * 20.0)
            self.mix(st + i, s * att * rel * amp, pan)

    def tin_whistle(self, t_s, dur_s, midi_note, amp=0.10, pan=0.05):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.15, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            vib = 0.006 * min(1.0, max(0.0, (t - 0.15) * 4.5)) * math.sin(2 * math.pi * 5.2 * t)
            ph = 2 * math.pi * f0 * (1.0 + vib) * t
            s = math.sin(ph) + 0.2 * math.sin(2 * ph) + (self.rng.random() * 2 - 1) * 0.04
            att = min(1.0, t / 0.03)
            rel = math.exp(-max(0.0, t - dur_s) * 22.0)
            self.mix(st + i, s * att * rel * amp, pan)

    def fm_marimba(self, t_s, dur_s, midi_note, amp=0.13, pan=0.25):
        fc = midi_hz(midi_note)
        fm = fc * 3.84
        n_samp = int(min(dur_s * 1.8, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            mod = math.sin(2 * math.pi * fm * t) * math.exp(-t * 28.0) * 2.8
            car = math.sin(2 * math.pi * fc * t + mod)
            env = (1.0 - math.exp(-t * 250)) * math.exp(-t * 6.2)
            self.mix(st + i, car * env * amp, pan)

    def kalimba(self, t_s, dur_s, midi_note, amp=0.12, pan=0.25):
        fc = midi_hz(midi_note)
        fm = fc * 5.42
        n_samp = int(min(dur_s * 2.0, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            mod = math.sin(2 * math.pi * fm * t) * math.exp(-t * 35.0) * 1.8
            s = math.sin(2 * math.pi * fc * t + mod)
            env = (1.0 - math.exp(-t * 300)) * math.exp(-t * 4.2)
            self.mix(st + i, s * env * amp, pan)

    def music_box(self, t_s, dur_s, midi_note, amp=0.11, pan=0.1):
        fc = midi_hz(midi_note)
        n_samp = int(min(dur_s * 2.5, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            ph = 2 * math.pi * fc * t
            # High crystalline tines
            s = math.sin(ph) + 0.3 * math.sin(4.02 * ph) * math.exp(-t * 4.0) + 0.1 * math.sin(9.05 * ph) * math.exp(-t * 8.0)
            env = (1.0 - math.exp(-t * 350)) * math.exp(-t * 2.2)
            self.mix(st + i, s * env * amp, pan)

    def chiptune_pulse(self, t_s, dur_s, midi_note, duty=0.25, amp=0.12, pan=0.0):
        f0 = midi_hz(midi_note)
        n_samp = int(min(dur_s + 0.05, self.duration - t_s) * SR)
        st = int(t_s * SR)
        for i in range(max(0, n_samp)):
            t = i / SR
            frac = (t * f0) % 1.0
            val = 1.0 if frac < duty else -1.0
            rel = math.exp(-max(0.0, t - dur_s) * 30.0)
            self.mix(st + i, val * rel * amp, pan)

    # --- PERCUSSION ENGINES ---

    def kick(self, t_s, amp=0.30, pan=0.0):
        n_samp = int(0.18 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            f = 140 * math.exp(-t * 32.0) + 42
            ph = 2 * math.pi * f * t
            s = math.sin(ph) * math.exp(-t * 18.0)
            if t < 0.01:
                s += (self.rng.random() * 2 - 1) * 0.3
            self.mix(st + i, s * amp, pan)

    def snare_brush(self, t_s, amp=0.05, pan=0.15):
        n_samp = int(0.16 * SR)
        st = int(t_s * SR)
        lp = 0.0
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            lp += 0.25 * (raw - lp)
            env = (1.0 - t / 0.16) ** 2.2 * min(1.0, t * 150)
            self.mix(st + i, (raw - lp) * env * amp, pan)

    def snare_acoustic(self, t_s, amp=0.18, pan=0.05):
        n_samp = int(0.18 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            body = math.sin(2 * math.pi * (180 * math.exp(-t * 40)) * t) * math.exp(-t * 24)
            snare = (self.rng.random() * 2 - 1) * math.exp(-t * 18)
            self.mix(st + i, (body * 0.6 + snare * 0.7) * amp, pan)

    def rimshot_dub(self, t_s, amp=0.16, pan=-0.1):
        n_samp = int(0.50 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            stick = math.sin(2 * math.pi * 950 * t) * math.exp(-t * 80)
            # Spring delay echo
            echo1 = math.sin(2 * math.pi * 920 * (t - 0.15)) * math.exp(-(t - 0.15) * 60) * 0.4 if t > 0.15 else 0
            echo2 = math.sin(2 * math.pi * 890 * (t - 0.30)) * math.exp(-(t - 0.30) * 50) * 0.2 if t > 0.30 else 0
            self.mix(st + i, (stick + echo1 + echo2) * amp, pan)

    def palmas(self, t_s, amp=0.12, pan=0.2):
        n_samp = int(0.08 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            raw = (self.rng.random() * 2 - 1) * math.exp(-t * 70)
            self.mix(st + i, raw * amp, pan)

    def bongo(self, t_s, high=False, amp=0.12, pan=-0.2):
        n_samp = int(0.12 * SR)
        st = int(t_s * SR)
        f0 = 420 if high else 240
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            f = f0 * math.exp(-t * 25.0)
            ph = 2 * math.pi * f * t
            s = math.sin(ph) * math.exp(-t * 35.0)
            self.mix(st + i, s * amp, pan)

    def shaker(self, t_s, amp=0.03, pan=-0.3):
        n_samp = int(0.07 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            raw = self.rng.random() * 2 - 1
            env = (1.0 - t / 0.07) ** 1.8 * min(1.0, t * 250)
            self.mix(st + i, raw * env * amp, pan)

    def water_droplet(self, t_s, amp=0.06, pan=-0.1):
        n_samp = int(0.15 * SR)
        st = int(t_s * SR)
        for i in range(min(n_samp, self.num_samples - st)):
            t = i / SR
            freq = 600 * (160 / 600) ** (t / 0.15)
            s = math.sin(2 * math.pi * freq * t) * math.exp(-t * 22)
            self.mix(st + i, s * amp, pan)

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
# 26 GENRE BUILDERS
# ==============================================================================

def make_track(slug, title, category, bpm, meter, bars, render_fn):
    beat_dur = 60.0 / bpm
    dur_s = bars * meter * beat_dur + 2.0
    synth = Synth(dur_s, seed=sum(map(ord, slug)))
    render_fn(synth, bpm, beat_dur, bars, meter)
    path = OUT_DIR / f"kk_{slug}.wav"
    synth.export_wav(path)
    return {
        "slug": slug,
        "title": title,
        "category": category,
        "bpm": bpm,
        "meter": f"{meter}/4" if meter != 3 else "3/4",
        "duration": f"{dur_s:.1f}s",
        "path": str(path.relative_to(Path(__file__).parent.parent)),
    }


def b_bossa(s, bpm, beat, bars, meter):
    # K.K. Bossa (Cmaj9 -> A7b9 -> Dm9 -> G13)
    chords = [(48, [64, 67, 71, 74]), (45, [61, 64, 67, 70]), (50, [65, 69, 72, 76]), (43, [64, 67, 71, 74])] * 2
    for bar, (bass, c_notes) in enumerate(chords):
        t_bar = bar * 4 * beat
        s.upright_bass(t_bar, beat * 1.5, bass, amp=0.20)
        s.upright_bass(t_bar + 2 * beat, beat * 1.5, bass + 7, amp=0.16)
        for n in c_notes:
            s.nylon_guitar(t_bar + 0.5 * beat, beat * 1.2, n, amp=0.04)
            s.nylon_guitar(t_bar + 2.5 * beat, beat * 1.2, n, amp=0.04)
        s.snare_brush(t_bar + beat, amp=0.035)
        s.snare_brush(t_bar + 3 * beat, amp=0.045)
        s.shaker(t_bar + 0.5 * beat, amp=0.02)
        s.shaker(t_bar + 2.5 * beat, amp=0.02)
    # Flute melody with breath
    melody = [(0, 0.0, 76, 1.2), (0, 2.0, 79, 1.0), (1, 0.0, 74, 2.2), (3, 2.0, 74, 0.8), (3, 3.0, 76, 0.8), (4, 0.0, 79, 1.8), (5, 0.0, 76, 2.5)]
    for bar, b_offset, n, dur in melody:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.09)


def b_dub_reggae(s, bpm, beat, bars, meter):
    # K.K. Dub (Am -> G one-drop)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = 45 if bar % 2 == 0 else 43
        # Heavy sub drop on beat 3
        s.sub_bass(t_bar + 2 * beat, beat * 1.8, bass, amp=0.28)
        # Organ chop on 2 & 4
        chord = [57, 60, 64] if bar % 2 == 0 else [55, 59, 62]
        for n in chord:
            s.organ_m1(t_bar + beat, beat * 0.4, n, amp=0.06)
            s.organ_m1(t_bar + 3 * beat, beat * 0.4, n, amp=0.06)
        # Spring rimshot echo on beat 3
        s.rimshot_dub(t_bar + 2 * beat, amp=0.18)
    # Melodica lead
    lead = [(0, 0.0, 69, 1.5), (0, 2.0, 72, 1.0), (1, 0.0, 67, 2.5), (4, 0.0, 76, 1.8), (5, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.accordion_musette((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.10)


def b_calypso(s, bpm, beat, bars, meter):
    # K.K. Calypso (C -> F -> G -> C steelpan)
    chords = [(48, [60, 64, 67]), (41, [60, 65, 69]), (43, [59, 62, 67]), (48, [60, 64, 67])] * 2
    for bar, (bass, c_notes) in enumerate(chords):
        t_bar = bar * 4 * beat
        s.upright_bass(t_bar, beat * 0.8, bass, amp=0.20)
        s.upright_bass(t_bar + 1.5 * beat, beat * 0.8, bass + 7, amp=0.16)
        s.upright_bass(t_bar + 3.0 * beat, beat * 0.8, bass, amp=0.18)
        # Steelpan rolls
        s.steelpan(t_bar, beat * 0.4, c_notes[0], amp=0.08)
        s.steelpan(t_bar + 0.75 * beat, beat * 0.4, c_notes[1], amp=0.09)
        s.steelpan(t_bar + 1.5 * beat, beat * 0.4, c_notes[2], amp=0.10)
        s.steelpan(t_bar + 2.5 * beat, beat * 0.4, c_notes[1], amp=0.08)
        s.bongo(t_bar + beat, high=False, amp=0.10)
        s.bongo(t_bar + 3 * beat, high=True, amp=0.12)
    # Calypso Lead
    lead = [(0, 0.0, 72, 0.6), (0, 0.75, 76, 0.6), (0, 1.5, 79, 1.0), (1, 0.0, 77, 1.5), (2, 0.0, 79, 0.8), (2, 1.5, 74, 1.2), (3, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.steelpan((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.14)


def b_slack_key(s, bpm, beat, bars, meter):
    # K.K. Slack Key (G -> C -> D7 -> G)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [43, 48, 38, 43][bar % 4]
        s.nylon_guitar(t_bar, beat * 1.8, bass, amp=0.16)
        s.nylon_guitar(t_bar + 1.5 * beat, beat * 1.2, bass + 12, amp=0.12)
        s.nylon_guitar(t_bar + 2.5 * beat, beat * 1.2, bass + 7, amp=0.10)
        s.shaker(t_bar + beat, amp=0.02)
        s.shaker(t_bar + 3 * beat, amp=0.02)
    lead = [(0, 0.0, 71, 1.2), (0, 1.5, 74, 1.5), (1, 0.0, 72, 2.0), (2, 0.0, 69, 1.5), (3, 0.0, 67, 2.5)]
    for bar, b_offset, n, dur in lead:
        s.nylon_guitar((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.14)


def b_mambo(s, bpm, beat, bars, meter):
    # K.K. Mambo (Cm -> Fm -> G7 -> Cm)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [48, 41, 43, 48][bar % 4]
        s.upright_bass(t_bar, beat * 0.8, bass, amp=0.22)
        s.upright_bass(t_bar + 2.5 * beat, beat * 0.8, bass + 7, amp=0.18)
        # Piano montuno
        s.honky_tonk_piano(t_bar + 0.5 * beat, beat * 0.4, 60, amp=0.07)
        s.honky_tonk_piano(t_bar + 1.5 * beat, beat * 0.4, 63, amp=0.07)
        s.honky_tonk_piano(t_bar + 2.5 * beat, beat * 0.4, 67, amp=0.08)
        s.bongo(t_bar + beat, high=True, amp=0.12)
        s.bongo(t_bar + 3 * beat, high=False, amp=0.10)
    lead = [(0, 0.0, 72, 0.5), (0, 1.0, 75, 0.5), (0, 2.0, 79, 1.2), (1, 0.5, 77, 1.5), (2, 0.0, 74, 1.2), (3, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.muted_trumpet((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.12)


def b_surf_rock(s, bpm, beat, bars, meter):
    # K.K. Surf Rock (Em -> Am -> B7 -> Em fast twang)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [40, 45, 47, 40][bar % 4]
        for step in range(8):
            s.sub_bass(t_bar + step * 0.5 * beat, beat * 0.4, bass, amp=0.14)
        s.kick(t_bar, amp=0.25)
        s.kick(t_bar + 2 * beat, amp=0.25)
        s.snare_acoustic(t_bar + beat, amp=0.18)
        s.snare_acoustic(t_bar + 3 * beat, amp=0.18)
    # Double-picked surf lead
    lead = [(0, 0.0, 76), (0, 0.5, 76), (0, 1.0, 79), (0, 1.5, 79), (0, 2.0, 83), (1, 0.0, 81), (2, 0.0, 75), (3, 0.0, 76)]
    for bar, b_offset, n in lead:
        s.surf_guitar((bar * 4 + b_offset) * beat, beat * 0.45, n, whammy=0.03, amp=0.16)


def b_ragtime(s, bpm, beat, bars, meter):
    # K.K. Ragtime (C -> G7 -> C stride)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = 48 if bar % 2 == 0 else 43
        s.sousaphone_tuba(t_bar, beat * 0.9, bass, amp=0.20)
        s.sousaphone_tuba(t_bar + 2 * beat, beat * 0.9, bass + 7, amp=0.16)
        s.honky_tonk_piano(t_bar + beat, beat * 0.5, 64, amp=0.08)
        s.honky_tonk_piano(t_bar + 3 * beat, beat * 0.5, 67, amp=0.08)
    lead = [(0, 0.0, 72, 0.4), (0, 0.5, 74, 0.4), (0, 1.0, 76, 0.8), (0, 2.5, 79, 1.0), (1, 0.0, 74, 1.5), (2, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.honky_tonk_piano((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.14)


def b_western(s, bpm, beat, bars, meter):
    # K.K. Western (Dm -> C -> Bb -> A7)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [50, 48, 46, 45][bar % 4]
        s.surf_guitar(t_bar, beat * 1.5, bass - 12, amp=0.18)
        s.shaker(t_bar + 0.5 * beat, amp=0.02)
        s.shaker(t_bar + 1.5 * beat, amp=0.03)
        s.shaker(t_bar + 2.5 * beat, amp=0.02)
        s.shaker(t_bar + 3.5 * beat, amp=0.03)
    lead = [(0, 0.0, 74, 1.8), (0, 2.0, 77, 1.5), (1, 0.0, 72, 2.5), (2, 0.0, 70, 2.0), (3, 0.0, 69, 3.0)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.12)


def b_second_line(s, bpm, beat, bars, meter):
    # K.K. Second Line (Bb -> Eb7 -> F7)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [46, 51, 41, 46][bar % 4]
        s.sousaphone_tuba(t_bar, beat * 0.8, bass, amp=0.22)
        s.sousaphone_tuba(t_bar + 1.5 * beat, beat * 0.8, bass + 7, amp=0.18)
        s.snare_acoustic(t_bar + beat, amp=0.14)
        s.snare_acoustic(t_bar + 2.5 * beat, amp=0.16)
        s.snare_acoustic(t_bar + 3.0 * beat, amp=0.18)
    lead = [(0, 0.0, 70, 0.8), (0, 1.5, 74, 1.0), (1, 0.0, 75, 1.5), (2, 0.0, 77, 1.2), (3, 0.0, 70, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.muted_trumpet((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.13)


def b_cool_jazz(s, bpm, beat, bars, meter):
    # K.K. Cool Jazz (Dm9 -> G13 -> Cmaj9)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [50, 43, 48, 48][bar % 4]
        s.upright_bass(t_bar, beat * 0.9, bass, amp=0.18)
        s.upright_bass(t_bar + beat, beat * 0.9, bass + 4, amp=0.14)
        s.upright_bass(t_bar + 2 * beat, beat * 0.9, bass + 7, amp=0.16)
        s.upright_bass(t_bar + 3 * beat, beat * 0.9, bass + 10, amp=0.14)
        s.rhodes_ep(t_bar + 1.5 * beat, beat * 1.8, 64, amp=0.04)
        s.snare_brush(t_bar + beat, amp=0.03)
        s.snare_brush(t_bar + 3 * beat, amp=0.04)
    lead = [(0, 0.0, 72, 1.8), (0, 2.5, 76, 1.2), (1, 1.0, 74, 2.0), (2, 0.0, 71, 2.5)]
    for bar, b_offset, n, dur in lead:
        s.muted_trumpet((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.11)


def b_musette(s, bpm, beat, bars, meter):
    # K.K. Musette (Am -> Dm -> E7 -> Am in 3/4 waltz)
    for bar in range(bars):
        t_bar = bar * 3 * beat
        bass = [45, 50, 40, 45][bar % 4]
        s.upright_bass(t_bar, beat * 1.2, bass, amp=0.20)
        s.nylon_guitar(t_bar + beat, beat * 0.8, 60, amp=0.05)
        s.nylon_guitar(t_bar + 2 * beat, beat * 0.8, 64, amp=0.05)
    lead = [(0, 0.0, 69, 1.8), (0, 2.0, 72, 1.0), (1, 0.0, 74, 2.2), (2, 0.0, 71, 2.0), (3, 0.0, 69, 2.8)]
    for bar, b_offset, n, dur in lead:
        s.accordion_musette((bar * 3 + b_offset) * beat, dur * beat, n, amp=0.13)


def b_sea_shanty(s, bpm, beat, bars, meter):
    # K.K. Sea Shanty (Dm -> C -> Dm in 6/8 lilt)
    for bar in range(bars):
        t_bar = bar * 3 * beat
        s.upright_bass(t_bar, beat * 1.5, 50 if bar % 2 == 0 else 48, amp=0.22)
        s.nylon_guitar(t_bar + beat, beat * 0.8, 62, amp=0.06)
        s.nylon_guitar(t_bar + 2 * beat, beat * 0.8, 65, amp=0.06)
    lead = [(0, 0.0, 62, 1.0), (0, 1.0, 65, 1.0), (0, 2.0, 69, 1.0), (1, 0.0, 67, 2.0), (2, 0.0, 65, 1.0), (2, 1.0, 64, 1.0), (3, 0.0, 62, 2.5)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 3 + b_offset) * beat, dur * beat, n, amp=0.12)


def b_bluegrass(s, bpm, beat, bars, meter):
    # K.K. Bluegrass (G -> C -> D7 -> G fast banjo)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [43, 48, 38, 43][bar % 4]
        s.upright_bass(t_bar, beat * 0.8, bass, amp=0.20)
        s.upright_bass(t_bar + 2 * beat, beat * 0.8, bass + 7, amp=0.18)
        # Banjo roll
        for sub in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]:
            s.banjo(t_bar + sub * beat, beat * 0.4, 59 + int(sub * 2) % 8, amp=0.08)
    lead = [(0, 0.0, 71, 0.8), (0, 1.5, 74, 1.0), (1, 0.0, 72, 1.5), (2, 0.0, 69, 1.2), (3, 0.0, 67, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.11)


def b_flamenco(s, bpm, beat, bars, meter):
    # K.K. Flamenco (Am -> G -> F -> E Phrygian)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        chord = [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]][bar % 4]
        # Rasgueado burst
        for n in chord:
            s.nylon_guitar(t_bar, beat * 0.8, n, amp=0.08)
            s.nylon_guitar(t_bar + 0.75 * beat, beat * 0.8, n, amp=0.07)
        s.palmas(t_bar + beat, amp=0.12)
        s.palmas(t_bar + 2.5 * beat, amp=0.14)
        s.palmas(t_bar + 3.0 * beat, amp=0.12)
    lead = [(0, 0.0, 69, 1.0), (0, 1.5, 72, 1.0), (1, 0.0, 71, 1.5), (2, 0.0, 65, 1.2), (3, 0.0, 64, 2.5)]
    for bar, b_offset, n, dur in lead:
        s.nylon_guitar((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.16)


def b_city_pop(s, bpm, beat, bars, meter):
    # K.K. City Pop (Fmaj7 -> E7 -> Am7 -> C7 funk)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = [41, 40, 45, 36][bar % 4]
        s.slap_bass(t_bar, beat * 0.8, bass, is_pop=False, amp=0.22)
        s.slap_bass(t_bar + 1.5 * beat, beat * 0.6, bass + 12, is_pop=True, amp=0.25)
        s.slap_bass(t_bar + 2.5 * beat, beat * 0.8, bass + 7, is_pop=False, amp=0.20)
        s.rhodes_ep(t_bar + 0.5 * beat, beat * 0.8, 64, amp=0.06)
        s.rhodes_ep(t_bar + 2.0 * beat, beat * 0.8, 67, amp=0.06)
        s.kick(t_bar, amp=0.25)
        s.snare_acoustic(t_bar + beat, amp=0.16)
        s.snare_acoustic(t_bar + 3 * beat, amp=0.16)
    lead = [(0, 0.0, 76, 1.0), (0, 1.5, 79, 1.0), (1, 0.5, 74, 1.5), (2, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.10)


def b_lofi(s, bpm, beat, bars, meter):
    # K.K. Lo-Fi Chillhop (Dm9 -> G13 -> Cmaj9 tape wow)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        # Lazy unquantized drums
        s.kick(t_bar + 0.02, amp=0.24)
        s.snare_brush(t_bar + beat + 0.04, amp=0.06)
        s.kick(t_bar + 2.5 * beat + 0.03, amp=0.20)
        s.snare_brush(t_bar + 3 * beat + 0.04, amp=0.06)
        # Detuned felt piano chords
        chord = [[60, 65, 69, 72], [59, 64, 67, 71], [60, 64, 67, 71]][bar % 3]
        for n in chord:
            s.rhodes_ep(t_bar + 0.05, beat * 2.8, n, amp=0.05)
    # Lazy lead
    lead = [(0, 0.5, 76, 1.8), (1, 1.0, 74, 1.8), (2, 0.0, 72, 2.5)]
    for bar, b_offset, n, dur in lead:
        s.rhodes_ep((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.08)


def b_jungle(s, bpm, beat, bars, meter):
    # K.K. Y2K Jungle (160 BPM fast breakbeat chops + slow Rhodes)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        # Fast break chops
        s.kick(t_bar, amp=0.25)
        s.snare_acoustic(t_bar + beat, amp=0.16)
        s.snare_acoustic(t_bar + 1.75 * beat, amp=0.12)
        s.kick(t_bar + 2.5 * beat, amp=0.22)
        s.snare_acoustic(t_bar + 3 * beat, amp=0.18)
        # Deep sub bass
        s.sub_bass(t_bar, beat * 3.5, 36 if bar % 2 == 0 else 41, amp=0.26)
        # Dreamy floating Rhodes pad
        for n in [60, 67, 71, 74]:
            s.rhodes_ep(t_bar, beat * 3.8, n, amp=0.035)


def b_chiptune(s, bpm, beat, bars, meter):
    # K.K. Chiptune 8-Bit (Pulse waves, fast arps)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = 36 if bar % 2 == 0 else 41
        s.chiptune_pulse(t_bar, beat * 0.8, bass, duty=0.5, amp=0.18)
        s.chiptune_pulse(t_bar + 2 * beat, beat * 0.8, bass + 7, duty=0.5, amp=0.18)
        # Fast 16th arp
        arp = [60, 64, 67, 72] if bar % 2 == 0 else [65, 69, 72, 77]
        for step in range(16):
            s.chiptune_pulse(t_bar + step * 0.25 * beat, beat * 0.2, arp[step % 4], duty=0.125, amp=0.06)


def b_deep_house(s, bpm, beat, bars, meter):
    # K.K. Cozy Deep House (4-on-floor, M1 organ stabs)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        for b in range(4):
            s.kick(t_bar + b * beat, amp=0.26)
            s.shaker(t_bar + (b + 0.5) * beat, amp=0.03)
        # M1 organ stabs on offbeats
        chord = [60, 63, 67, 70] if bar % 2 == 0 else [58, 61, 65, 68]
        for n in chord:
            s.organ_m1(t_bar + 0.5 * beat, beat * 0.5, n, amp=0.06)
            s.organ_m1(t_bar + 2.5 * beat, beat * 0.5, n, amp=0.06)


def b_music_box(s, bpm, beat, bars, meter):
    # K.K. Music Box (3/4 Lullaby)
    for bar in range(bars):
        t_bar = bar * 3 * beat
        s.music_box(t_bar, beat * 2.0, 72 if bar % 2 == 0 else 74, amp=0.14)
        s.music_box(t_bar + beat, beat * 1.5, 76, amp=0.10)
        s.music_box(t_bar + 2 * beat, beat * 1.5, 79, amp=0.12)


def b_satie(s, bpm, beat, bars, meter):
    # K.K. Satie Minimalist (Sparse piano, long silences)
    chords = [[55, 59, 62, 66], [50, 57, 62, 66]] * 4
    for bar, c_notes in enumerate(chords):
        t_bar = bar * 4 * beat
        s.sub_bass(t_bar, beat * 3.5, c_notes[0] - 12, amp=0.20)
        for n in c_notes:
            s.rhodes_ep(t_bar + 0.5 * beat, beat * 3.0, n, amp=0.04)


def b_kalimba(s, bpm, beat, bars, meter):
    # K.K. Raindrop Kalimba (Polyrhythmic thumb piano)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        for step in range(8):
            s.kalimba(t_bar + step * 0.5 * beat, beat * 0.4, 72 + (step * 3) % 12, amp=0.09, pan=-0.3 if step % 2 == 0 else 0.3)
        s.water_droplet(t_bar + 1.5 * beat, amp=0.06)


def b_strings(s, bpm, beat, bars, meter):
    # K.K. Chamber Strings (Pizzicato cello + violin lead)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = 48 if bar % 2 == 0 else 43
        s.nylon_guitar(t_bar, beat * 0.8, bass, amp=0.18)
        s.nylon_guitar(t_bar + 2 * beat, beat * 0.8, bass + 7, amp=0.14)
    lead = [(0, 0.0, 72, 1.8), (0, 2.0, 76, 1.5), (1, 0.0, 74, 2.5), (2, 0.0, 71, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.11)


def b_afrobeat(s, bpm, beat, bars, meter):
    # K.K. Afrobeat (Interlocking guitars + talking drums)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        s.sub_bass(t_bar, beat * 0.8, 45, amp=0.20)
        s.sub_bass(t_bar + 1.5 * beat, beat * 0.8, 48, amp=0.18)
        s.nylon_guitar(t_bar + 0.5 * beat, beat * 0.4, 69, amp=0.07)
        s.nylon_guitar(t_bar + 1.5 * beat, beat * 0.4, 72, amp=0.07)
        s.bongo(t_bar + beat, high=True, amp=0.12)
        s.bongo(t_bar + 2.5 * beat, high=False, amp=0.14)


def b_tango(s, bpm, beat, bars, meter):
    # K.K. Tango (Bandoneon habanera rhythm)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        bass = 45 if bar % 2 == 0 else 40
        s.upright_bass(t_bar, beat * 1.2, bass, amp=0.22)
        s.honky_tonk_piano(t_bar + 1.5 * beat, beat * 0.4, 60, amp=0.08)
        s.honky_tonk_piano(t_bar + 2.0 * beat, beat * 0.8, 64, amp=0.08)
        s.snare_acoustic(t_bar + 3.0 * beat, amp=0.15)
    lead = [(0, 0.0, 69, 1.2), (0, 1.5, 72, 1.0), (1, 0.0, 71, 1.8), (2, 0.0, 68, 2.2)]
    for bar, b_offset, n, dur in lead:
        s.accordion_musette((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.14)


def b_march(s, bpm, beat, bars, meter):
    # K.K. March (Piccolo & marching snare)
    for bar in range(bars):
        t_bar = bar * 4 * beat
        s.sousaphone_tuba(t_bar, beat * 0.8, 48 if bar % 2 == 0 else 43, amp=0.22)
        s.sousaphone_tuba(t_bar + 2 * beat, beat * 0.8, 55 if bar % 2 == 0 else 50, amp=0.18)
        s.snare_acoustic(t_bar + beat, amp=0.15)
        s.snare_acoustic(t_bar + 2.5 * beat, amp=0.12)
        s.snare_acoustic(t_bar + 3 * beat, amp=0.15)
    lead = [(0, 0.0, 72, 0.8), (0, 1.0, 74, 0.8), (0, 2.0, 76, 1.2), (1, 0.0, 79, 2.0), (2, 0.0, 72, 2.0)]
    for bar, b_offset, n, dur in lead:
        s.tin_whistle((bar * 4 + b_offset) * beat, dur * beat, n, amp=0.13)


# ==============================================================================
# MAIN RUNNER
# ==============================================================================

def main():
    catalog = [
        ("bossa", "K.K. Bossa", "Tropical & Island", 84, 4, 8, b_bossa),
        ("dub_reggae", "K.K. Pier Dub", "Tropical & Island", 72, 4, 8, b_dub_reggae),
        ("calypso", "K.K. Calypso / Steelpan", "Tropical & Island", 112, 4, 8, b_calypso),
        ("slack_key", "K.K. Hawaiian Slack Key", "Tropical & Island", 80, 4, 8, b_slack_key),
        ("mambo", "K.K. Mambo / Son Cubano", "Tropical & Island", 105, 4, 8, b_mambo),
        ("surf_rock", "K.K. Surf Rock (60s Twang)", "Vintage & Retro", 140, 4, 8, b_surf_rock),
        ("ragtime", "K.K. Ragtime / Stride Pier", "Vintage & Retro", 100, 4, 8, b_ragtime),
        ("western", "K.K. Western (Morricone)", "Vintage & Retro", 86, 4, 8, b_western),
        ("second_line", "K.K. New Orleans Second Line", "Vintage & Retro", 96, 4, 8, b_second_line),
        ("cool_jazz", "K.K. Cool Jazz / Neo-Noir", "Vintage & Retro", 64, 4, 8, b_cool_jazz),
        ("musette", "K.K. Musette (French Waltz)", "Maritime & Folk", 130, 3, 8, b_musette),
        ("sea_shanty", "K.K. Sea Shanty / Celtic", "Maritime & Folk", 88, 3, 8, b_sea_shanty),
        ("bluegrass", "K.K. Bluegrass / Country Pier", "Maritime & Folk", 116, 4, 8, b_bluegrass),
        ("flamenco", "K.K. Flamenco Harbor", "Maritime & Folk", 92, 4, 8, b_flamenco),
        ("city_pop", "K.K. City Pop (80s Coastal)", "Electronic & Chill", 108, 4, 8, b_city_pop),
        ("lofi_chillhop", "K.K. Lo-Fi Chillhop", "Electronic & Chill", 78, 4, 8, b_lofi),
        ("y2k_jungle", "K.K. Y2K Jungle / Ocean Break", "Electronic & Chill", 160, 4, 8, b_jungle),
        ("chiptune", "K.K. Chiptune 8-Bit", "Electronic & Chill", 124, 4, 8, b_chiptune),
        ("deep_house", "K.K. Cozy Deep House", "Electronic & Chill", 118, 4, 8, b_deep_house),
        ("music_box", "K.K. Music Box / Lullaby", "Atmospheric & Ambient", 68, 3, 8, b_music_box),
        ("satie_ambient", "K.K. Satie Minimalist", "Atmospheric & Ambient", 52, 4, 8, b_satie),
        ("raindrop_kalimba", "K.K. Raindrop Kalimba", "Atmospheric & Ambient", 84, 4, 8, b_kalimba),
        ("chamber_strings", "K.K. Chamber / Museum", "Atmospheric & Ambient", 76, 4, 8, b_strings),
        ("afrobeat", "K.K. Afrobeat Pier", "World & Regional", 105, 4, 8, b_afrobeat),
        ("tango", "K.K. Argentine Tango", "World & Regional", 116, 4, 8, b_tango),
        ("march", "K.K. March / Harbor Stroll", "World & Regional", 104, 4, 8, b_march),
    ]

    print(f"Rendering all {len(catalog)} Animal Crossing / K.K. Genre Prototypes...")
    results = []
    for slug, title, category, bpm, meter, bars, fn in catalog:
        info = make_track(slug, title, category, bpm, meter, bars, fn)
        results.append(info)
        print(f"  [✓] {slug:18} -> {info['title']} ({info['bpm']} BPM, {info['duration']})")

    meta_path = OUT_DIR / "kk_catalog.json"
    meta_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved metadata to {meta_path}")


if __name__ == "__main__":
    main()
