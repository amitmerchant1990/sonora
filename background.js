const OFFSCREEN_URL = "offscreen.html";
const STORAGE_KEY = "sonora-state";

async function ensureOffscreenDocument() {
  if (chrome.offscreen?.hasDocument && (await chrome.offscreen.hasDocument())) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Keep ambient sounds playing after the popup closes."
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "background") {
    return;
  }

  (async () => {
    await ensureOffscreenDocument();
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const response = await chrome.runtime.sendMessage({
      ...message,
      target: "offscreen",
      persistedState: stored[STORAGE_KEY] ?? null
    });

    if (response?.ok && response.state) {
      await chrome.storage.local.set({ [STORAGE_KEY]: response.state });
    }

    sendResponse(response);
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
