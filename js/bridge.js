/* eslint-disable no-unused-vars */
/*
build a bridge between UI and audio player

audio player has 2 modes, but share same protocol: front and background.

* front: audio player and UI are in same environment
* background: audio player is in background page.

*/

function getFrontPlayer() {
  return window.threadPlayer;
}

// Manifest V3 replaced the persistent background page with a service worker,
// which has no DOM and therefore cannot host an audio player. Under MV2 the UI
// reached the player with chrome.extension.getBackgroundPage() and got a real
// object reference; both that API and runtime.getBackgroundPage() are gone.
//
// The MV3 replacement is an offscreen document (offscreen.html). It is a real
// DOM document that outlives the UI tab, but it is a *separate* document, so the
// UI can only talk to it by message. Everything below exists to keep the old
// synchronous-looking player API working on top of that message channel.
// bridge.js is loaded by both listen1.html (UI) and offscreen.html (the player
// host). Inside the host the real player is a local object, so none of the
// proxying applies.
const IS_OFFSCREEN_HOST =
  typeof location !== 'undefined' &&
  location.pathname.indexOf('offscreen.html') !== -1;

function isManifestV3() {
  try {
    return chrome.runtime.getManifest().manifest_version >= 3;
  } catch (err) {
    return false;
  }
}

// NOTE: do not reintroduce a hasBackgroundPage()-style feature detection here.
// Under MV3 both chrome.extension.getBackgroundPage and
// chrome.runtime.getBackgroundPage are still exposed as callable functions, so
// `typeof fn === 'function'` reports true and then the call fails at runtime
// with "You do not have a background page." That false positive is what broke
// playback entirely. This extension is MV3-only; there is no background page,
// so those APIs are simply never referenced.

// Set to true when the service worker reports that it could not create the
// offscreen document (browser too old, or creation refused). In that case the
// proxy operates on the in-page player instead, which keeps playback working at
// the cost of stopping when the tab closes.
let offscreenUnavailable = false;

function sendRuntimeMessage(message) {
  try {
    const result = (chrome || browser).runtime.sendMessage(message);
    // MV3 returns a promise; nothing is listening while the UI is closed, and
    // that rejection is expected rather than an error.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch (err) {
    // Channel not available. Ignore for fire-and-forget commands.
  }
}

// Local copy of the player state. The UI reads properties synchronously in a
// number of places (l1_player.js status init, play.js), which cannot be served
// by a message round trip, so the mirror is kept current by the BG_PLAYER:*
// events the player already broadcasts.
const backgroundMirror = {
  playing: false,
  muted: false,
  volume: 1,
  loop_mode: 0,
  index: -1,
  playlist: [],
  currentAudio: null,
};

function applySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  Object.keys(backgroundMirror).forEach((key) => {
    if (snapshot[key] !== undefined) {
      backgroundMirror[key] = snapshot[key];
    }
  });
}

function updateMirrorFromEvent(msg) {
  switch (msg.type) {
    case 'BG_PLAYER:STATE_SNAPSHOT':
      applySnapshot(msg.data);
      break;
    case 'BG_PLAYER:PLAY_STATE':
      backgroundMirror.playing = !!(msg.data && msg.data.isPlaying);
      break;
    case 'BG_PLAYER:FRAME_UPDATE':
      if (msg.data && msg.data.playing !== undefined) {
        backgroundMirror.playing = msg.data.playing;
      }
      break;
    case 'BG_PLAYER:VOLUME':
      backgroundMirror.volume = msg.data / 100;
      break;
    case 'BG_PLAYER:MUTE':
      backgroundMirror.muted = !!msg.data;
      break;
    case 'BG_PLAYER:PLAYLIST':
      backgroundMirror.playlist = msg.data || [];
      break;
    case 'BG_PLAYER:LOAD':
      if (msg.data) {
        backgroundMirror.currentAudio = msg.data.currentPlaying || null;
        if (msg.data.playlist) {
          backgroundMirror.index = msg.data.playlist.index;
        }
      }
      break;
    default:
      break;
  }
}

