const PITCHES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteToMidi(note) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  if (!match) throw new Error(`Invalid note: ${note}`);
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + PITCHES[match[1]] + accidental;
}

export function midiToName(midi) {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function groupPhrases(track, events, maxBars = 8) {
  const runs = [];
  let start = 0;
  while (start < track.chords.length) {
    const layer = track.chords[start].layer || "full";
    let end = start + 1;
    while (end < track.chords.length && (track.chords[end].layer || "full") === layer) end++;
    for (let split = start; split < end; split += maxBars) {
      const splitEnd = Math.min(end, split + maxBars);
      const counts = { bass: 0, chords: 0, lead: 0 };
      for (const event of events) {
        const bar = Math.floor(event.beat / track.meter);
        if (bar >= split && bar < splitEnd) counts[event.channel]++;
      }
      runs.push({
        startBar: split,
        endBar: splitEnd,
        bars: splitEnd - split,
        layer,
        counts,
        channels: Object.keys(counts).filter(channel => counts[channel] > 0),
      });
    }
    start = end;
  }
  return runs.map((phrase, index) => ({ ...phrase, label: String.fromCharCode(65 + index) }));
}
