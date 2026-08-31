/* SoundFont-driven dynamic Animal Crossing-style background music engine for FiletoFish.
   Uses the warm MusyngKite acoustic soundbank with multi-section 32-bar arrangements,
   gradual smooth fade-in, instant hotswapping, and gameplay ducking. */

import Soundfont from "soundfont-player";

export const TRACKS = [
  {
    slug: "day",
    title: "Day",
    hours: "11:00-17:00",
    bpm: 92,
    swing: 0.62,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "acoustic_guitar_nylon", lead: "flute" },
    // 32-Bar Progressive Form
    chords: [
      // Section 1: Intro Groove (Bars 0-7)
      { bass: "C2", notes: ["E4", "G4", "B4", "D5"], layer: "chords" },
      { bass: "A1", notes: ["Db4", "E4", "G4", "Bb4"], layer: "chords" },
      { bass: "D2", notes: ["F4", "A4", "C5", "E5"], layer: "chords" },
      { bass: "G1", notes: ["E4", "F4", "B4", "D5"], layer: "chords" },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"], layer: "chords" },
      { bass: "A1", notes: ["Db4", "G4", "A4", "E5"], layer: "chords" },
      { bass: "D2", notes: ["F4", "A4", "C5", "E5"], layer: "chords" },
      { bass: "G1", notes: ["F4", "B4", "D5", "G5"], layer: "chords" },

      // Section 2: Melodic Theme (Bars 8-15)
      { bass: "C2", notes: ["E4", "G4", "B4", "D5"], layer: "full" },
      { bass: "A1", notes: ["Db4", "E4", "G4", "Bb4"], layer: "full" },
      { bass: "D2", notes: ["F4", "A4", "C5", "E5"], layer: "full" },
      { bass: "G1", notes: ["E4", "F4", "B4", "D5"], layer: "full" },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"], layer: "full" },
      { bass: "A1", notes: ["Db4", "G4", "A4", "E5"], layer: "full" },
      { bass: "F1", notes: ["A4", "C5", "E5", "G5"], layer: "full" },
      { bass: "F1", notes: ["Ab4", "C5", "D5", "G5"], layer: "full" },

      // Section 3: Full Harmonic Warmth & Reharmonization (Bars 16-23)
      { bass: "C2", notes: ["G4", "B4", "D5", "E5"], layer: "full" },
      { bass: "A1", notes: ["G4", "Bb4", "Db5", "E5"], layer: "full" },
      { bass: "D2", notes: ["A4", "C5", "E5", "F5"], layer: "full" },
      { bass: "G1", notes: ["F4", "B4", "D5", "E5"], layer: "full" },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"], layer: "full" },
      { bass: "A1", notes: ["G4", "A4", "Db5", "E5"], layer: "full" },
      { bass: "F1", notes: ["A4", "C5", "E5", "G5"], layer: "full" },
      { bass: "F1", notes: ["Ab4", "C5", "D5", "G5"], layer: "full" },

      // Section 4: Breakdown Solo Outro (Bars 24-31)
      { bass: "C2", notes: ["E4", "G4", "C5"], layer: "solo" },
      { bass: "A1", notes: ["E4", "G4", "A4"], layer: "solo" },
      { bass: "D2", notes: ["F4", "A4", "D5"], layer: "solo" },
      { bass: "G1", notes: ["F4", "B4", "D5"], layer: "solo" },
      { bass: "E2", notes: ["G4", "B4", "E5"], layer: "solo" },
      { bass: "A1", notes: ["G4", "Db5", "E5"], layer: "solo" },
      { bass: "D2", notes: ["F4", "A4", "C5"], layer: "solo" },
      { bass: "G1", notes: ["F4", "B4", "D5"], layer: "solo" }
    ],
    melody: [
      // Theme in Section 2 (Bars 8-15)
      { bar: 8, b: 0.0, note: "E5", dur: 0.8, vel: 0.8 },
      { bar: 8, b: 1.0, note: "G5", dur: 0.6, vel: 0.7 },
      { bar: 8, b: 2.0, note: "D5", dur: 0.8, vel: 0.8 },
      { bar: 8, b: 3.0, note: "C5", dur: 1.8, vel: 0.9 },
      { bar: 9, b: 2.5, note: "B4", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 9, b: 3.0, note: "C5", dur: 0.9, vel: 0.7 },
      { bar: 11, b: 2.5, note: "D5", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 11, b: 3.0, note: "E5", dur: 0.7, vel: 0.8 },
      { bar: 12, b: 0.0, note: "G5", dur: 0.8, vel: 0.8 },
      { bar: 12, b: 1.0, note: "A5", dur: 0.6, vel: 0.7 },
      { bar: 12, b: 2.0, note: "B5", dur: 1.2, vel: 0.9 },
      { bar: 13, b: 0.5, note: "A5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 13, b: 1.5, note: "G5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 13, b: 2.5, note: "E5", dur: 1.6, vel: 0.8, isSwung: true },
      { bar: 14, b: 0.0, note: "E5", dur: 1.2, vel: 0.8 },
      { bar: 14, b: 2.0, note: "F5", dur: 0.8, vel: 0.7 },
      { bar: 15, b: 0.0, note: "F5", dur: 1.0, vel: 0.7 },
      { bar: 15, b: 2.0, note: "Eb5", dur: 1.5, vel: 0.9 },

      // High Variation in Section 3 (Bars 16-23)
      { bar: 16, b: 0.0, note: "G5", dur: 1.2, vel: 0.85 },
      { bar: 16, b: 2.0, note: "B5", dur: 0.8, vel: 0.75 },
      { bar: 17, b: 0.0, note: "A5", dur: 1.8, vel: 0.85 },
      { bar: 18, b: 0.5, note: "F5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 18, b: 1.5, note: "E5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 18, b: 2.5, note: "D5", dur: 1.2, vel: 0.8, isSwung: true },
      { bar: 20, b: 0.0, note: "E5", dur: 1.0, vel: 0.8 },
      { bar: 20, b: 2.0, note: "G5", dur: 1.2, vel: 0.8 },
      { bar: 21, b: 1.0, note: "A5", dur: 1.5, vel: 0.85 },
      { bar: 22, b: 0.0, note: "C6", dur: 1.5, vel: 0.9 },
      { bar: 23, b: 0.0, note: "B5", dur: 2.0, vel: 0.85 },

      // Quiet Solitary Lick in Section 4 (Bars 24-31)
      { bar: 24, b: 0.0, note: "E5", dur: 2.0, vel: 0.7 },
      { bar: 26, b: 0.0, note: "D5", dur: 2.5, vel: 0.7 },
      { bar: 28, b: 0.0, note: "B4", dur: 2.0, vel: 0.65 },
      { bar: 30, b: 0.0, note: "C5", dur: 3.0, vel: 0.75 }
    ]
  },

  {
    slug: "sunset",
    title: "Sunset",
    hours: "17:00-20:00",
    bpm: 76,
    swing: 0.58,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "electric_piano_1", lead: "vibraphone" },
    chords: [
      { bass: "F1", notes: ["A4", "C5", "E5", "G5"], layer: "chords" },
      { bass: "D2", notes: ["F#4", "C5", "D5", "F#5"], layer: "chords" },
      { bass: "G1", notes: ["Bb4", "D5", "F5", "A5"], layer: "chords" },
      { bass: "C2", notes: ["Bb4", "D5", "E5", "A5"], layer: "chords" },
      { bass: "A1", notes: ["C5", "E5", "G5", "C6"], layer: "full" },
      { bass: "D2", notes: ["C5", "F#5", "A5", "D6"], layer: "full" },
      { bass: "Bb1", notes: ["D5", "F5", "A5", "D6"], layer: "full" },
      { bass: "Bb1", notes: ["Db5", "F5", "Ab5", "Db6"], layer: "full" },

      { bass: "F1", notes: ["A4", "C5", "E5", "G5"], layer: "full" },
      { bass: "D2", notes: ["F#4", "C5", "D5", "F#5"], layer: "full" },
      { bass: "G1", notes: ["Bb4", "D5", "F5", "A5"], layer: "full" },
      { bass: "C2", notes: ["Bb4", "D5", "E5", "A5"], layer: "full" },
      { bass: "A1", notes: ["C5", "E5", "G5", "C6"], layer: "full" },
      { bass: "D2", notes: ["C5", "F#5", "A5", "D6"], layer: "full" },
      { bass: "Bb1", notes: ["D5", "F5", "A5", "D6"], layer: "full" },
      { bass: "Bb1", notes: ["Db5", "F5", "Ab5", "Db6"], layer: "full" }
    ],
    melody: [
      { bar: 4, b: 0.0, note: "A4", dur: 1.8, vel: 0.8 },
      { bar: 4, b: 2.0, note: "C5", dur: 1.0, vel: 0.7 },
      { bar: 5, b: 0.0, note: "G4", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 2.0, note: "F4", dur: 1.5, vel: 0.7 },
      { bar: 7, b: 2.0, note: "G4", dur: 1.0, vel: 0.7 },
      { bar: 7, b: 3.0, note: "A4", dur: 1.0, vel: 0.8 },
      { bar: 8, b: 0.0, note: "C5", dur: 1.8, vel: 0.8 },
      { bar: 8, b: 2.0, note: "E5", dur: 1.2, vel: 0.9 },
      { bar: 9, b: 0.5, note: "D5", dur: 1.5, vel: 0.8 },
      { bar: 9, b: 2.5, note: "A4", dur: 1.8, vel: 0.8 },
      { bar: 11, b: 0.0, note: "Db5", dur: 2.0, vel: 0.9 },
      { bar: 12, b: 0.0, note: "C5", dur: 2.5, vel: 0.8 }
    ]
  },

  {
    slug: "night",
    title: "Night",
    hours: "20:00-00:00",
    bpm: 66,
    swing: 0.56,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "electric_piano_1", lead: "vibraphone" },
    chords: [
      { bass: "E1", notes: ["G#4", "B4", "D#5", "G#5"], layer: "chords" },
      { bass: "C#2", notes: ["G#4", "B4", "E5", "G#5"], layer: "chords" },
      { bass: "F#1", notes: ["A4", "C#5", "E5", "A5"], layer: "chords" },
      { bass: "B1", notes: ["A4", "D#5", "F#5", "A5"], layer: "chords" },
      { bass: "G#1", notes: ["B4", "D#5", "G#5", "B5"], layer: "full" },
      { bass: "C#2", notes: ["B4", "E5", "G#5", "C#6"], layer: "full" },
      { bass: "A1", notes: ["C#5", "E5", "G#5", "C#6"], layer: "full" },
      { bass: "A1", notes: ["C5", "E5", "A5", "C6"], layer: "full" },

      { bass: "E1", notes: ["G#4", "B4", "D#5", "G#5"], layer: "full" },
      { bass: "C#2", notes: ["G#4", "B4", "E5", "G#5"], layer: "full" },
      { bass: "F#1", notes: ["A4", "C#5", "E5", "A5"], layer: "full" },
      { bass: "B1", notes: ["A4", "D#5", "F#5", "A5"], layer: "full" },
      { bass: "E1", notes: ["G#4", "B4", "E5", "G#5"], layer: "solo" },
      { bass: "C#2", notes: ["G#4", "B4", "E5"], layer: "solo" },
      { bass: "A1", notes: ["C#5", "E5", "A5"], layer: "solo" },
      { bass: "E1", notes: ["G#4", "B4", "E5"], layer: "solo" }
    ],
    melody: [
      { bar: 4, b: 0.0, note: "D#5", dur: 1.8, vel: 0.8 },
      { bar: 4, b: 2.0, note: "F#5", dur: 1.2, vel: 0.7 },
      { bar: 5, b: 0.0, note: "C#5", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 2.5, note: "B4", dur: 1.5, vel: 0.7 },
      { bar: 7, b: 2.0, note: "C#5", dur: 1.0, vel: 0.7 },
      { bar: 7, b: 3.0, note: "D#5", dur: 1.0, vel: 0.8 },
      { bar: 8, b: 0.0, note: "F#5", dur: 2.0, vel: 0.8 },
      { bar: 9, b: 1.0, note: "F#5", dur: 1.8, vel: 0.8 },
      { bar: 11, b: 0.0, note: "C5", dur: 2.2, vel: 0.9 },
      { bar: 12, b: 0.0, note: "B4", dur: 3.0, vel: 0.8 }
    ]
  },

  {
    slug: "late_night",
    title: "Late Night",
    hours: "00:00-05:00",
    bpm: 56,
    swing: 0.50,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "acoustic_grand_piano", lead: "music_box" },
    chords: [
      { bass: "B1", notes: ["D4", "F#4", "A4", "D5"], layer: "chords" },
      { bass: "B1", notes: ["D4", "F#4", "A4", "D5"], layer: "chords" },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"], layer: "chords" },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"], layer: "chords" },
      { bass: "A1", notes: ["C#4", "E4", "G4", "C#5"], layer: "full" },
      { bass: "D2", notes: ["F#4", "A4", "C#5", "F#5"], layer: "full" },
      { bass: "G1", notes: ["B4", "D5", "F#5", "B5"], layer: "full" },
      { bass: "F#1", notes: ["A#4", "C#5", "E5", "A#5"], layer: "full" },

      { bass: "B1", notes: ["D4", "F#4", "B4"], layer: "solo" },
      { bass: "B1", notes: ["D4", "F#4", "B4"], layer: "solo" },
      { bass: "E2", notes: ["G4", "B4", "E5"], layer: "solo" },
      { bass: "F#1", notes: ["A#4", "C#5", "F#5"], layer: "solo" }
    ],
    melody: [
      { bar: 2, b: 0.0, note: "B4", dur: 2.0, vel: 0.7 },
      { bar: 3, b: 1.0, note: "D5", dur: 2.0, vel: 0.8 },
      { bar: 3, b: 3.0, note: "C#5", dur: 2.0, vel: 0.7 },
      { bar: 4, b: 0.0, note: "A4", dur: 2.5, vel: 0.8 },
      { bar: 5, b: 1.0, note: "C#5", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 3.0, note: "B4", dur: 2.0, vel: 0.7 },
      { bar: 7, b: 1.0, note: "A#4", dur: 2.5, vel: 0.9 },
      { bar: 8, b: 0.0, note: "B4", dur: 3.5, vel: 0.8 }
    ]
  },

  {
    slug: "dawn",
    title: "Dawn",
    hours: "05:00-08:00",
    bpm: 78,
    swing: 0.50,
    meter: 3,
    defaults: { bass: "acoustic_bass", chords: "acoustic_guitar_nylon", lead: "flute" },
    chords: [
      { bass: "D2", notes: ["F#4", "A4", "C#5"], layer: "chords" },
      { bass: "B1", notes: ["D4", "F#4", "A4"], layer: "chords" },
      { bass: "E2", notes: ["G4", "B4", "D5"], layer: "chords" },
      { bass: "A1", notes: ["G4", "C#5", "E5"], layer: "chords" },
      { bass: "F#1", notes: ["A4", "C#5", "E5"], layer: "full" },
      { bass: "B1", notes: ["D#4", "A4", "B4"], layer: "full" },
      { bass: "G1", notes: ["Bb4", "D5", "G5"], layer: "full" },
      { bass: "D2", notes: ["F#4", "A4", "D5"], layer: "full" },

      { bass: "D2", notes: ["F#4", "A4", "D5"], layer: "solo" },
      { bass: "B1", notes: ["D4", "F#4", "A4"], layer: "solo" },
      { bass: "E2", notes: ["G4", "B4", "D5"], layer: "solo" },
      { bass: "A1", notes: ["G4", "C#5", "E5"], layer: "solo" }
    ],
    melody: [
      { bar: 4, b: 0.0, note: "D5", dur: 1.8, vel: 0.8 },
      { bar: 4, b: 2.0, note: "F#5", dur: 1.0, vel: 0.7 },
      { bar: 5, b: 0.0, note: "E5", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 2.0, note: "B4", dur: 1.2, vel: 0.6 },
      { bar: 6, b: 0.0, note: "Eb5", dur: 2.0, vel: 0.9 },
      { bar: 7, b: 0.0, note: "D5", dur: 2.5, vel: 0.8 }
    ]
  },

  {
    slug: "morning",
    title: "Morning",
    hours: "08:00-11:00",
    bpm: 98,
    swing: 0.64,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "marimba", lead: "accordion" },
    chords: [
      { bass: "G1", notes: ["B4", "D5", "F#5", "A5"], layer: "chords" },
      { bass: "E2", notes: ["G#4", "D5", "E5", "G#5"], layer: "chords" },
      { bass: "A1", notes: ["C5", "E5", "G5", "B5"], layer: "chords" },
      { bass: "D2", notes: ["C5", "E5", "F#5", "B5"], layer: "chords" },
      { bass: "B1", notes: ["D5", "F#5", "A5", "D6"], layer: "full" },
      { bass: "E2", notes: ["D5", "G#5", "B5", "E6"], layer: "full" },
      { bass: "C2", notes: ["E5", "G5", "B5", "E6"], layer: "full" },
      { bass: "C2", notes: ["Eb5", "G5", "Bb5", "Eb6"], layer: "full" },

      { bass: "G1", notes: ["B4", "D5", "G5"], layer: "solo" },
      { bass: "E2", notes: ["G#4", "B4", "E5"], layer: "solo" },
      { bass: "A1", notes: ["C5", "E5", "A5"], layer: "solo" },
      { bass: "D2", notes: ["C5", "F#5", "A5"], layer: "solo" }
    ],
    melody: [
      { bar: 4, b: 0.0, note: "B4", dur: 0.8, vel: 0.8 },
      { bar: 4, b: 1.0, note: "D5", dur: 0.6, vel: 0.7 },
      { bar: 4, b: 2.0, note: "A4", dur: 0.8, vel: 0.8 },
      { bar: 4, b: 3.0, note: "G4", dur: 1.8, vel: 0.9 },
      { bar: 5, b: 2.5, note: "F#4", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 5, b: 3.0, note: "G4", dur: 0.9, vel: 0.7 },
      { bar: 7, b: 0.0, note: "Bb4", dur: 1.8, vel: 0.9 },
      { bar: 8, b: 0.0, note: "G4", dur: 2.5, vel: 0.8 }
    ]
  }
];

