/* eslint-disable no-unused-vars */
/* global GithubClient */
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create(
    {
      url: chrome.runtime.getURL('listen1.html'),
    },
    (new_tab) => {
      // Tab opened.
    }
  );
});

// const MOBILE_UA =
//   'Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30';

// function hack_referer_header(details) {
//   const replace_referer = true;
//   let replace_origin = true;
//   let add_referer = true;
//   let add_origin = true;

//   let referer_value = '';
//   let origin_value = '';
//   let ua_value = '';

//   if (details.url.includes('://music.163.com/')) {
//     referer_value = 'https://music.163.com/';
//   }
//   if (details.url.includes('://interface3.music.163.com/')) {
//     referer_value = 'https://music.163.com/';
//   }
//   if (details.url.includes('://gist.githubusercontent.com/')) {
//     referer_value = 'https://gist.githubusercontent.com/';
//   }

//   if (details.url.includes('.xiami.com/')) {
//     add_origin = false;
//     add_referer = false;
//     // referer_value = "https://www.xiami.com";
//   }

//   if (details.url.includes('c.y.qq.com/')) {
//     referer_value = 'https://y.qq.com/';
//     origin_value = 'https://y.qq.com';
//   }
//   if (
//     details.url.includes('i.y.qq.com/') ||
//     details.url.includes('qqmusic.qq.com/') ||
//     details.url.includes('music.qq.com/') ||
//     details.url.includes('imgcache.qq.com/')
//   ) {
//     referer_value = 'https://y.qq.com/';
//   }

//   if (details.url.includes('.kugou.com/')) {
//     referer_value = 'https://www.kugou.com/';
//     ua_value = MOBILE_UA;
//   }
//   if (details.url.includes('m.kugou.com/')) {
//     ua_value = MOBILE_UA;
//   }
//   if (details.url.includes('.kuwo.cn/')) {
//     referer_value = 'https://www.kuwo.cn/';
//   }

//   if (
//     details.url.includes('.bilibili.com/') ||
//     details.url.includes('.bilivideo.com/')
//   ) {
//     referer_value = 'https://www.bilibili.com/';
//     replace_origin = false;
//     add_origin = false;
//   }

//   if (details.url.includes('.bilivideo.cn')) {
//     referer_value = 'https://www.bilibili.com/';
//     origin_value = 'https://www.bilibili.com/';
//     add_referer = true;
//     add_origin = true;
//   }

//   if (
//     details.url.includes('.taihe.com/') ||
//     details.url.includes('music.91q.com')
//   ) {
//     referer_value = 'https://music.taihe.com/';
//   }

//   if (details.url.includes('.migu.cn')) {
//     referer_value = 'https://music.migu.cn/v3/music/player/audio?from=migu';
//   }

//   if (details.url.includes('m.music.migu.cn')) {
//     referer_value = 'https://m.music.migu.cn/';
//   }

//   if (
//     details.url.includes('app.c.nf.migu.cn') ||
//     details.url.includes('d.musicapp.migu.cn')
//   ) {
//     ua_value = MOBILE_UA;
//     add_origin = false;
//     add_referer = false;
//   }

//   if (details.url.includes('jadeite.migu.cn')) {
//     ua_value = 'okhttp/3.12.12';
//     add_origin = false;
//     add_referer = false;
//   }

//   if (origin_value === '') {
//     origin_value = referer_value;
//   }

//   let isRefererSet = false;
//   let isOriginSet = false;
//   let isUASet = false;
//   const headers = details.requestHeaders;
//   const blockingResponse = {};

//   for (let i = 0, l = headers.length; i < l; i += 1) {
//     if (
//       replace_referer &&
//       headers[i].name === 'Referer' &&
//       referer_value !== ''
//     ) {
//       headers[i].value = referer_value;
//       isRefererSet = true;
//     }
//     if (replace_origin && headers[i].name === 'Origin' && origin_value !== '') {
//       headers[i].value = origin_value;
//       isOriginSet = true;
//     }
//     if (headers[i].name === 'User-Agent' && ua_value !== '') {
//       headers[i].value = ua_value;
//       isUASet = true;
//     }
//   }

//   if (add_referer && !isRefererSet && referer_value !== '') {
//     headers.push({
//       name: 'Referer',
//       value: referer_value,
//     });
//   }

//   if (add_origin && !isOriginSet && origin_value !== '') {
//     headers.push({
//       name: 'Origin',
//       value: origin_value,
//     });
//   }

//   if (!isUASet && ua_value !== '') {
//     headers.push({
//       name: 'User-Agent',
//       value: ua_value,
//     });
//   }

//   blockingResponse.requestHeaders = headers;
//   return blockingResponse;
// }

// const urls = [
//   '*://*.music.163.com/*',
//   '*://music.163.com/*',
//   '*://*.xiami.com/*',
//   '*://i.y.qq.com/*',
//   '*://c.y.qq.com/*',
//   '*://*.kugou.com/*',
//   '*://*.kuwo.cn/*',
//   '*://*.bilibili.com/*',
//   '*://*.bilivideo.com/*',
//   '*://*.bilivideo.cn/*',
//   '*://*.migu.cn/*',
//   '*://*.githubusercontent.com/*',
// ];