// Player methods that are safe to forward verbatim.
const PROXIED_METHODS = [
  'play',
  'pause',
  'playById',
  'loadById',
  'load',
  'seek',
  'seekTime',
  'skip',
  'mute',
  'unmute',
  'adjustVolume',
  'insertAudio',
  'insertAudioByDirection',
  'removeAudio',
  'appendAudioList',
  'clearPlaylist',
  'setNewPlaylist',
  'setMode',
  'setRefreshRate',
  'sendPlaylistEvent',
  'sendPlayingEvent',
  'sendLoadEvent',
  'sendVolumeEvent',
  'sendFrameUpdate',
  // Resolved inside the offscreen document because they branch on live state.
  'togglePlayPause',
  'toggleMute',
  'connectPlayer',
];

function buildOffscreenProxy() {
  const proxy = {};

  PROXIED_METHODS.forEach((method) => {
    proxy[method] = (...args) => {
      if (offscreenUnavailable) {
        const local = getFrontPlayer();
        if (!local) return;
        // The three composite commands do not exist on Player itself.
        if (method === 'togglePlayPause') {
          if (local.playing) local.pause();
          else local.play();
          return;
        }
        if (method === 'toggleMute') {
          if (local.muted) local.unmute();
          else local.mute();
          return;
        }
        if (method === 'connectPlayer') {
          local.sendPlaylistEvent();
          local.sendPlayingEvent();
          local.sendLoadEvent();
          return;
        }
        if (typeof local[method] === 'function') {
          local[method](...args);
        }
        return;
      }
      sendRuntimeMessage({ type: 'L1_PLAYER_CMD', method, args });
    };
  });

  // Reads come from the mirror; writes become explicit setter commands.
  Object.defineProperty(proxy, 'playing', {
    get: () => backgroundMirror.playing,
  });
  Object.defineProperty(proxy, 'muted', {
    get: () => backgroundMirror.muted,
  });
  Object.defineProperty(proxy, 'playlist', {
    get: () => backgroundMirror.playlist,
  });
  Object.defineProperty(proxy, 'index', {
    get: () => backgroundMirror.index,
  });
  Object.defineProperty(proxy, 'currentAudio', {
    get: () => backgroundMirror.currentAudio,
  });
  Object.defineProperty(proxy, 'volume', {
    get: () => backgroundMirror.volume,
    set: (val) => {
      backgroundMirror.volume = val;
      if (offscreenUnavailable) {
        const local = getFrontPlayer();
        if (local) local.volume = val;
        return;
      }
      sendRuntimeMessage({
        type: 'L1_PLAYER_CMD',
        method: 'set:volume',
        args: [val],
      });
    },
  });
  Object.defineProperty(proxy, 'loop_mode', {
    get: () => backgroundMirror.loop_mode,
    set: (val) => {
      backgroundMirror.loop_mode = val;
      if (offscreenUnavailable) {
        const local = getFrontPlayer();
        if (local) local.loop_mode = val;
        return;
      }
      sendRuntimeMessage({
        type: 'L1_PLAYER_CMD',
        method: 'set:loop_mode',
        args: [val],
      });
    },
  });

  return proxy;
}

const offscreenProxy = IS_OFFSCREEN_HOST ? null : buildOffscreenProxy();