let AC = null, BUS = null, MASTER_FADE = null, DUCK_GAIN = null;
let musicInitialized = false;
let trackRequest = 0;
let currentTrackIndex = 0;
let isRadioManual = false;
let isPlaying = false;
let isSoundOn = true;

const SOUNDFONT_BANK = "MusngKite"; // The warm acoustic soundbank!
const instrumentCache = new Map();
const channels = { bass: null, chords: null, lead: null };
const activeNodes = new Set();

let schedulerTimer = null;
let timelineEvents = [];
let transportStartTime = 0;
let nextEventIndex = 0;
let loopCount = 0;
let playbackGen = 0;

function expandTrack(track) {
  if (track.chords.length < 32) {
    const base = track.chords;
    track.chords = Array.from({ length: 32 }, (_, i) => ({
      ...base[i % base.length],
      layer: i < 4 ? "bass" : i < 8 ? "chords" : i < 16 ? "full" : i < 20 ? "lead" : i < 28 ? "full" : "outro"
    }));
    const baseBars = Math.max(...track.melody.map(m => m.bar), 0) + 1;
    const baseMelody = track.melody;
    track.melody = Array.from({ length: 32 }, (_, bar) => {
      const offset = Math.floor(bar / baseBars) * baseBars;
      const sourceBar = bar % baseBars;
      return baseMelody
        .filter(m => m.bar === sourceBar)
        .map(m => ({ ...m, bar, vel: m.vel * (bar < 8 || bar >= 24 ? 0.82 : 1) }));
    }).flat();
  }
  return track;
}

