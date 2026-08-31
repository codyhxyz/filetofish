#!/usr/bin/env python3
"""Render filetofish's MIDI-note scores with only the Python standard library.

The score in scores.json is deliberately renderer-neutral so it can later feed a
WebAudio scheduler directly. These WAVs are listening proofs, not site assets.
"""

import argparse
import json
import math
import random
import struct
import subprocess
import wave
from array import array
from pathlib import Path

HERE = Path(__file__).parent
SCORES = HERE / "scores.json"
OUT = HERE / "previews"
SR = 24_000


def load_scores():
    songs = json.loads(SCORES.read_text())["songs"]
    for song in songs:
        assert len(song["chords"]) == 16, f'{song["slug"]}: expected 16 chords'
        for chord in song["chords"]:
            assert chord["notes"] and all(0 <= n <= 127 for n in chord["notes"])
            assert 0 <= chord["bass"] <= 127
        for event in song["melody"]:
            assert 0 <= event["bar"] < 16 and 0 <= event["beat"] < 4
            assert 0 <= event["note"] <= 127 and event["durationBeats"] > 0
    return songs


def midi_hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def render(song):
    beat = 60 / song["bpm"]
    duration = 64 * beat + 2.5
    count = int(duration * SR)
    left = array("f", [0.0]) * count
    right = array("f", [0.0]) * count
    rng = random.Random(sum(map(ord, song["slug"])))
    palette = song["palette"]

    def put(i, value, pan=0):
        if 0 <= i < count:
            left[i] += value * math.sqrt((1 - pan) * 0.5)
            right[i] += value * math.sqrt((1 + pan) * 0.5)

    def tone(start, beats, note, amp, voice, pan=0):
        first = int(start * SR)
        length = min(int(beats * beat * SR), count - first)
        frequency = midi_hz(note)
        for j in range(max(0, length)):
            t = j / SR
            remaining = max(0, 1 - t / (beats * beat))
            phase = 2 * math.pi * frequency * t
            if voice in ("mallet", "marimba", "pluck"):
                decay = {"mallet": 4.3, "marimba": 5.6, "pluck": 6.8}[voice]
                env = (1 - math.exp(-t * 100)) * math.exp(-t * decay)
                value = math.sin(phase) + 0.3 * math.sin(2 * phase) * math.exp(-t * 7)
                if voice == "marimba":
                    value += 0.16 * math.sin(3 * phase) * math.exp(-t * 11)
            elif voice in ("glass", "vibe"):
                env = (1 - math.exp(-t * 70)) * math.exp(-t * (2.2 if voice == "vibe" else 1.5))
                value = math.sin(phase) + 0.24 * math.sin(3.01 * phase) + 0.08 * math.sin(5.03 * phase)
            elif voice == "ep":
                env = min(1, t / 0.035) * math.exp(-t * 2.4)
                value = math.sin(phase) + 0.22 * math.sin(2.002 * phase) + 0.08 * math.sin(4 * phase)
            elif voice == "bass":
                env = min(1, t / 0.025) * math.exp(-t * 1.7)
                value = math.sin(phase) + 0.14 * math.sin(2 * phase)
            elif voice == "pad":
                env = min(1, t / 0.22) * min(1, remaining / 0.18)
                value = math.sin(phase) + 0.1 * math.sin(2.002 * phase)
            else:
                env = min(1, t / 0.04) * min(1, remaining / 0.16) * (0.8 + 0.2 * remaining)
                vibrato = 0.002 * math.sin(2 * math.pi * 4.5 * t)
                phase = 2 * math.pi * frequency * t * (1 + vibrato)
                value = math.sin(phase) + 0.23 * math.sin(2 * phase) + 0.08 * math.sin(3 * phase)
                if voice == "bright":
                    value += 0.06 * math.sin(4 * phase)
            put(first + j, amp * env * value, pan)

    def brush(start, amp, pan):
        first = int(start * SR)
        low = 0.0
        for j in range(int(0.15 * SR)):
            raw = rng.random() * 2 - 1
            low += 0.12 * (raw - low)
            env = (1 - j / (0.15 * SR)) ** 2 * min(1, j / 70)
            put(first + j, (raw - low) * env * amp, pan)

    def droplet(start, amp=0.018):
        first = int(start * SR)
        phase = 0.0
        for j in range(int(0.18 * SR)):
            t = j / SR
            frequency = 500 * (145 / 500) ** (t / 0.18)
            phase += 2 * math.pi * frequency / SR
            put(first + j, math.sin(phase) * math.exp(-t * 18) * amp, -0.12)

    arp_beats = (0, 0.75, 1.5, 2.5, 3.25)
    for bar, chord in enumerate(song["chords"]):
        start = bar * 4 * beat
        notes = chord["notes"]
        for k, note in enumerate((notes[0], notes[len(notes) // 2], notes[-1])):
            tone(start, 4.15, note, 0.010, "pad", (k - 1) * 0.24)
        tone(start, 1.7, chord["bass"], 0.068, "bass", -0.05)
        tone(start + 2 * beat, 1.45, chord["bass"] + 7, 0.040, "bass", 0.04)
        for k, offset in enumerate(arp_beats):
            note = notes[(0, 2, 1, 3, 2)[k] % len(notes)]
            tone(start + offset * beat, 0.9, note, 0.050 if k == 0 else 0.038,
                 palette["keys"], -0.38 + k * 0.19)
        amount = palette["brush"]
        if amount:
            brush(start + beat, 0.015 * amount, -0.3)
            brush(start + 3 * beat, 0.020 * amount, 0.3)
        if bar in (0, 4, 8, 12):
            droplet(start + 0.02, 0.018 + 0.008 * amount)

    for event in song["melody"]:
        human = (rng.random() - 0.5) * 0.012
        start = (event["bar"] * 4 + event["beat"]) * beat + human
        tone(start, event["durationBeats"], event["note"], 0.052,
             palette["lead"], 0.12)

    # Quiet deterministic tide bed.
    low = 0.0
    for i in range(count):
        raw = rng.random() * 2 - 1
        low += 0.006 * (raw - low)
        tide = 0.5 + 0.5 * math.sin(2 * math.pi * i / SR / 7.3)
        noise = (low * 0.005 + (raw - low) * 0.0012) * tide
        left[i] += noise
        right[i] += noise * (0.75 + 0.25 * math.sin(2 * math.pi * i / SR / 11))

    peak = max(max(map(abs, left)), max(map(abs, right)))
    gain = 0.72 / max(peak, 1e-9)
    path = OUT / f'{song["slug"]}.wav'
    with wave.open(str(path), "wb") as wav:
        wav.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        for offset in range(0, count, 4096):
            samples = []
            for l, r in zip(left[offset:offset + 4096], right[offset:offset + 4096]):
                samples.extend((int(max(-1, min(1, l * gain)) * 32767),
                                int(max(-1, min(1, r * gain)) * 32767)))
            wav.writeframesraw(struct.pack("<" + "h" * len(samples), *samples))
    print(f'{song["slug"]:10} {song["title"]!r}  {duration:5.1f}s')
    return path


def album(paths):
    target = OUT / "filetofish-ost-preview.wav"
    silence = b"\0" * (SR * 2 * 2)
    with wave.open(str(target), "wb") as out:
        out.setparams((2, 2, SR, 0, "NONE", "not compressed"))
        for i, path in enumerate(paths):
            with wave.open(str(path), "rb") as source:
                assert source.getparams()[:3] == (2, 2, SR)
                out.writeframes(source.readframes(source.getnframes()))
            if i + 1 < len(paths):
                out.writeframes(silence)
    print(f'album      {target}')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("songs", nargs="*", help="song slugs; defaults to all")
    parser.add_argument("--check", action="store_true", help="validate scores without rendering")
    parser.add_argument("--no-album", action="store_true", help="skip the combined listening file")
    parser.add_argument("--play", action="store_true", help="open the rendered album or song")
    args = parser.parse_args()
    songs = load_scores()
    if args.songs:
        wanted = set(args.songs)
        songs = [song for song in songs if song["slug"] in wanted]
        missing = wanted - {song["slug"] for song in songs}
        if missing:
            parser.error("unknown song(s): " + ", ".join(sorted(missing)))
    print(f"validated {len(songs)} score(s)")
    if args.check:
        return
    OUT.mkdir(exist_ok=True)
    paths = [render(song) for song in songs]
    listening = album(paths) if len(paths) > 1 and not args.no_album else paths[0]
    if args.play:
        subprocess.run(["open", str(listening)], check=False)


if __name__ == "__main__":
    main()
