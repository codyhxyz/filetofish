/* Render one loop of each shipped track to WAV, through the same SoundFont
   samples and note events the site plays, for listening before a push.

     cd soundtrack/magenta && npm install
     node preview.mjs [slug ...]        # -> soundtrack/previews/<slug>.wav

   The page runs in headless Chromium with an OfflineAudioContext. Instrument
   files come from the midi-js-soundfonts repository and are cached in
   soundtrack/previews/.soundfonts/. CHROMIUM_PATH picks the browser binary.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "soundtrack/previews");
const CACHE = path.join(OUT, ".soundfonts");
const SAMPLE_RATE = 32000;
const SOURCE = "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages";

async function soundfont(bank, name) {
  const file = path.join(CACHE, bank, `${name}-mp3.js`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${SOURCE}/${bank}/${name}-mp3.js`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak ? 0.9 / peak : 1;   // previews are peak-normalised for listening
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const bundle = await esbuild.build({
  stdin: {
    contents: `
      import Soundfont from "soundfont-player";
      import { TRACKS, compileTimeline } from "./src/music.js";
      import { SOUNDFONT_BANK } from "./src/music-settings.mjs";
      window.render = async (slug, rate) => {
        const track = TRACKS.find(t => t.slug === slug);
        const events = compileTimeline(track);
        const beat = 60 / track.bpm;
        const seconds = track.chords.length * track.meter * beat + 3;
        const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
        const load = name => Soundfont.instrument(ctx, name, {
          soundfont: SOUNDFONT_BANK, destination: ctx.destination,
          nameToUrl: (n, sf) => "/soundfonts/" + sf + "/" + n + "-mp3.js",
        });
        const channels = {
          bass: await load(track.defaults.bass),
          chords: await load(track.defaults.chords),
          lead: await load(track.defaults.lead),
        };
        // Same swing rule as music.js: off-beat eighths in 4/4 slide to track.swing.
        const swung = b => {
          const bar = Math.floor(b / track.meter), inBar = b - bar * track.meter;
          const whole = Math.floor(inBar), frac = inBar - whole;
          return bar * track.meter + whole + (track.meter === 4 && Math.abs(frac - 0.5) < 0.05 ? track.swing : frac);
        };
        for (const e of events) {
          const at = 0.05 + (e.isSwung ? swung(e.beat) : e.beat) * beat;
          channels[e.channel].play(e.note, at, { duration: e.durBeats * beat, gain: e.gain });
        }
        const buffer = await ctx.startRendering();
        return Array.from(buffer.getChannelData(0));
      };`,
    resolveDir: ROOT,
    loader: "js",
  },
  bundle: true,
  write: false,
  format: "iife",
  loader: { ".json": "json" },
});

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "src/room-tracks.json"), "utf8"));
const wanted = process.argv.slice(2);
const slugs = config.map(t => t.slug).filter(s => !wanted.length || wanted.includes(s));
if (!slugs.length) { console.error("no imported tracks to preview"); process.exit(1); }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.route("**/soundfonts/**", async route => {
  const [, bank, file] = new URL(route.request().url()).pathname.match(/soundfonts\/([^/]+)\/(.+)-mp3\.js$/);
  route.fulfill({ body: await soundfont(bank, file), contentType: "application/javascript" });
});
await page.route("http://preview.local/", route => route.fulfill({ body: "<!doctype html><title>preview</title>", contentType: "text/html" }));
await page.goto("http://preview.local/");
await page.addScriptTag({ content: bundle.outputFiles[0].text });

fs.mkdirSync(OUT, { recursive: true });
for (const slug of slugs) {
  const samples = await page.evaluate(([s, r]) => window.render(s, r), [slug, SAMPLE_RATE]);
  const file = path.join(OUT, `${slug}.wav`);
  fs.writeFileSync(file, wav(samples, SAMPLE_RATE));
  console.log(`${path.relative(ROOT, file)}  ${(samples.length / SAMPLE_RATE).toFixed(1)}s`);
}
await browser.close();
