import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../js/player_thread.js', import.meta.url),
  'utf8'
);

function createPlayerContext(storage) {
  class FakeHowl {
    constructor(options) {
      this.options = options;
      this.isPlaying = false;
      this.position = 0;
    }

    play() {
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

    seek(position) {
      if (typeof position === 'number') {
        this.position = position;
      }
      return this.position;
    }

    rate() {
      return 1;
    }
  }

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
      bootstrapTrack(track, success) {
        success({
          url: `https://media.test/${track.id}.mp3`,
          bitrate: 320,
          platform: 'test',
        });
      },
    },
    localStorage: {
      getObject(key) {
        return storage[key] || null;
      },
      setObject(key, value) {
        storage[key] = value;
      },
      removeItem(key) {
        delete storage[key];
      },
    },
    navigator: {
      mediaSession: {
        playbackState: 'none',
        setActionHandler() {},
        setPositionState() {},
      },
    },
    playerSendMessage() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    window: {},
  };

  vm.runInNewContext(source, context, { filename: 'player_thread.js' });
  return context.window.threadPlayer;
}

const sharedStorage = {};
const track = {
  id: 'resume-track',
  source: 'test',
  title: 'Position resume test',
  artist: 'Listen 1',
};

const pausedPlayer = createPlayerContext(sharedStorage);
pausedPlayer.setNewPlaylist([track]);
pausedPlayer.play();
pausedPlayer.currentHowl.seek(42);
pausedPlayer.pause();

assert.equal(
  JSON.stringify(sharedStorage['player-resume-position']),
  JSON.stringify({ id: 'resume-track', position: 42 }),
  'pausing should persist the current track and its playback position'
);

const restoredPlayer = createPlayerContext(sharedStorage);
restoredPlayer.setNewPlaylist([track]);
restoredPlayer.play();

assert.equal(
  restoredPlayer.currentHowl.seek(),
  42,
  'a recreated player should resume from the persisted pause position'
);

console.log('PASS: a reclaimed player restores the paused playback position');
