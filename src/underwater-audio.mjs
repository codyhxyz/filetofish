// One environment per context; separate lanes keep music/SFX volume and mute
// downstream of their reverb tails. Both lanes reuse the same impulse/depth.
export const UNDERWATER_AUDIO = Object.freeze({
  maxDepth: 80,
  surfaceCutoff: 20000,
  deepCutoff: 650,
  maxWet: 0.32,
  fadeDepth: 2,
  smoothingSeconds: 0.12,
  impulseSeconds: 1.4,
});

const environments = new Map();
let depth = 0;

function smooth(param, value, context, immediate) {
  if (immediate) { param.value = value; return; }
  const now = context.currentTime;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(held, now);
  }
  param.linearRampToValueAtTime(value, now + UNDERWATER_AUDIO.smoothingSeconds);
}

function applyDepth(context, lane, immediate = false) {
  const p = UNDERWATER_AUDIO;
  const amount = depth / p.maxDepth;
  const submerged = Math.min(1, depth / p.fadeDepth);
  const wet = amount * p.maxWet;
  const surfaceCutoff = Math.min(p.surfaceCutoff, context.sampleRate / 2);
  smooth(lane.filter.frequency, surfaceCutoff * (p.deepCutoff / surfaceCutoff) ** amount, context, immediate);
  // A real bypass (not just a high cutoff) restores the original surface tone.
  smooth(lane.bypass.gain, 1 - submerged, context, immediate);
  smooth(lane.dry.gain, submerged * (1 - wet), context, immediate);
  smooth(lane.wet.gain, wet, context, immediate);
}

export function setUnderwaterDepth(depthMetres) {
  const next = Number.isFinite(depthMetres) ? Math.max(0, Math.min(UNDERWATER_AUDIO.maxDepth, depthMetres)) : 0;
  if (next === depth) return;
  depth = next;
  for (const [context, environment] of environments) {
    if (context.state === "closed") { environments.delete(context); continue; }
    for (const lane of environment.lanes.values()) applyDepth(context, lane);
  }
}

// Does not create or resume an AudioContext. Call once per final volume bus.
export function getUnderwaterInput(context, destination) {
  let environment = environments.get(context);
  if (!environment) {
    const length = Math.ceil(context.sampleRate * UNDERWATER_AUDIO.impulseSeconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    environment = { impulse, lanes: new Map(), enabled: true };
    environments.set(context, environment);
  }
  if (environment.lanes.has(destination)) return environment.lanes.get(destination).input;
  const input = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = Math.SQRT1_2;
  const reverb = context.createConvolver();
  reverb.buffer = environment.impulse;
  const bypass = context.createGain(), dry = context.createGain(), wet = context.createGain();
  const mute = context.createGain();
  mute.gain.value = environment.enabled ? 1 : 0;
  input.connect(bypass); bypass.connect(mute);
  input.connect(filter); filter.connect(dry); dry.connect(mute);
  filter.connect(reverb); reverb.connect(wet); wet.connect(mute);
  mute.connect(destination);
  const lane = { input, filter, bypass, dry, wet, mute };
  environment.lanes.set(destination, lane);
  applyDepth(context, lane, true);
  return input;
}

// Shared sound toggle: all routes, including residual tails, pass this gate.
export function setUnderwaterSoundOn(context, enabled) {
  const environment = environments.get(context);
  if (!environment) return;
  environment.enabled = !!enabled;
  for (const lane of environment.lanes.values()) lane.mute.gain.value = enabled ? 1 : 0;
}