function compileTimeline(track) {
  expandTrack(track);
  const events = [];
  const numBars = track.chords.length;
  const beatsPerBar = track.meter;

  for (let bar = 0; bar < numBars; bar++) {
    const barStart = bar * beatsPerBar;
    const c = track.chords[bar];

    // The arrangement breathes: bass anchors the intro/outro, then drops out briefly.
    if (c.layer !== "lead") {
      events.push({ channel: "bass", beat: barStart + 0.0, note: c.bass, durBeats: 1.4, gain: c.layer === "bass" || c.layer === "outro" ? 0.72 : 0.85 });
      if (beatsPerBar === 4 && c.layer !== "bass") {
        const bassOct2 = c.bass.replace(/\d/, d => parseInt(d) + 1);
        events.push({ channel: "bass", beat: barStart + 2.0, note: bassOct2, durBeats: 1.2, gain: 0.65 });
      }
    }

    // Chords enter after the intro, disappear for the breakdown, and return.
    if (["chords", "full"].includes(c.layer)) {
      if (beatsPerBar === 4) {
        c.notes.forEach(n => {
          events.push({ channel: "chords", beat: barStart + 0.5, note: n, durBeats: 1.0, gain: 0.35, isSwung: true });
          events.push({ channel: "chords", beat: barStart + 2.5, note: n, durBeats: 0.8, gain: 0.30, isSwung: true });
        });
      } else {
        // 3/4 Waltz
        c.notes.forEach(n => {
          events.push({ channel: "chords", beat: barStart + 1.0, note: n, durBeats: 0.8, gain: 0.35 });
          events.push({ channel: "chords", beat: barStart + 2.0, note: n, durBeats: 0.8, gain: 0.30 });
        });
      }
    }
  }

  track.melody.forEach(m => {
    events.push({
      channel: "lead",
      beat: m.bar * beatsPerBar + m.b,
      note: m.note,
      durBeats: m.dur,
      gain: m.vel * 0.70,
      isSwung: !!m.isSwung
    });
  });

  events.sort((a, b) => a.beat - b.beat);
  return events;
}

