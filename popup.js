import { SOUNDS, createDefaultState } from "./sounds-data.js";

const state = createDefaultState();
const soundGrid = document.getElementById("sound-grid");
const stopAllButton = document.getElementById("stop-all");
const infoToggleButton = document.getElementById("info-toggle");
const infoModal = document.getElementById("info-modal");
const infoBackdrop = document.getElementById("info-backdrop");
const infoCloseButton = document.getElementById("info-close");

function sendToBackground(message) {
  return chrome.runtime.sendMessage({ ...message, target: "background" });
}

function formatVolume(volume) {
  return `${Math.round(volume * 100)}%`;
}

function getPlayingCount() {
  return Object.values(state).filter((sound) => sound.playing).length;
}

function renderStopButton() {
  const count = getPlayingCount();
  stopAllButton.hidden = count === 0;
  stopAllButton.disabled = count === 0;
}

function setInfoModalOpen(isOpen) {
  infoModal.hidden = !isOpen;
  infoModal.setAttribute("aria-hidden", String(!isOpen));
  if (isOpen) {
    infoCloseButton.focus();
  } else {
    infoToggleButton.focus();
  }
}

function syncState(nextState) {
  for (const sound of SOUNDS) {
    const next = nextState?.[sound.id];
    if (!next) {
      continue;
    }
    state[sound.id].playing = Boolean(next.playing);
    state[sound.id].volume = Number.isFinite(next.volume) ? next.volume : state[sound.id].volume;
  }
  renderStopButton();
}

function createCard(sound) {
  const card = document.createElement("article");
  card.className = "sound-card";
  card.dataset.soundId = sound.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-pressed", "false");

  card.innerHTML = `
    <div class="sound-card__top">
      <div class="sound-card__title">
        <span class="sound-icon" aria-hidden="true">${sound.icon}</span>
        <p class="sound-name">${sound.label}</p>
      </div>
      <div class="sound-card__dot" aria-hidden="true"></div>
    </div>
    <div class="volume-row volume-wrap">
      <input
        data-role="volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value="${state[sound.id].volume}"
        aria-label="${sound.label} volume"
      />
    </div>
  `;

  const volumeInput = card.querySelector('[data-role="volume"]');

  function updateCardVisuals(next) {
    card.classList.toggle("sound-card--playing", next.playing);
    card.setAttribute("aria-pressed", String(next.playing));
    volumeInput.value = String(next.volume);
  }

  updateCardVisuals(state[sound.id]);

  async function toggleSound() {
    const response = await sendToBackground({ type: "TOGGLE_SOUND", id: sound.id });
    if (response?.ok) {
      syncState(response.state);
      updateCardVisuals(state[sound.id]);
    }
  }

  card.addEventListener("click", (event) => {
    if (event.target.closest('input[type="range"]')) {
      return;
    }
    toggleSound().catch(() => {});
  });

  card.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest('input[type="range"]')) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleSound().catch(() => {});
  });

  volumeInput.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  volumeInput.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  volumeInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  volumeInput.addEventListener("input", async (event) => {
    const nextVolume = Number(event.target.value);
    state[sound.id].volume = nextVolume;
    await sendToBackground({ type: "SET_VOLUME", id: sound.id, volume: nextVolume });
  });

  card.update = updateCardVisuals;
  return card;
}

async function refreshAll() {
  const response = await sendToBackground({ type: "GET_STATE" });
  if (response?.ok) {
    syncState(response.state);
    for (const card of soundGrid.querySelectorAll(".sound-card")) {
      const soundId = card.dataset.soundId;
      card.update(state[soundId]);
    }
  }
}

async function stopAll() {
  stopAllButton.disabled = true;
  try {
    const response = await sendToBackground({ type: "STOP_ALL" });
    if (response?.ok) {
      syncState(response.state);
      for (const card of soundGrid.querySelectorAll(".sound-card")) {
        const soundId = card.dataset.soundId;
        card.update(state[soundId]);
      }
    }
  } finally {
    stopAllButton.disabled = false;
  }
}

for (const sound of SOUNDS) {
  soundGrid.appendChild(createCard(sound));
}

stopAllButton.addEventListener("click", stopAll);
infoToggleButton.addEventListener("click", () => {
  setInfoModalOpen(true);
});

infoBackdrop.addEventListener("click", () => {
  setInfoModalOpen(false);
});

infoCloseButton.addEventListener("click", () => {
  setInfoModalOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !infoModal.hidden) {
    setInfoModalOpen(false);
  }
});

refreshAll().catch(() => {
  soundGrid.innerHTML = `<div class="empty-state">Loading Sonora...</div>`;
  stopAllButton.hidden = true;
});
