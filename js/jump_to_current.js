/* global l1Player */
/*
常驻悬浮按钮：点击跳转定位到当前歌单正在播放的曲目。

实现说明：
- 页面存在多个歌单区域：底部歌单面板（.footer .menu，默认收起）、
  主界面歌单浏览页（.browser）等。.playing 高亮行可能落在收起面板里，
  直接滚动它用户看不到。
- 正确策略：取当前播放曲目 id，在「可见」的歌单区域内查找该行并滚动。
  可见 = 元素在视口内（getBoundingClientRect 与视口有交集），且容器本身可见。
- 滚动方式：直接设置滚动容器 scrollTop（对 overflow-y: scroll 必然生效），
  目标行居中。

事件绑定：body 捕获阶段事件委托。
*/
(function initJumpToCurrent() {
  function currentPlayingId() {
    const playing =
      window.l1Player &&
      window.l1Player.status &&
      window.l1Player.status.playing;
    return playing && typeof playing === 'object' ? playing.id : null;
  }

  function isVisibleInViewport(el) {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.top < window.innerHeight &&
      r.right > 0 &&
      r.left < window.innerWidth
    );
  }

  function locateCurrentRow() {
    // 主内容区歌曲列表和底部歌单面板都可能带 .playing 高亮，
    // 取「可见」的那个（过滤掉收起面板/隐藏分支里的行）
    const highlighted = Array.from(
      document.querySelectorAll('li.playing')
    ).filter((li) => isVisibleInViewport(li) && li.offsetParent !== null);
    if (highlighted.length) {
      return highlighted[0];
    }

    // 兜底：按当前播放 id 反查 li[id^="song"] 中的可见行
    const id = currentPlayingId();
    if (id) {
      const rows = Array.from(
        document.querySelectorAll('li[id^="song"]')
      ).filter((li) => li.id === 'song' + id || li.id === id);
      const visible = rows.find(isVisibleInViewport);
      if (visible) return visible;
      if (rows.length) return rows[0];
    }
    return null;
  }

  function scrollToCurrentSong() {
    const el = locateCurrentRow();
    if (!el) {
      // eslint-disable-next-line no-console
      console.log('[jump] 未找到当前播放曲目行');
      return;
    }

    const container = el.closest('.menu-list') || el.closest('.browser');
    if (!container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const contRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetInContent = container.scrollTop + (elRect.top - contRect.top);
    const target =
      offsetInContent - (container.clientHeight / 2 - elRect.height / 2);
    const to = Math.max(0, target);

    container.scrollTop = to;

    // eslint-disable-next-line no-console
    console.log('[jump]', JSON.stringify({
      target: el.id,
      scrollTopTo: to,
      after: container.scrollTop,
      container: container.className,
      visible: isVisibleInViewport(el),
    }));
  }

  document.addEventListener(
    'click',
    (e) => {
      const btn =
        e.target && e.target.closest
          ? e.target.closest('.jump-to-current')
          : null;
      if (btn) {
        scrollToCurrentSong();
      }
    },
    true
  );
})();