function calculateSwungBeatTime(beatFloat, track) {
  const beatsPerBar = track.meter;
  const bar = Math.floor(beatFloat / beatsPerBar);
  const beatInBar = beatFloat - bar * beatsPerBar;
  const whole = Math.floor(beatInBar);
  const frac = beatInBar - whole;
  let offset = frac;
  if (beatsPerBar === 4 && Math.abs(frac - 0.5) < 0.05) {
    offset = track.swing;
  }
  return (bar * beatsPerBar + whole + offset);
}

async function getOrLoadInstrument(instName) {
  const key = `${SOUNDFONT_BANK}:${instName}`;
  if (instrumentCache.has(key)) {
    return instrumentCache.get(key);
  }
  const inst = await Soundfont.instrument(AC, instName, {
    soundfont: SOUNDFONT_BANK,
    destination: DUCK_GAIN || BUS
  });
  instrumentCache.set(key, inst);
  return inst;
}

export function initMusic(audioContext, masterDestination, soundEnabled = true) {
  AC = audioContext;
  isSoundOn = soundEnabled;

  if (!BUS) {
    BUS = AC.createGain();
    MASTER_FADE = AC.createGain();
    DUCK_GAIN = AC.createGain();

    // Start with gentle volume immediately and ramp smoothly up over 10s
    MASTER_FADE.gain.setValueAtTime(0.06, AC.currentTime);
    MASTER_FADE.gain.linearRampToValueAtTime(0.38, AC.currentTime + 10.0);

    DUCK_GAIN.gain.setValueAtTime(1.0, AC.currentTime);

    DUCK_GAIN.connect(MASTER_FADE);
    MASTER_FADE.connect(BUS);
    BUS.connect(masterDestination || AC.destination);
  }

  // Initialization is idempotent: radio clicks must not reset the selected track.
  if (!musicInitialized) {
    musicInitialized = true;
    const hr = new Date().getHours();
    const idx = getTrackIndexForHour(hr);
    setMusicTrack(idx >= 0 ? idx : 0);
  }
}

