/* SoundFont-driven dynamic Animal Crossing-style background music engine for FiletoFish.
   Plays 6 time-of-day dock suites using real multi-sampled SoundFonts (FluidR3 GM)
   with zero synthetic pitch wobbles, tight 120ms lookahead scheduling, and dynamic ducking. */

import Soundfont from "soundfont-player";

export const TRACKS = [
  {
    slug: "day",
    title: "Sunlit Bobber",
    hours: "11:00-17:00",
    bpm: 92,
    swing: 0.62,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "acoustic_guitar_nylon", lead: "flute" },
    chords: [
      { bass: "C2", notes: ["E4", "G4", "B4", "D5"] },
      { bass: "A1", notes: ["Db4", "E4", "G4", "Bb4"] },
      { bass: "D2", notes: ["F4", "A4", "C5", "E5"] },
      { bass: "G1", notes: ["E4", "F4", "B4", "D5"] },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"] },
      { bass: "A1", notes: ["Db4", "G4", "A4", "E5"] },
      { bass: "F1", notes: ["A4", "C5", "E5", "G5"] },
      { bass: "F1", notes: ["Ab4", "C5", "D5", "G5"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "E5", dur: 0.8, vel: 0.8 },
      { bar: 0, b: 1.0, note: "G5", dur: 0.6, vel: 0.7 },
      { bar: 0, b: 2.0, note: "D5", dur: 0.8, vel: 0.8 },
      { bar: 0, b: 3.0, note: "C5", dur: 1.8, vel: 0.9 },
      { bar: 1, b: 2.5, note: "B4", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 1, b: 3.0, note: "C5", dur: 0.9, vel: 0.7 },
      { bar: 3, b: 2.5, note: "D5", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 3, b: 3.0, note: "E5", dur: 0.7, vel: 0.8 },
      { bar: 4, b: 0.0, note: "G5", dur: 0.8, vel: 0.8 },
      { bar: 4, b: 1.0, note: "A5", dur: 0.6, vel: 0.7 },
      { bar: 4, b: 2.0, note: "B5", dur: 1.2, vel: 0.9 },
      { bar: 5, b: 0.5, note: "A5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 5, b: 1.5, note: "G5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 5, b: 2.5, note: "E5", dur: 1.6, vel: 0.8, isSwung: true },
      { bar: 6, b: 0.0, note: "E5", dur: 1.2, vel: 0.8 },
      { bar: 6, b: 2.0, note: "F5", dur: 0.8, vel: 0.7 },
      { bar: 7, b: 0.0, note: "F5", dur: 1.0, vel: 0.7 },
      { bar: 7, b: 2.0, note: "Eb5", dur: 1.5, vel: 0.9 }
    ]
  },

  {
    slug: "sunset",
    title: "Orange Skies",
    hours: "17:00-20:00",
    bpm: 76,
    swing: 0.58,
    meter: 4,
    defaults: { bass: "fretless_bass", chords: "electric_piano_1", lead: "vibraphone" },
    chords: [
      { bass: "F1", notes: ["A4", "C5", "E5", "G5"] },
      { bass: "D2", notes: ["F#4", "C5", "D5", "F#5"] },
      { bass: "G1", notes: ["Bb4", "D5", "F5", "A5"] },
      { bass: "C2", notes: ["Bb4", "D5", "E5", "A5"] },
      { bass: "A1", notes: ["C5", "E5", "G5", "C6"] },
      { bass: "D2", notes: ["C5", "F#5", "A5", "D6"] },
      { bass: "Bb1", notes: ["D5", "F5", "A5", "D6"] },
      { bass: "Bb1", notes: ["Db5", "F5", "Ab5", "Db6"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "A4", dur: 1.8, vel: 0.8 },
      { bar: 0, b: 2.0, note: "C5", dur: 1.0, vel: 0.7 },
      { bar: 1, b: 0.0, note: "G4", dur: 2.0, vel: 0.8 },
      { bar: 1, b: 2.0, note: "F4", dur: 1.5, vel: 0.7 },
      { bar: 3, b: 2.0, note: "G4", dur: 1.0, vel: 0.7 },
      { bar: 3, b: 3.0, note: "A4", dur: 1.0, vel: 0.8 },
      { bar: 4, b: 0.0, note: "C5", dur: 1.8, vel: 0.8 },
      { bar: 4, b: 2.0, note: "E5", dur: 1.2, vel: 0.9 },
      { bar: 5, b: 0.5, note: "D5", dur: 1.5, vel: 0.8 },
      { bar: 5, b: 2.5, note: "A4", dur: 1.8, vel: 0.8 },
      { bar: 7, b: 0.0, note: "Db5", dur: 2.0, vel: 0.9 }
    ]
  },

  {
    slug: "night",
    title: "Tideglass Replies",
    hours: "20:00-00:00",
    bpm: 66,
    swing: 0.56,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "electric_piano_1", lead: "vibraphone" },
    chords: [
      { bass: "E1", notes: ["G#4", "B4", "D#5", "G#5"] },
      { bass: "C#2", notes: ["G#4", "B4", "E5", "G#5"] },
      { bass: "F#1", notes: ["A4", "C#5", "E5", "A5"] },
      { bass: "B1", notes: ["A4", "D#5", "F#5", "A5"] },
      { bass: "G#1", notes: ["B4", "D#5", "G#5", "B5"] },
      { bass: "C#2", notes: ["B4", "E5", "G#5", "C#6"] },
      { bass: "A1", notes: ["C#5", "E5", "G#5", "C#6"] },
      { bass: "A1", notes: ["C5", "E5", "A5", "C6"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "D#5", dur: 1.8, vel: 0.8 },
      { bar: 0, b: 2.0, note: "F#5", dur: 1.2, vel: 0.7 },
      { bar: 1, b: 0.0, note: "C#5", dur: 2.0, vel: 0.8 },
      { bar: 1, b: 2.5, note: "B4", dur: 1.5, vel: 0.7 },
      { bar: 3, b: 2.0, note: "C#5", dur: 1.0, vel: 0.7 },
      { bar: 3, b: 3.0, note: "D#5", dur: 1.0, vel: 0.8 },
      { bar: 4, b: 0.0, note: "F#5", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 1.0, note: "F#5", dur: 1.8, vel: 0.8 },
      { bar: 7, b: 0.0, note: "C5", dur: 2.2, vel: 0.9 }
    ]
  },

  {
    slug: "late_night",
    title: "Below the Last Buoy",
    hours: "00:00-05:00",
    bpm: 56,
    swing: 0.50,
    meter: 4,
    defaults: { bass: "acoustic_bass", chords: "acoustic_grand_piano", lead: "music_box" },
    chords: [
      { bass: "B1", notes: ["D4", "F#4", "A4", "D5"] },
      { bass: "B1", notes: ["D4", "F#4", "A4", "D5"] },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"] },
      { bass: "E2", notes: ["G4", "B4", "D5", "G5"] },
      { bass: "A1", notes: ["C#4", "E4", "G4", "C#5"] },
      { bass: "D2", notes: ["F#4", "A4", "C#5", "F#5"] },
      { bass: "G1", notes: ["B4", "D5", "F#5", "B5"] },
      { bass: "F#1", notes: ["A#4", "C#5", "E5", "A#5"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "B4", dur: 2.0, vel: 0.7 },
      { bar: 1, b: 1.0, note: "D5", dur: 2.0, vel: 0.8 },
      { bar: 1, b: 3.0, note: "C#5", dur: 2.0, vel: 0.7 },
      { bar: 4, b: 0.0, note: "A4", dur: 2.5, vel: 0.8 },
      { bar: 5, b: 1.0, note: "C#5", dur: 2.0, vel: 0.8 },
      { bar: 5, b: 3.0, note: "B4", dur: 2.0, vel: 0.7 },
      { bar: 7, b: 1.0, note: "A#4", dur: 2.5, vel: 0.9 }
    ]
  },

  {
    slug: "dawn",
    title: "The Tide Keeps Time",
    hours: "05:00-08:00",
    bpm: 78,
    swing: 0.50,
    meter: 3,
    defaults: { bass: "acoustic_bass", chords: "music_box", lead: "flute" },
    chords: [
      { bass: "D2", notes: ["F#4", "A4", "C#5"] },
      { bass: "B1", notes: ["D4", "F#4", "A4"] },
      { bass: "E2", notes: ["G4", "B4", "D5"] },
      { bass: "A1", notes: ["G4", "C#5", "E5"] },
      { bass: "F#1", notes: ["A4", "C#5", "E5"] },
      { bass: "B1", notes: ["D#4", "A4", "B4"] },
      { bass: "G1", notes: ["Bb4", "D5", "G5"] },
      { bass: "D2", notes: ["F#4", "A4", "D5"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "D5", dur: 1.8, vel: 0.8 },
      { bar: 0, b: 2.0, note: "F#5", dur: 1.0, vel: 0.7 },
      { bar: 1, b: 0.0, note: "E5", dur: 2.0, vel: 0.8 },
      { bar: 1, b: 2.0, note: "B4", dur: 1.2, vel: 0.6 },
      { bar: 3, b: 1.0, note: "D5", dur: 1.0, vel: 0.7 },
      { bar: 3, b: 2.0, note: "E5", dur: 1.0, vel: 0.8 },
      { bar: 4, b: 0.0, note: "F#5", dur: 1.8, vel: 0.8 },
      { bar: 4, b: 2.0, note: "A5", dur: 1.0, vel: 0.7 },
      { bar: 5, b: 0.0, note: "F#5", dur: 2.0, vel: 0.8 },
      { bar: 6, b: 0.0, note: "Eb5", dur: 2.0, vel: 0.9 },
      { bar: 7, b: 0.0, note: "D5", dur: 2.5, vel: 0.8 }
    ]
  },

  {
    slug: "morning",
    title: "Reeds on the Pier",
    hours: "08:00-11:00",
    bpm: 98,
    swing: 0.64,
    meter: 4,
    defaults: { bass: "slap_bass_1", chords: "marimba", lead: "accordion" },
    chords: [
      { bass: "G1", notes: ["B4", "D5", "F#5", "A5"] },
      { bass: "E2", notes: ["G#4", "D5", "E5", "G#5"] },
      { bass: "A1", notes: ["C5", "E5", "G5", "B5"] },
      { bass: "D2", notes: ["C5", "E5", "F#5", "B5"] },
      { bass: "B1", notes: ["D5", "F#5", "A5", "D6"] },
      { bass: "E2", notes: ["D5", "G#5", "B5", "E6"] },
      { bass: "C2", notes: ["E5", "G5", "B5", "E6"] },
      { bass: "C2", notes: ["Eb5", "G5", "Bb5", "Eb6"] }
    ],
    melody: [
      { bar: 0, b: 0.0, note: "B4", dur: 0.8, vel: 0.8 },
      { bar: 0, b: 1.0, note: "D5", dur: 0.6, vel: 0.7 },
      { bar: 0, b: 2.0, note: "A4", dur: 0.8, vel: 0.8 },
      { bar: 0, b: 3.0, note: "G4", dur: 1.8, vel: 0.9 },
      { bar: 1, b: 2.5, note: "F#4", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 1, b: 3.0, note: "G4", dur: 0.9, vel: 0.7 },
      { bar: 3, b: 2.5, note: "A4", dur: 0.5, vel: 0.6, isSwung: true },
      { bar: 3, b: 3.0, note: "B4", dur: 0.7, vel: 0.8 },
      { bar: 4, b: 0.0, note: "D5", dur: 0.8, vel: 0.8 },
      { bar: 4, b: 1.0, note: "E5", dur: 0.6, vel: 0.7 },
      { bar: 4, b: 2.0, note: "F#5", dur: 1.2, vel: 0.9 },
      { bar: 5, b: 0.5, note: "E5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 5, b: 1.5, note: "D5", dur: 0.6, vel: 0.7, isSwung: true },
      { bar: 5, b: 2.5, note: "B4", dur: 1.6, vel: 0.8, isSwung: true },
      { bar: 7, b: 0.0, note: "Bb4", dur: 1.8, vel: 0.9 }
    ]
  }
];

let AC = null, BUS = null, DUCK_GAIN = null;
let currentTrackIndex = 0;
let isRadioManual = false;
let isPlaying = false;
let isSoundOn = true;

const instrumentCache = new Map();
const channels = { bass: null, chords: null, lead: null };
const activeNodes = new Set();

let schedulerTimer = null;
let timelineEvents = [];
let transportStartTime = 0;
let nextEventIndex = 0;
let loopCount = 0;
let playbackGen = 0;

function compileTimeline(track) {
  const events = [];
  const numBars = track.chords.length;
  const beatsPerBar = track.meter;

  for (let bar = 0; bar < numBars; bar++) {
    const barStart = bar * beatsPerBar;
    const c = track.chords[bar];

    // Bass 1
    events.push({ channel: "bass", beat: barStart + 0.0, note: c.bass, durBeats: 1.5, gain: 0.85 });
    // Bass 2
    if (beatsPerBar === 4) {
      const bassOct2 = c.bass.replace(/\d/, d => parseInt(d) + 1);
      events.push({ channel: "bass", beat: barStart + 2.0, note: bassOct2, durBeats: 1.2, gain: 0.65 });
    }

    // Chords
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
  const key = `FluidR3_GM:${instName}`;
  if (instrumentCache.has(key)) {
    return instrumentCache.get(key);
  }
  const inst = await Soundfont.instrument(AC, instName, {
    soundfont: "FluidR3_GM",
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
    DUCK_GAIN = AC.createGain();
    DUCK_GAIN.gain.setValueAtTime(0.70, AC.currentTime);
    DUCK_GAIN.connect(BUS);
    BUS.connect(masterDestination || AC.destination);
  }

  // Preload default track
  setMusicTrack(0);
}

export async function setMusicTrack(indexOrSlug) {
  let idx = typeof indexOrSlug === "number" ? indexOrSlug : TRACKS.findIndex(t => t.slug === indexOrSlug);
  if (idx < 0) idx = 0;
  if (idx >= TRACKS.length) idx = 0;

  currentTrackIndex = idx;
  const track = TRACKS[idx];
  timelineEvents = compileTimeline(track);

  // Load instruments in background
  try {
    const [b, c, l] = await Promise.all([
      getOrLoadInstrument(track.defaults.bass),
      getOrLoadInstrument(track.defaults.chords),
      getOrLoadInstrument(track.defaults.lead)
    ]);
    channels.bass = b;
    channels.chords = c;
    channels.lead = l;
  } catch (e) {
    // Graceful fallback
  }

  // Reset clock smoothly
  transportStartTime = AC ? AC.currentTime + 0.05 : 0;
  nextEventIndex = 0;
  loopCount = 0;

  if (isSoundOn && !isPlaying && AC && AC.state !== "suspended") {
    startPlayback();
  }

  return track;
}

export function nextMusicTrack() {
  isRadioManual = true;
  const nextIdx = (currentTrackIndex + 1) % TRACKS.length;
  return setMusicTrack(nextIdx);
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

export function duckMusic(targetGain = 0.25, durationSec = 1.5) {
  if (!DUCK_GAIN || !AC) return;
  const now = AC.currentTime;
  DUCK_GAIN.gain.cancelScheduledValues(now);
  DUCK_GAIN.gain.setValueAtTime(DUCK_GAIN.gain.value, now);
  DUCK_GAIN.gain.linearRampToValueAtTime(targetGain, now + 0.06);
  DUCK_GAIN.gain.linearRampToValueAtTime(0.70, now + durationSec);
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
