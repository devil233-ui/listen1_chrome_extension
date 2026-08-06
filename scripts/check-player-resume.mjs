import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/player_thread.js', import.meta.url), 'utf8');

let mediaUrlRequestCount = 0;
let activeUrl = '';
let urlExpired = false;
let rejectEveryPlayback = false;

class FakeHowl {
  constructor(options) {
    this.options = options;
    this.url = options.src[0];
    this.isPlaying = false;
  }

  play() {
    if (rejectEveryPlayback || (urlExpired && this.url === activeUrl)) {
      this.options.onplayerror.call(this, 1, 'expired media URL');
      return 1;
    }
    this.isPlaying = true;
    this.options.onplay.call(this);
    return 1;
  }

  pause() {
    this.isPlaying = false;
    this.options.onpause.call(this);
  }

  playing() {
    return this.isPlaying;
  }

  stop() {
    this.isPlaying = false;
  }

  unload() {
    this.isPlaying = false;
  }

  duration() {
    return 180;
  }

  seek() {
    return 30;
  }

  rate() {
    return 1;
  }
}

const mediaSession = {
  playbackState: 'none',
  setActionHandler() {},
  setPositionState() {},
};

const context = {
  Howl: FakeHowl,
  Howler: {
    _muted: false,
    unload() {},
    volume() {
      return 1;
    },
  },
  MediaMetadata: class {},
  MediaService: {
    bootstrapTrack(_track, success) {
      mediaUrlRequestCount += 1;
      activeUrl = `https://media.test/audio.mp3?token=${mediaUrlRequestCount}`;
      urlExpired = false;
      success({ url: activeUrl, bitrate: 320, platform: 'test' });
    },
  },
  navigator: { mediaSession },
  playerSendMessage() {},
  setInterval() {
    return 1;
  },
  clearInterval() {},
  window: {},
};

vm.runInNewContext(source, context, { filename: 'player_thread.js' });

const player = context.window.threadPlayer;
player.setNewPlaylist([
  {
    id: 'test-track',
    source: 'test',
    title: 'Resume test',
    artist: 'Listen 1',
  },
]);
player.play();
assert.equal(player.playing, true, 'initial playback should start');
assert.equal(mediaUrlRequestCount, 1, 'initial playback should request one URL');

player.pause();
urlExpired = true;
player.play();

assert.equal(
  mediaUrlRequestCount,
  2,
  'resume after an expired URL should request a fresh media URL'
);
assert.equal(player.playing, true, 'playback should resume with the refreshed URL');

player.pause();
urlExpired = true;
player.play();
assert.equal(
  mediaUrlRequestCount,
  3,
  'a later expiration should be allowed one fresh retry again'
);
assert.equal(player.playing, true, 'playback should resume after later expirations');

player.pause();
rejectEveryPlayback = true;
player.play();
assert.equal(
  mediaUrlRequestCount,
  4,
  'a persistent playback failure should retry only once'
);
assert.equal(player.playing, false, 'persistent playback failures should stop');

console.log('PASS: paused playback refreshes an expired media URL and resumes');