export async function setMusicTrack(indexOrSlug) {
  let idx = typeof indexOrSlug === "number" ? indexOrSlug : TRACKS.findIndex(t => t.slug === indexOrSlug);
  if (idx < 0) idx = 0;
  if (idx >= TRACKS.length) idx = 0;

  const request = ++trackRequest;
  currentTrackIndex = idx;
  const track = TRACKS[idx];
  timelineEvents = compileTimeline(track);

  // Stop previous note instances immediately; the new bank loads off-clock.
  const wasPlaying = isPlaying;
  stopPlayback();

  // Load instruments
  try {
    const [b, c, l] = await Promise.all([
      getOrLoadInstrument(track.defaults.bass),
      getOrLoadInstrument(track.defaults.chords),
      getOrLoadInstrument(track.defaults.lead)
    ]);
    if (request !== trackRequest) return track;
    channels.bass = b;
    channels.chords = c;
    channels.lead = l;
  } catch (e) {}

  if (request === trackRequest && (wasPlaying || !isPlaying) && isSoundOn && AC && AC.state !== "suspended") {
    startPlayback();
  }

  return track;
}

export function nextMusicTrack() {
  isRadioManual = true;
  const nextIdx = (currentTrackIndex + 1) % TRACKS.length;
  setMusicTrack(nextIdx);
  return TRACKS[nextIdx];
}

