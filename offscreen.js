import { createDefaultState, SOUNDS } from "./sounds-data.js";

const audioMap = new Map();
const state = createDefaultState();
let hydrated = false;

function getSoundById(id) {
  return SOUNDS.find((sound) => sound.id === id);
}

function getAudio(id) {
  const sound = getSoundById(id);
  if (!sound) {
    throw new Error(`Unknown sound: ${id}`);
  }

  if (audioMap.has(id)) {
    return audioMap.get(id);
  }

  const audio = new Audio(chrome.runtime.getURL(sound.file));
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = state[id].volume;
  audioMap.set(id, audio);
  return audio;
}

function snapshotState() {
  return structuredClone(state);
}

function mergeState(savedState) {
  if (!savedState || typeof savedState !== "object") {
    return;
  }

  for (const sound of SOUNDS) {
    const savedSound = savedState[sound.id];
    if (!savedSound) {
      continue;
    }

    state[sound.id].volume = Number.isFinite(savedSound.volume)
      ? Math.max(0, Math.min(1, savedSound.volume))
      : state[sound.id].volume;
    state[sound.id].playing = Boolean(savedSound.playing);
  }
}

async function applyState() {
  for (const sound of SOUNDS) {
    const current = state[sound.id];
    const audio = getAudio(sound.id);
    audio.volume = current.volume;

    if (current.playing) {
      try {
        await audio.play();
      } catch {
        current.playing = false;
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }
}

async function initialize() {
  await applyState();
}

const ready = initialize();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return;
  }

  (async () => {
    if (!hydrated && message.persistedState) {
      mergeState(message.persistedState);
      await ready;
      await applyState();
    } else {
      await ready;
    }
    hydrated = true;

    if (message.type === "GET_STATE") {
      sendResponse({ ok: true, state: snapshotState() });
      return;
    }

    if (message.type === "TOGGLE_SOUND") {
      const { id } = message;
      const current = state[id];
      if (!current) {
        throw new Error(`Unknown sound: ${id}`);
      }

      const audio = getAudio(id);
      current.playing = !current.playing;

      if (current.playing) {
        await audio.play();
      } else {
        audio.pause();
        audio.currentTime = 0;
      }

      sendResponse({ ok: true, state: snapshotState() });
      return;
    }

    if (message.type === "SET_VOLUME") {
      const { id, volume } = message;
      const current = state[id];
      if (!current) {
        throw new Error(`Unknown sound: ${id}`);
      }

      const clampedVolume = Math.max(0, Math.min(1, Number(volume)));
      current.volume = Number.isFinite(clampedVolume) ? clampedVolume : current.volume;
      getAudio(id).volume = current.volume;
      sendResponse({ ok: true, state: snapshotState() });
      return;
    }

    if (message.type === "STOP_ALL") {
      for (const sound of SOUNDS) {
        state[sound.id].playing = false;
        const audio = getAudio(sound.id);
        audio.pause();
        audio.currentTime = 0;
      }

      sendResponse({ ok: true, state: snapshotState() });
      return;
    }

    throw new Error(`Unknown message type: ${message.type}`);
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
