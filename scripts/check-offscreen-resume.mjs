import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridgeSource = fs.readFileSync(
  new URL('../js/bridge.js', import.meta.url),
  'utf8'
);
const backgroundSource = fs.readFileSync(
  new URL('../js/background.js', import.meta.url),
  'utf8'
);
const offscreenSource = fs.readFileSync(
  new URL('../js/offscreen.js', import.meta.url),
  'utf8'
);

function createRuntime() {
  const listeners = [];
  let offscreenExists = false;
  const receivedOffscreenCommands = [];

  const runtime = {
    getManifest() {
      return { manifest_version: 3 };
    },
    getURL(path) {
      return `chrome-extension://test/${path}`;
    },
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      },
    },
    async sendMessage(message) {
      if (message.type === 'L1_PLAYER_CMD') {
        if (!offscreenExists) {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        receivedOffscreenCommands.push(message);
        return undefined;
      }

      let response;
      let responded = false;
      listeners.forEach((listener) => {
        const sendResponse = (value) => {
          response = value;
          responded = true;
        };
        listener(message, {}, sendResponse);
      });

      if (message.type === 'L1_OFFSCREEN_READY') {
        return undefined;
      }
      return responded ? response : undefined;
    },
  };

  const chrome = {
    action: { onClicked: { addListener() {} } },
    runtime,
    offscreen: {
      async createDocument() {
        offscreenExists = true;
        await runtime.sendMessage({ type: 'L1_OFFSCREEN_READY' });
      },
    },
  };
  chrome.runtime.getContexts = async () =>
    offscreenExists
      ? [
          {
            contextType: 'OFFSCREEN_DOCUMENT',
            documentUrl: chrome.runtime.getURL('offscreen.html'),
          },
        ]
      : [];

  return { chrome, receivedOffscreenCommands, runtime };
}

const bridgeMessages = [];
const bridgeContext = {
  chrome: {
    runtime: {
      getManifest() {
        return { manifest_version: 3 };
      },
      onMessage: { addListener() {} },
      sendMessage(message) {
        bridgeMessages.push(message);
        return Promise.resolve({ ok: true });
      },
    },
  },
  location: { pathname: '/listen1.html' },
  window: { location: { pathname: '/listen1.html' } },
};
vm.runInNewContext(bridgeSource, bridgeContext, { filename: 'bridge.js' });
bridgeContext.getPlayer('background').togglePlayPause();
assert.equal(
  bridgeMessages.at(-1)?.type,
  'L1_PLAYER_COMMAND',
  'the UI must route player commands through the service worker'
);

const { chrome, receivedOffscreenCommands } = createRuntime();
vm.runInNewContext(backgroundSource, { chrome, GithubClient: {} }, {
  filename: 'background.js',
});

await chrome.runtime.sendMessage({
  type: 'L1_PLAYER_COMMAND',
  method: 'togglePlayPause',
  args: [],
});
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

assert.equal(
  JSON.stringify(receivedOffscreenCommands),
  JSON.stringify([
    { type: 'L1_PLAYER_CMD', method: 'connectPlayer', args: [] },
    { type: 'L1_PLAYER_CMD', method: 'togglePlayPause', args: [] },
  ]),
  'a reclaimed player should restore its playlist before receiving the resume command'
);

let offscreenListener;
const restoreCalls = [];
const restoredPlaylist = [
  { id: 'first-track', title: 'First' },
  { id: 'resume-track', title: 'Resume' },
];
const offscreenPlayer = {
  playing: false,
  muted: false,
  volume: 1,
  loop_mode: 0,
  index: -1,
  playlist: [],
  get currentAudio() {
    return this.playlist[this.index] || null;
  },
  setNewPlaylist(list, initialTrackId) {
    restoreCalls.push({ initialTrackId });
    this.playlist = list;
    const selectedIndex = list.findIndex((track) => track.id === initialTrackId);
    this.index = selectedIndex >= 0 ? selectedIndex : 0;
  },
  loadById(id) {
    this.index = this.playlist.findIndex((track) => track.id === id);
  },
  sendPlaylistEvent() {},
  sendPlayingEvent() {},
  sendLoadEvent() {},
  sendVolumeEvent() {},
};
const offscreenContext = {
  setPrototypeOfLocalStorage() {},
  playerSendMessage() {},
  localStorage: {
    getObject(key) {
      if (key === 'current-playing') return restoredPlaylist;
      if (key === 'player-settings') {
        return { nowplaying_track_id: 'resume-track' };
      }
      return null;
    },
  },
  window: { threadPlayer: offscreenPlayer },
  chrome: {
    runtime: {
      onMessage: {
        addListener(listener) {
          offscreenListener = listener;
        },
      },
      sendMessage() {
        return Promise.resolve();
      },
    },
  },
};
vm.runInNewContext(offscreenSource, offscreenContext, {
  filename: 'offscreen.js',
});
offscreenListener({ type: 'L1_PLAYER_CMD', method: 'connectPlayer', args: [] });
assert.equal(
  restoreCalls[0].initialTrackId,
  'resume-track',
  'offscreen restore should select the saved track before emitting LOAD'
);

console.log('PASS: paused offscreen player is recreated before the resume command');