export function getMusicTrack() {
  return TRACKS[currentTrackIndex];
}

export function getTrackIndexForHour(hour) {
  if (hour >= 5 && hour < 8) return TRACKS.findIndex(t => t.slug === "dawn");
  if (hour >= 8 && hour < 11) return TRACKS.findIndex(t => t.slug === "morning");
  if (hour >= 11 && hour < 17) return TRACKS.findIndex(t => t.slug === "day");
  if (hour >= 17 && hour < 20) return TRACKS.findIndex(t => t.slug === "sunset");
  if (hour >= 20 || hour < 0) return TRACKS.findIndex(t => t.slug === "night");
  return TRACKS.findIndex(t => t.slug === "late_night");
}

export function syncMusicToTime(date, force = false) {
  if (isRadioManual && !force) return;
  const hr = date.getHours();
  const idx = getTrackIndexForHour(hr);
  if (idx >= 0 && idx !== currentTrackIndex) {
    setMusicTrack(idx);
  }
}

export function setMusicSoundOn(enabled) {
  isSoundOn = !!enabled;
  if (!isSoundOn) {
    stopPlayback();
  } else if (!isPlaying && AC && AC.state !== "suspended") {
    startPlayback();
  }
}

export function duckMusic(targetGain = 0.30, durationSec = 1.5) {
  if (!DUCK_GAIN || !AC) return;
  const now = AC.currentTime;
  DUCK_GAIN.gain.cancelScheduledValues(now);
  DUCK_GAIN.gain.setValueAtTime(DUCK_GAIN.gain.value, now);
  DUCK_GAIN.gain.linearRampToValueAtTime(targetGain, now + 0.05);
  DUCK_GAIN.gain.linearRampToValueAtTime(1.0, now + durationSec);
}