// Ask the service worker to spin up the offscreen document, then pull a full
// snapshot so a freshly opened tab shows whatever is already playing.
function initOffscreenBridge() {
  if (IS_OFFSCREEN_HOST || !isManifestV3()) {
    return;
  }

  (chrome || browser).runtime.onMessage.addListener((msg) => {
    if (msg && typeof msg.type === 'string') {
      if (msg.type === 'BG_PLAYER:OFFSCREEN_READY') {
        sendRuntimeMessage({ type: 'L1_PLAYER_CMD', method: 'connectPlayer' });
      } else if (msg.type.indexOf('BG_PLAYER:') === 0) {
        updateMirrorFromEvent(msg);
      }
    }
    return undefined;
  });

  try {
    (chrome || browser).runtime
      .sendMessage({ type: 'L1_ENSURE_OFFSCREEN' })
      .then((res) => {
        if (!res || res.ok !== true) {
          offscreenUnavailable = true;
          return;
        }
        (chrome || browser).runtime
          .sendMessage({ type: 'L1_PLAYER_SNAPSHOT' })
          .then((snapshot) => applySnapshot(snapshot))
          .catch(() => {});
      })
      .catch(() => {
        offscreenUnavailable = true;
      });
  } catch (err) {
    offscreenUnavailable = true;
  }
}

// 'background' is always served by the offscreen document. The MV2 background
// page path is deliberately absent: chrome.extension.getBackgroundPage and
// chrome.runtime.getBackgroundPage remain *callable* under MV3 and only fail at
// call time, so any code that still references them risks being reached by
// mistake. Not calling them at all is the only reliable guarantee.
function getBackgroundPlayer() {
  if (IS_OFFSCREEN_HOST) {
    return getFrontPlayer();
  }
  return offscreenProxy;
}

function getBackgroundPlayerAsync(callback) {
  return callback(getBackgroundPlayer());
}

function resolvePlayerMode(mode) {
  if (mode !== 'background') {
    return mode;
  }
  // Inside the offscreen host the player is a local object.
  if (IS_OFFSCREEN_HOST) {
    return 'front';
  }
  // Without the offscreen API there is no document outside this page that can
  // hold an audio element, so background playback is not achievable.
  if (!isManifestV3()) {
    return 'front';
  }
  return 'background';
}

function getPlayer(mode) {
  if (mode === 'front') {
    return getFrontPlayer();
  }
  if (mode === 'background') {
    return getBackgroundPlayer();
  }
  return undefined;
}

function getPlayerAsync(mode, callback) {
  if (mode === 'front') {
    const player = getFrontPlayer();
    return callback(player);
  }
  if (mode === 'background') {
    return getBackgroundPlayerAsync(callback);
  }
  return undefined;
}
const frontPlayerListener = [];
function addFrontPlayerListener(listener) {
  frontPlayerListener.push(listener);
}

function addBackgroundPlayerListener(listener) {
  // BG_PLAYER:* events arrive over runtime.onMessage from the offscreen
  // document under MV3, exactly as they used to from the background page.
  return (chrome || browser).runtime.onMessage.addListener(
    (msg, sender, res) => {
      if (!msg || typeof msg.type !== 'string') {
        return null;
      }
      if (!msg.type.startsWith('BG_PLAYER:')) {
        return null;
      }
      return listener(msg, sender, res);
    }
  );
}

function addPlayerListener(mode, listener) {
  if (mode === 'front') {
    return addFrontPlayerListener(listener);
  }
  if (mode === 'background') {
    return addBackgroundPlayerListener(listener);
  }
  return null;
}

function frontPlayerSendMessage(message) {
  if (frontPlayerListener !== []) {
    frontPlayerListener.forEach((listener) => {
      listener(message);
    });
  }
}

function backgroundPlayerSendMessage(message) {
  // Called from inside the offscreen document (player_thread.js) to fan events
  // out to whatever UI page is open. If none is, the promise rejects with
  // "Receiving end does not exist" -- that is the normal headless case and must
  // not surface as an unhandled rejection.
  const sending = (chrome || browser).runtime.sendMessage(message);
  if (sending && typeof sending.catch === 'function') {
    sending.catch(() => {});
  }
}

function playerSendMessage(mode, message) {
  if (mode === 'front') {
    frontPlayerSendMessage(message);
  }
  if (mode === 'background') {
    backgroundPlayerSendMessage(message);
  }
}
