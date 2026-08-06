/* eslint-disable no-unused-vars */
/* global setPrototypeOfLocalStorage playerSendMessage */
/*
Offscreen document command handler.

Manifest V3 removed the persistent background page, so the audio player can no
longer live there. This document is the MV3 replacement: it is a real DOM
document (so Howler/<audio> works) that the service worker keeps alive with the
AUDIO_PLAYBACK reason, and it outlives the UI tab.

Protocol
--------
UI -> worker : { type: 'L1_PLAYER_COMMAND', method, args }
worker -> here: { type: 'L1_PLAYER_CMD', method, args }  (fire and forget)
UI -> here   : { type: 'L1_PLAYER_SNAPSHOT' }            (expects a response)
here -> UI   : { type: 'BG_PLAYER:*' }                   (unchanged, via
               playerSendMessage in bridge.js -> runtime.sendMessage)

Only methods on the allow list below can be invoked. The UI never gets a real
object reference across documents, so every synchronous property read on the UI
side is served from a local mirror that is refreshed by the BG_PLAYER:* events
and by the snapshot reply.
*/

setPrototypeOfLocalStorage();

// Methods that map 1:1 onto Player. Everything else is rejected.
const ALLOWED_METHODS = [
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
];

// Accessors have to be written through explicitly, since a proxied assignment
// cannot travel over the message channel as an assignment.
const ALLOWED_SETTERS = ['loop_mode', 'volume'];

function buildSnapshot(player) {
  if (!player) {
    return null;
  }
  return {
    playing: player.playing,
    muted: player.muted,
    volume: player.volume,
    loop_mode: player.loop_mode,
    index: player.index,
    playlist: player.playlist.map((audio) => ({ ...audio, howl: undefined })),
    currentAudio: player.currentAudio
      ? { ...player.currentAudio, howl: undefined }
      : null,
  };
}

// Push a full snapshot so a freshly opened UI tab can rebuild its mirror
// without waiting for the next frame update.
function broadcastSnapshot() {
  const player = window.threadPlayer;
  if (!player) {
    return;
  }
  chrome.runtime
    .sendMessage({
      type: 'BG_PLAYER:STATE_SNAPSHOT',
      data: buildSnapshot(player),
    })
    .catch(() => {
      // No UI page is listening. Playback continues regardless; this is the
      // normal case while running headless.
    });
}

// Toggles have to be resolved here. The UI used to read player.playing and
// branch on it, which is impossible across documents without a race.
function handleToggle(player, method) {
  if (method === 'togglePlayPause') {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
    return true;
  }
  if (method === 'toggleMute') {
    if (player.muted) {
      player.unmute();
    } else {
      player.mute();
    }
    return true;
  }
  return false;
}

// Replaces l1Player.connectPlayer's body, which needed synchronous reads of
// player.playing and player.playlist.length before deciding what to restore.
function handleConnect(player) {
  if (!player.playing) {
    const localPlayerSettings = localStorage.getObject('player-settings');
    const restoredTrackId = localPlayerSettings?.nowplaying_track_id;

    if (!player.playlist.length) {
      const localCurrentPlaying = localStorage.getObject('current-playing');
      if (localCurrentPlaying !== null && localCurrentPlaying !== undefined) {
        const restoredPlaylist = localCurrentPlaying.map((track) => ({
          ...track,
          disabled: false,
        }));
        player.setNewPlaylist(restoredPlaylist, restoredTrackId);
      }
    }

    if (
      restoredTrackId !== undefined &&
      player.currentAudio?.id !== restoredTrackId
    ) {
      player.loadById(restoredTrackId);
    }
  }

  player.sendPlaylistEvent();
  player.sendPlayingEvent();
  player.sendLoadEvent();
  // connectPlayer historically did not resend these, because in MV2 the UI read
  // volume/muted straight off the shared player object. Across documents that is
  // no longer possible, so they have to be pushed too or the volume slider and
  // mute icon come back stale on a reopened tab.
  player.sendVolumeEvent();
  playerSendMessage(player.mode, {
    type: 'BG_PLAYER:MUTE',
    data: player.muted,
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.type !== 'string') {
    return undefined;
  }

  if (request.type === 'L1_PLAYER_SNAPSHOT') {
    sendResponse(buildSnapshot(window.threadPlayer));
    return undefined;
  }

  if (request.type !== 'L1_PLAYER_CMD') {
    return undefined;
  }

  const player = window.threadPlayer;
  if (!player) {
    return undefined;
  }

  const { method } = request;
  const args = Array.isArray(request.args) ? request.args : [];

  if (method === 'connectPlayer') {
    handleConnect(player);
    broadcastSnapshot();
    return undefined;
  }

  if (handleToggle(player, method)) {
    broadcastSnapshot();
    return undefined;
  }

  if (method && method.startsWith('set:')) {
    const prop = method.slice(4);
    if (ALLOWED_SETTERS.includes(prop)) {
      const [value] = args;
      player[prop] = value;
      broadcastSnapshot();
    }
    return undefined;
  }

  if (ALLOWED_METHODS.includes(method)) {
    player[method](...args);
    broadcastSnapshot();
  }

  return undefined;
});

// The UI may have opened before this document finished loading, in which case
// it already sent its snapshot request and got nothing back. Announce
// readiness so it can re-sync.
chrome.runtime.sendMessage({ type: 'L1_OFFSCREEN_READY' }).catch(() => {});