// try {
//   chrome.webRequest.onBeforeSendHeaders.addListener(
//     hack_referer_header,
//     {
//       urls,
//     },
//     ['requestHeaders', 'blocking', 'extraHeaders']
//   );
// } catch (err) {
//   // before chrome v72, extraHeader is not supported
//   chrome.webRequest.onBeforeSendHeaders.addListener(
//     hack_referer_header,
//     {
//       urls,
//     },
//     ['requestHeaders', 'blocking']
//   );
// }

/**
 * Get tokens.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== 'code') {
    return;
  }

  GithubClient.github.handleCallback(request.code);
  sendResponse();
});

/**
 * Offscreen document lifecycle (Manifest V3).
 *
 * MV3 removed the persistent background page, so the audio player has no DOM to
 * live in. chrome.offscreen provides one: an invisible document that this
 * service worker creates and that survives the UI tab being closed. The
 * AUDIO_PLAYBACK reason is what keeps it (and this worker) alive while a track
 * is playing.
 *
 * Only one offscreen document may exist per extension, so creation is
 * serialised through a single in-flight promise.
 */

const OFFSCREEN_PATH = 'offscreen.html';
let creatingOffscreenDocument = null;
let waitingForOffscreenReady = false;
const pendingPlayerCommands = [];

async function hasOffscreenDocument() {
  if (!chrome.offscreen) {
    return false;
  }
  // getContexts is the supported check from Chromium 116 on.
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    // Browser too old for the offscreen API. The UI falls back to playing in
    // the page itself, so report failure instead of throwing.
    return false;
  }

  if (await hasOffscreenDocument()) {
    return true;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return true;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification:
      'Play music in the background so playback survives closing the UI tab.',
  });

  try {
    await creatingOffscreenDocument;
    return true;
  } catch (err) {
    // A concurrent call may have won the race. Chromium reports that as
    // "Only a single offscreen document may be created", which means the
    // document we wanted already exists -- success, not failure. This also
    // covers browsers without runtime.getContexts(), where hasOffscreenDocument
    // cannot confirm it any other way.
    const message = (err && err.message) || '';
    if (message.indexOf('single offscreen document') !== -1) {
      return true;
    }
    return hasOffscreenDocument();
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function ensureAndDispatchPlayerCommands() {
  if (waitingForOffscreenReady) {
    return;
  }

  if (await hasOffscreenDocument()) {
    const commands = pendingPlayerCommands.splice(0);
    commands.forEach((command) => {
      chrome.runtime
        .sendMessage({ type: 'L1_PLAYER_CMD', ...command })
        .catch(() => {
          // The document can be reclaimed between the context check and this
          // dispatch. Keep the command so the next ready event can retry it.
          pendingPlayerCommands.unshift(command);
          waitingForOffscreenReady = false;
        });
    });
    return;
  }

  waitingForOffscreenReady = true;
  const created = await ensureOffscreenDocument();
  if (!created) {
    waitingForOffscreenReady = false;
    pendingPlayerCommands.length = 0;
  }
}

async function handleOffscreenReady() {
  waitingForOffscreenReady = false;

  // A newly created player has no playlist. Restore it before replaying the
  // command that woke the service worker, otherwise togglePlayPause runs
  // against an empty player.
  try {
    await chrome.runtime.sendMessage({
      type: 'L1_PLAYER_CMD',
      method: 'connectPlayer',
      args: [],
    });
  } catch (err) {
    // The readiness message proves the receiver exists. Some Chromium builds
    // still reject fire-and-forget messages when no response is sent.
  }

  await ensureAndDispatchPlayerCommands();
  chrome.runtime
    .sendMessage({ type: 'BG_PLAYER:OFFSCREEN_READY' })
    .catch(() => {});
}

// The UI asks for the offscreen document to exist before it sends any player
// command. Kept separate from the 'code' listener above so the OAuth path is
// untouched.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.type !== 'L1_ENSURE_OFFSCREEN') {
    return undefined;
  }
  ensureOffscreenDocument().then((ok) => {
    sendResponse({ ok });
  });
  // Keep the message channel open for the async reply.
  return true;
});

// Player commands first wake the service worker. This keeps resume working
// after Chromium reclaims an idle AUDIO_PLAYBACK offscreen document.
chrome.runtime.onMessage.addListener((request) => {
  if (!request || typeof request.type !== 'string') {
    return undefined;
  }

  if (request.type === 'L1_OFFSCREEN_READY') {
    handleOffscreenReady();
    return undefined;
  }

  if (request.type !== 'L1_PLAYER_COMMAND') {
    return undefined;
  }

  pendingPlayerCommands.push({
    method: request.method,
    args: Array.isArray(request.args) ? request.args : [],
  });
  ensureAndDispatchPlayerCommands();
  return undefined;
});