function runSchedulerTick() {
  if (!isPlaying || !isSoundOn || !AC) return;

  const track = TRACKS[currentTrackIndex];
  const beatDur = 60.0 / track.bpm;
  const totalBeats = track.chords.length * track.meter;
  const loopDurationSec = totalBeats * beatDur;
  const now = AC.currentTime;
  const lookaheadSec = 0.12;

  while (true) {
    if (nextEventIndex >= timelineEvents.length) {
      nextEventIndex = 0;
      loopCount++;
    }

    const event = timelineEvents[nextEventIndex];
    if (!event) break;

    const eventSwungBeat = event.isSwung ? calculateSwungBeatTime(event.beat, track) : event.beat;
    const eventAudioTime = transportStartTime + (loopCount * loopDurationSec) + (eventSwungBeat * beatDur);

    if (eventAudioTime < now + lookaheadSec) {
      if (eventAudioTime >= now - 0.02) {
        const inst = channels[event.channel];
        if (inst) {
          try {
            const durSec = event.durBeats * beatDur;
            const node = inst.play(event.note, Math.max(now, eventAudioTime), {
              duration: durSec,
              gain: event.gain
            });
            if (node) activeNodes.add(node);
          } catch (err) {}
        }
      }
      nextEventIndex++;
    } else {
      break;
    }
  }
}

function startPlayback() {
  if (isPlaying || !isSoundOn || !AC) return;
  isPlaying = true;
  playbackGen++;
  transportStartTime = AC.currentTime + 0.05;
  nextEventIndex = 0;
  loopCount = 0;
  schedulerTimer = setInterval(runSchedulerTick, 25);
}

function stopPlayback() {
  isPlaying = false;
  playbackGen++;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  activeNodes.forEach(n => {
    try {
      if (n.stop) n.stop();
      if (n.source && n.source.stop) n.source.stop();
    } catch (e) {}
  });
  activeNodes.clear();
}
