import {
  TRACKS, compileTimeline, initMusic, setMusicTrack, setMusicSoundOn, auditionMusicNote,
} from "./music.js";
import { groupPhrases, midiToName, noteToMidi } from "./music-analysis.mjs";

const $ = selector => document.querySelector(selector);
const CHANNELS = ["bass", "chords", "lead"];
const LAYER_NAMES = {
  bass: "bass opening", chords: "harmony", full: "full ensemble",
  lead: "lead break", solo: "bass and lead", outro: "bass outro",
};
const ROW_HEIGHT = 18;
const TOP = 24;

let track = TRACKS[0];
let events = [];
let phrases = [];
let selectedPhrase = 0;
let selectedEvent = -1;
let beatWidth = 12;
let audioContext = null;
let audioTrack = "";
let playing = false;
let playStarted = 0;
let playFrame = 0;
const visibleChannels = new Set(CHANNELS);

function words(value) {
  return value.replaceAll("_", " ");
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function prepareTrack(next) {
  track = next;
  events = compileTimeline(track).map((event, index) => ({
    ...event,
    index,
    midi: noteToMidi(event.note),
    instrument: track.defaults[event.channel],
  }));
  phrases = groupPhrases(track, events);
  selectedPhrase = 0;
  selectedEvent = -1;
}

function renderMeta() {
  const seconds = track.chords.length * track.meter * 60 / track.bpm;
  $("#meta").innerHTML = [
    [track.hours, "time slot"],
    [`${track.bpm} BPM`, "tempo"],
    [`${track.meter}/4`, "meter"],
    [`${Math.round(track.swing * 100)}%`, "swing"],
    [`${track.chords.length} bars / ${formatTime(seconds)}`, "loop"],
    [`${events.length} notes`, "scheduled"],
  ].map(([value, label]) => `<span><b>${value}</b> ${label}</span>`).join("");
}

function gridPlacement(start, bars) {
  return `grid-column:${start + 2} / span ${bars}`;
}

function renderPhrases() {
  const columns = `9rem repeat(${track.chords.length},minmax(28px,1fr))`;
  const row = (channel) => {
    const instrument = words(track.defaults[channel]);
    return `<div class="row-label ${channel}" style="grid-row:${CHANNELS.indexOf(channel) + 2}">
      <b title="${instrument}">${instrument}</b><span>${channel}</span>
    </div>${phrases.map((phrase, index) => {
      const active = phrase.channels.includes(channel);
      return `<button class="phrase-cell ${channel} ${active ? "active" : ""} ${index === selectedPhrase ? "selected" : ""}"
        style="${gridPlacement(phrase.startBar, phrase.bars)};grid-row:${CHANNELS.indexOf(channel) + 2}"
        data-phrase="${index}" aria-label="Phrase ${phrase.label}, ${instrument}: ${active ? `${phrase.counts[channel]} notes` : "inactive"}">
        ${active ? `${phrase.counts[channel]} notes` : "silent"}
      </button>`;
    }).join("")}`;
  };
  $("#phrase-grid").style.gridTemplateColumns = columns;
  $("#phrase-grid").style.minWidth = `${144 + track.chords.length * 28}px`;
  $("#phrase-grid").innerHTML = `<div class="corner" style="grid-column:1;grid-row:1">Production channel</div>
    ${phrases.map((phrase, index) => `<button class="phrase-head ${index === selectedPhrase ? "selected" : ""}"
      style="${gridPlacement(phrase.startBar, phrase.bars)};grid-row:1" data-phrase="${index}">
      <b>Phrase ${phrase.label}</b><span>bars ${phrase.startBar + 1}-${phrase.endBar} / ${LAYER_NAMES[phrase.layer] || phrase.layer}</span>
    </button>`).join("")}
    ${CHANNELS.map(row).join("")}`;
}

function renderPhraseReadout() {
  const phrase = phrases[selectedPhrase];
  const instruments = phrase.channels.map(channel => words(track.defaults[channel])).join(", ") || "none";
  const count = Object.values(phrase.counts).reduce((sum, value) => sum + value, 0);
  $("#phrase-readout").innerHTML = `<p class="readout-title">Phrase ${phrase.label} / bars ${phrase.startBar + 1}-${phrase.endBar}</p>
    <p class="readout-copy">${LAYER_NAMES[phrase.layer] || phrase.layer}. ${count} scheduled notes across ${instruments}.</p>`;
}

function renderNoteReadout() {
  const event = events[selectedEvent];
  if (!event) {
    $("#note-readout").innerHTML = `<p class="readout-title">No note selected</p><p class="readout-copy">Choose any colored note in the roll to inspect and audition it.</p>`;
    return;
  }
  const bar = Math.floor(event.beat / track.meter);
  const beat = event.beat - bar * track.meter;
  const seconds = event.durBeats * 60 / track.bpm;
  const fields = [
    ["Pitch", `${event.note} / MIDI ${event.midi}`],
    ["Instrument", words(event.instrument)],
    ["Channel", event.channel],
    ["Position", `bar ${bar + 1}, beat ${(beat + 1).toFixed(2)}`],
    ["Duration", `${event.durBeats.toFixed(2)} beats / ${seconds.toFixed(2)} s`],
    ["Gain / swing", `${Math.round(event.gain * 100)}% / ${event.isSwung ? "yes" : "no"}`],
  ];
  $("#note-readout").innerHTML = `<dl class="note-data">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd title="${value}">${value}</dd></div>`).join("")}</dl>`;
}

function renderRoll() {
  const minMidi = Math.min(...events.map(event => event.midi)) - 1;
  const maxMidi = Math.max(...events.map(event => event.midi)) + 1;
  const rows = maxMidi - minMidi + 1;
  const totalBeats = track.chords.length * track.meter;
  const width = totalBeats * beatWidth;
  const height = TOP + rows * ROW_HEIGHT;
  const keys = Array.from({ length: rows }, (_, row) => {
    const midi = maxMidi - row;
    const name = midiToName(midi);
    const sharp = name.includes("#");
    return `<div class="key ${sharp ? "sharp" : ""} ${name.startsWith("C") && !sharp ? "c" : ""}"
      style="top:${TOP + row * ROW_HEIGHT}px;height:${ROW_HEIGHT}px">${sharp ? "" : name}</div>`;
  }).join("");
  const bars = track.chords.map((_, bar) => `<span class="bar-label" style="left:${bar * track.meter * beatWidth}px">${bar + 1}</span>`).join("");
  const bands = phrases.map((phrase, index) => `<span class="phrase-band ${index === selectedPhrase ? "selected" : ""}"
    style="left:${phrase.startBar * track.meter * beatWidth}px;width:${phrase.bars * track.meter * beatWidth}px"></span>`).join("");
  const notes = events.map(event => {
    const top = TOP + (maxMidi - event.midi) * ROW_HEIGHT + 2;
    const left = event.beat * beatWidth;
    const width = Math.max(3, event.durBeats * beatWidth - 1);
    const hidden = visibleChannels.has(event.channel) ? "" : "hidden";
    const selected = event.index === selectedEvent ? "selected" : "";
    return `<button class="piano-note ${event.channel} ${hidden} ${selected}" data-event="${event.index}"
      style="top:${top}px;left:${left}px;width:${width}px" title="${event.note} / ${words(event.instrument)}"
      aria-label="${event.note}, ${words(event.instrument)}, beat ${event.beat.toFixed(2)}, duration ${event.durBeats.toFixed(2)} beats">${width >= 30 ? event.note : ""}</button>`;
  }).join("");
  $("#roll-stage").innerHTML = `<div class="keys" style="height:${height}px"><div class="key" style="top:0;height:${TOP}px;background:#071416"></div>${keys}</div>
    <div class="roll-canvas" style="--beat:${beatWidth}px;--meter:${track.meter};--row:${ROW_HEIGHT}px;width:${width}px;height:${height}px">${bars}${bands}${notes}<i class="playhead ${playing ? "on" : ""}" id="playhead"></i></div>`;
}

function render() {
  renderMeta();
  renderPhrases();
  renderPhraseReadout();
  renderNoteReadout();
  renderRoll();
}

function selectPhrase(index, scroll = true) {
  selectedPhrase = index;
  renderPhrases();
  renderPhraseReadout();
  renderRoll();
  if (scroll) {
    const phrase = phrases[index];
    $("#roll-viewport").scrollLeft = Math.max(0, phrase.startBar * track.meter * beatWidth - 20);
  }
}

function stopPlayback() {
  setMusicSoundOn(false);
  playing = false;
  cancelAnimationFrame(playFrame);
  $("#play").textContent = "Play";
  $("#play").setAttribute("aria-label", "Play soundtrack");
  $("#play").disabled = false;
  const playhead = $("#playhead");
  if (playhead) playhead.classList.remove("on");
}

async function loadAudioTrack() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error("This browser does not support Web Audio.");
  if (!audioContext) {
    audioContext = new AudioContext();
    initMusic(audioContext, null, false, new Date(0));
  }
  await audioContext.resume();
  if (audioTrack !== track.slug) {
    setMusicSoundOn(false);
    await setMusicTrack(track.slug);
    audioTrack = track.slug;
  }
}

function animatePlayhead() {
  if (!playing) return;
  const totalBeats = track.chords.length * track.meter;
  const elapsedBeats = ((performance.now() - playStarted) / 1000) * track.bpm / 60;
  const playhead = $("#playhead");
  if (playhead) {
    playhead.classList.add("on");
    playhead.style.left = `${(elapsedBeats % totalBeats) * beatWidth}px`;
  }
  playFrame = requestAnimationFrame(animatePlayhead);
}

async function togglePlayback() {
  if (playing) return stopPlayback();
  const button = $("#play");
  button.disabled = true;
  button.textContent = "Loading";
  $("#status").textContent = "Loading the production SoundFonts...";
  try {
    await loadAudioTrack();
    setMusicSoundOn(true);
    playing = true;
    playStarted = performance.now() + 50;
    button.disabled = false;
    button.textContent = "Stop";
    button.setAttribute("aria-label", "Stop soundtrack");
    $("#status").textContent = `Playing ${track.title} through the production scheduler.`;
    animatePlayhead();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Play";
    button.setAttribute("aria-label", "Play soundtrack");
    $("#status").textContent = `Could not load audio: ${error.message}`;
  }
}

async function selectNote(index) {
  selectedEvent = index;
  renderNoteReadout();
  document.querySelectorAll(".piano-note").forEach(note => note.classList.toggle("selected", Number(note.dataset.event) === index));
  const event = events[index];
  $("#status").textContent = `Loading ${words(event.instrument)}...`;
  try {
    await loadAudioTrack();
    if (!auditionMusicNote(event.channel, event.note, event.durBeats * 60 / track.bpm, event.gain)) {
      throw new Error("The instrument did not become ready.");
    }
    $("#status").textContent = `Auditioned ${event.note} on ${words(event.instrument)}.`;
  } catch (error) {
    $("#status").textContent = `Note selected; audio unavailable: ${error.message}`;
  }
}

const trackSelect = $("#track");
trackSelect.innerHTML = TRACKS.map(item => `<option value="${item.slug}">${item.title} / ${item.hours}</option>`).join("");
prepareTrack(track);
render();

trackSelect.addEventListener("change", () => {
  stopPlayback();
  prepareTrack(TRACKS.find(item => item.slug === trackSelect.value));
  render();
  $("#roll-viewport").scrollTo(0, 0);
  $("#status").textContent = "";
});
$("#play").addEventListener("click", togglePlayback);
$("#phrase-grid").addEventListener("click", event => {
  const target = event.target.closest("[data-phrase]");
  if (target) selectPhrase(Number(target.dataset.phrase));
});
$("#roll-stage").addEventListener("click", event => {
  const target = event.target.closest("[data-event]");
  if (target) selectNote(Number(target.dataset.event));
});
$("#roll-tools").addEventListener("click", event => {
  const button = event.target.closest("[data-channel]");
  if (!button) return;
  const channel = button.dataset.channel;
  visibleChannels.has(channel) ? visibleChannels.delete(channel) : visibleChannels.add(channel);
  button.setAttribute("aria-pressed", String(visibleChannels.has(channel)));
  document.querySelectorAll(`.piano-note.${channel}`).forEach(note => note.classList.toggle("hidden", !visibleChannels.has(channel)));
});
$("#zoom").addEventListener("input", event => {
  const viewport = $("#roll-viewport");
  const centerBeat = (viewport.scrollLeft + viewport.clientWidth / 2) / beatWidth;
  beatWidth = Number(event.target.value);
  renderRoll();
  viewport.scrollLeft = Math.max(0, centerBeat * beatWidth - viewport.clientWidth / 2);
});
window.addEventListener("pagehide", stopPlayback);
