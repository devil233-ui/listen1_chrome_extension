import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../js/controller/play.js', import.meta.url),
  'utf8'
);

let controller;
let playerListener;

const storage = {
  'player-settings': {
    playmode: 0,
    nowplaying_track_id: 'resume-track',
    volume: 90,
  },
};
const player = {
  status: {
    volume: 90,
    muted: false,
    playing: { id: 'resume-track', playedFrom: 0 },
  },
  setLoopMode() {},
  setVolume() {},
  toggleMute() {},
  connectPlayer() {},
  togglePlayPause() {},
  prev() {},
  next() {},
  adjustVolume() {},
};

const context = {
  angular: {
    module() {
      return {
        controller(name, definition) {
          assert.equal(name, 'PlayController');
          controller = definition.at(-1);
        },
      };
    },
  },
  notyf: { info() {}, warning() {} },
  i18next: { t(value) { return value; } },
  MediaService: {},
  l1Player: player,
  hotkeys() {},
  GithubClient: {
    github: {
      openAuthUrl() {},
      logout() {},
      updateStatus() {},
      getStatusText() { return ''; },
    },
  },
  isElectron() { return false; },
  getLocalStorageValue(key, defaultValue) { return defaultValue; },
  getPlayer() { return { setMode() {} }; },
  getPlayerAsync(mode, callback) { callback({ pause() {} }); },
  addPlayerListener(mode, callback) { playerListener = callback; },
  resolvePlayerMode(mode) { return mode; },
  smoothScrollTo() {},
  lastfm: { isAuthorized() { return false; } },
  localStorage: {
    getObject(key) { return storage[key] ?? null; },
    setObject(key, value) { storage[key] = value; },
  },
};

vm.runInNewContext(source, context, { filename: 'play.js' });

const scope = {
  $evalAsync(callback) { callback(); },
};
const rootScope = {
  $on() {},
};

controller(scope, () => {}, {}, () => {}, {}, rootScope);
assert.equal(typeof playerListener, 'function', 'player listener should register');

scope.lastTrackId = 'resume-track';
scope.myProgress = (42 / 180) * 100;
scope.currentPosition = '0:42';
scope.currentDuration = '3:00';
scope.currentDurationSeconds = 180;

playerListener({
  type: 'BG_PLAYER:FRAME_UPDATE',
  data: { id: 'resume-track', duration: 0, pos: 0, playing: true },
});

assert.equal(
  scope.currentPosition,
  '0:42',
  'a transient empty frame must not flash the position back to 0:00'
);
assert.equal(
  scope.myProgress,
  (42 / 180) * 100,
  'a transient empty frame must preserve the restored progress bar'
);

console.log('PASS: transient empty resume frames do not reset visible progress');
