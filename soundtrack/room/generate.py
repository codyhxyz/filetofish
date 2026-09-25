"""Generate soundtrack takes with ROOM (solo363614/ROOM-v2 on Hugging Face).

ROOM writes an audio track from a prompt, splits it into stems and transcribes
each stem to MIDI. We keep the MIDI; `import.mjs` turns it into the note events
`src/music.js` plays through the SoundFont bank. Audio is saved next to the MIDI
for listening but is gitignored.

    pip install gradio_client
    python3 soundtrack/room/generate.py                 # every slot, `takes` each
    python3 soundtrack/room/generate.py day night -n 1  # just these slots

HF_TOKEN in the environment is passed through; ZeroGPU quota is per account.
Seeds are derived from the slug, so a rerun asks for the same takes.
"""

import argparse
import json
import math
import os
import shutil
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
TAKES = HERE / "takes"


def seconds_for(session):
    # One bar of slack either side: transcription loses the first attack and
    # the model tends to ritardando into its ending.
    bars = session["bars"] + 2
    return max(10, min(300, math.ceil(bars * session["meter"] * 60 / session["bpm"])))


def seed_for(slug, take):
    return (zlib.crc32(slug.encode()) + take * 7919) % 2_000_000_000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("slugs", nargs="*")
    parser.add_argument("-n", "--takes", type=int)
    parser.add_argument("--force", action="store_true", help="regenerate takes that already exist")
    args = parser.parse_args()

    config = json.loads((HERE / "sessions.json").read_text())
    sessions = [s for s in config["sessions"] if not args.slugs or s["slug"] in args.slugs]
    if not sessions:
        sys.exit(f"no session matches {args.slugs}")

    from gradio_client import Client

    client = Client(config["space"], token=os.environ.get("HF_TOKEN"))
    for session in sessions:
        for take in range(args.takes or config["takes"]):
            seed = seed_for(session["slug"], take)
            out = TAKES / session["slug"] / f"take-{take + 1}-seed{seed}"
            if out.exists() and not args.force:
                print(f"skip {out.relative_to(HERE)}")
                continue
            duration = seconds_for(session)
            print(f"{session['slug']} take {take + 1}: {duration}s seed {seed}", flush=True)
            audio, files, info = client.predict(
                prompt=session["prompt"],
                outputs_select=["Stems", "MIDI"],
                duration=duration,
                seed=seed,
                steps=config["steps"],
                guidance=config["guidance"],
                api_name=config["api"],
            )
            out.mkdir(parents=True, exist_ok=True)
            for path in [audio, *(files or [])]:
                if path:
                    shutil.copy(path, out / Path(path).name)
            (out / "take.json").write_text(json.dumps({
                "slug": session["slug"],
                "prompt": session["prompt"],
                "bpm": session["bpm"],
                "meter": session["meter"],
                "duration": duration,
                "seed": seed,
                "steps": config["steps"],
                "guidance": config["guidance"],
                "info": info,
                "files": sorted(p.name for p in out.iterdir() if p.name != "take.json"),
            }, indent=2) + "\n")
            print(f"  -> {out.relative_to(HERE)}", flush=True)


if __name__ == "__main__":
    main()
