const root = document.documentElement;
const main = document.querySelector('main');
const views = [...document.querySelectorAll('.view')];
const routeLinks = [...document.querySelectorAll('.route-link')];
const routeStatus = document.querySelector('.route-status');
// 主题切换已移除（站点固定深色）
const themedImages = [...document.querySelectorAll('img[data-light-src][data-dark-src]')];
const pageShell = [document.querySelector('.site-header'), main];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ===== CDN acceleration for images on GitHub Pages ===== */
const IS_GITHUB_PAGES = location.hostname.includes('github.io');
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/Samsara1-1/samsara-portfolio@main/';
if (IS_GITHUB_PAGES) {
  requestIdleCallback(() => {
    document.querySelectorAll('img[src^="assets/"]').forEach(img => {
      img.src = CDN_BASE + img.getAttribute('src');
      if (img.dataset.lightSrc) img.dataset.lightSrc = CDN_BASE + img.dataset.lightSrc;
      if (img.dataset.darkSrc) img.dataset.darkSrc = CDN_BASE + img.dataset.darkSrc;
    });
  }, { timeout: 1200 });

/* 实时跟随滚动中心：滚动过程中只要某页中心靠近视口中心，立刻切它的壁纸。
   解决"从下往上滑时壁纸要等一两秒才换"的问题。rAF 节流避免每帧重排。 */
let lastWallpaperRoute = null;
let wpScrollFrame = null;
function routeFromScrollCenter() {
  /* 吸附是“页顶对齐视口顶”，所以当前页就是 offsetTop 最接近 scrollY 的那页。
     用 offsetTop（稳定、只算一次）而不是 getBoundingClientRect，反向滚动判定更准且不卡。 */
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  let best = views[0]?.dataset.view || 'home';
  let bestDist = Infinity;
  views.forEach(function (view) {
    const dist = Math.abs((view.offsetTop || 0) - y);
    if (dist < bestDist) { bestDist = dist; best = view.dataset.view; }
  });
  return best;
}
function onWallpaperScroll() {
  if (wpScrollFrame) return;
  wpScrollFrame = requestAnimationFrame(function () {
    wpScrollFrame = null;
    const route = routeFromScrollCenter();
    if (route && route !== lastWallpaperRoute) {
      lastWallpaperRoute = route;
      activateWallpaper(route);
    }
  });
}
addEventListener('scroll', onWallpaperScroll, { passive: true });
}

const routeNames = {
  home: '首页',
  systems: '作品与实验',
  research: '热门 AI 话题',
  notes: '学习与折腾笔记',
  about: '关于 Samsara'
};
let activeRoute = 'home';
let routing = false;
let themeChanging = false;
let nativeTransition = null;
let namedTransitionElements = [];
const scrollPositions = { home: 0 };

function getStoredTheme() {
  try { return localStorage.getItem('samsara-theme'); } catch { return null; }
}

function setTheme(theme) {
  root.dataset.theme = theme;
  themedImages.forEach(image => {
    const nextSource = theme === 'dark' ? image.dataset.darkSrc : image.dataset.lightSrc;
    const nextAlt = theme === 'dark' ? image.dataset.darkAlt : image.dataset.lightAlt;
    if (image.getAttribute('src') !== nextSource) image.src = nextSource;
    if (nextAlt) image.alt = nextAlt;
  });
}

function preloadThemeImages(theme) {
  const sources = [...new Set(themedImages.map(image => theme === 'dark' ? image.dataset.darkSrc : image.dataset.lightSrc))];
  return Promise.all(sources.map(source => new Promise(resolve => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = source;
  })));
}

const initialTheme = 'dark';
setTheme(initialTheme);


/* ===== Music player: home-page card, one shared <audio> ===== */
const bgAudio = document.getElementById('bg-audio');
const playerEls = {
  card: document.querySelector('.player-card'),
  art: document.querySelector('[data-player-art]'),
  playBtn: document.querySelector('[data-player-play]'),
  prevBtn: document.querySelector('[data-player-prev]'),
  nextBtn: document.querySelector('[data-player-next]'),
  seek: document.querySelector('[data-player-seek]'),
  volume: document.querySelector('[data-player-volume]'),
  muteBtn: document.querySelector('[data-player-mute]'),
  playLabel: document.querySelector('[data-player-play-label]'),
  title: document.querySelector('[data-player-title]'),
  status: document.querySelector('[data-player-status]'),
  current: document.querySelector('[data-player-current]'),
  duration: document.querySelector('[data-player-duration]'),
  tracksBox: document.querySelector('[data-player-tracks]')
};
const PLAY_TRACKS = [
  { file: 'assets/audio/meditation-impromptu-01.mp3', title: 'Meditation Impromptu 01', note: '钢琴 · 冥想' },
  { file: 'assets/audio/water-lily.mp3', title: 'Water Lily', note: '氛围 · 空灵' },
  { file: 'assets/audio/heartbreaking.mp3', title: 'Heartbreaking', note: '钢琴 · 慢板' }
];
const MEDIA_PREFIX = IS_GITHUB_PAGES ? CDN_BASE : '';
let trackIndex = 0;
let lastVolume = 0.75;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + ':' + String(rest).padStart(2, '0');
}

function trackSrc(index) {
  return MEDIA_PREFIX + PLAY_TRACKS[index].file;
}

function renderTrackChips() {
  if (!playerEls.tracksBox) return;
  playerEls.tracksBox.innerHTML = PLAY_TRACKS.map((track, index) => {
    return '<button type="button" class="player-chip" data-player-track="' + index + '" aria-pressed="false">'
      + (index + 1) + '. ' + escapeHtml(track.title) + ' · ' + escapeHtml(track.note) + '</button>';
  }).join('');
  playerEls.tracksBox.querySelectorAll('[data-player-track]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      setTrack(Number(chip.dataset.playerTrack), { autoplay: true });
    });
  });
}

function syncTrackChips() {
  if (!playerEls.tracksBox) return;
  playerEls.tracksBox.querySelectorAll('[data-player-track]').forEach(function (chip) {
    const active = Number(chip.dataset.playerTrack) === trackIndex;
    chip.classList.toggle('is-current', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function setPlayingUI(playing) {
  playerEls.playBtn?.setAttribute('aria-pressed', String(playing));
  playerEls.playBtn?.setAttribute('aria-label', playing ? '暂停' : '播放');
  if (playerEls.playLabel) playerEls.playLabel.textContent = playing ? '暂停' : '播放';
  playerEls.card?.classList.toggle('is-playing', playing);
  if (playerEls.art) {
    playerEls.art.setAttribute('aria-pressed', String(playing));
    playerEls.art.setAttribute('aria-label', playing ? '抬起唱针，暂停' : '放下唱针，开始播放');
    const hint = playerEls.art.querySelector('[data-art-hint]');
    if (hint) hint.textContent = playing ? '点击抬起唱针' : '点击放下唱针';
  }
}

function updateProgress() {
  if (!playerEls.seek || !playerEls.current || !bgAudio) return;
  const duration = Number.isFinite(bgAudio.duration) ? bgAudio.duration : 0;
  playerEls.current.textContent = formatTime(bgAudio.currentTime);
  if (duration > 0) {
    playerEls.seek.value = String(Math.min(1000, Math.round(bgAudio.currentTime / duration * 1000)));
  }
}

function setTrack(index, { autoplay = false } = {}) {
  if (!bgAudio || !PLAY_TRACKS[index]) return;
  trackIndex = index;
  bgAudio.src = trackSrc(index);
  bgAudio.load();
  if (playerEls.art) {
    playerEls.art.dataset.track = String(index);
    const discNo = playerEls.art.querySelector('[data-disc-no]');
    if (discNo) discNo.textContent = String(index + 1).padStart(2, '0');
  }
  if (playerEls.title) playerEls.title.textContent = PLAY_TRACKS[index].title;
  if (playerEls.status) playerEls.status.textContent = autoplay ? '唱片开始转动…' : '已放上唱片：' + PLAY_TRACKS[index].title + '，点唱臂播放';
  if (playerEls.current) playerEls.current.textContent = '0:00';
  if (playerEls.duration) playerEls.duration.textContent = '0:00';
  if (playerEls.seek) playerEls.seek.value = '0';
  syncTrackChips();
  if (autoplay) {
    bgAudio.play().then(function () {
      setPlayingUI(true);
      if (playerEls.status) playerEls.status.textContent = '唱针落下 · ' + PLAY_TRACKS[index].note;
    }).catch(function () {
      setPlayingUI(false);
      if (playerEls.status) playerEls.status.textContent = '这首暂时不能播放，试试下一首';
    });
  }
}

function togglePlay() {
  if (!bgAudio || !bgAudio.src) return;
  if (bgAudio.paused) {
    bgAudio.play().then(function () {
      setPlayingUI(true);
      if (playerEls.status) playerEls.status.textContent = '唱针落下 · ' + PLAY_TRACKS[trackIndex].note;
    }).catch(function () {
      setPlayingUI(false);
      if (playerEls.status) playerEls.status.textContent = '音频载入失败，请试试其它曲目';
    });
  } else {
    bgAudio.pause();
    setPlayingUI(false);
    if (playerEls.status) playerEls.status.textContent = '唱针抬起 · 已暂停';
  }
}

function stepTrack(direction) {
  if (!PLAY_TRACKS.length) return;
  const next = (trackIndex + direction + PLAY_TRACKS.length) % PLAY_TRACKS.length;
  if (next === trackIndex && PLAY_TRACKS.length === 1) {
    if (bgAudio) { bgAudio.currentTime = 0; }
  }
  setTrack(next, { autoplay: true });
}

playerEls.playBtn?.addEventListener('click', togglePlay);
playerEls.art?.addEventListener('click', togglePlay);
playerEls.prevBtn?.addEventListener('click', function () { stepTrack(-1); });
playerEls.nextBtn?.addEventListener('click', function () { stepTrack(1); });

playerEls.seek?.addEventListener('input', function () {
  if (!bgAudio || !Number.isFinite(bgAudio.duration) || bgAudio.duration <= 0) return;
  bgAudio.currentTime = Number(playerEls.seek.value) / 1000 * bgAudio.duration;
});

playerEls.volume?.addEventListener('input', function () {
  if (!bgAudio) return;
  const value = Number(playerEls.volume.value);
  bgAudio.volume = value;
  if (value > 0) lastVolume = value;
  playerEls.muteBtn?.setAttribute('aria-pressed', String(value === 0));
  try { localStorage.setItem('samsara-volume', String(value)); } catch {}
});

playerEls.muteBtn?.addEventListener('click', function () {
  if (!bgAudio) return;
  const muted = bgAudio.volume === 0;
  bgAudio.volume = muted ? (lastVolume || 0.5) : 0;
  if (playerEls.volume) playerEls.volume.value = String(bgAudio.volume);
  playerEls.muteBtn.setAttribute('aria-pressed', String(!muted));
  if (!muted) lastVolume = bgAudio.volume;
  try { localStorage.setItem('samsara-volume', String(bgAudio.volume)); } catch {}
});

bgAudio?.addEventListener('timeupdate', updateProgress);
bgAudio?.addEventListener('loadedmetadata', function () {
  if (playerEls.duration) playerEls.duration.textContent = formatTime(bgAudio.duration);
});
bgAudio?.addEventListener('ended', function () {
  stepTrack(1);
});
bgAudio?.addEventListener('error', function () {
  setPlayingUI(false);
  if (playerEls.status) playerEls.status.textContent = '这首载入失败，试试下一首';
});

(function initPlayer() {
  renderTrackChips();
  if (!bgAudio) return;
  let storedVolume = null;
  try { storedVolume = localStorage.getItem('samsara-volume'); } catch {}
  const volume = storedVolume === null ? 0.75 : Math.min(1, Math.max(0, Number(storedVolume) || 0.75));
  bgAudio.volume = volume;
  lastVolume = volume > 0 ? volume : 0.75;
  if (playerEls.volume) playerEls.volume.value = String(volume);
  setTrack(0, { autoplay: false });
})();

/* ===== GitHub trending data fetcher ===== */
const trendingGrid = document.getElementById('trending-grid');
const trendingUpdated = document.getElementById('trending-updated');
let currentRepos = [];

function formatStars(n) {
  if (n >= 100000) return (n / 10000).toFixed(1) + ' 万星';
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万星';
  if (n >= 1000) return (n / 1000).toFixed(1) + ' 千星';
  return n + ' 星';
}

function formatDescription(desc, maxLen) {
  if (!desc || desc === '暂无描述' || desc === 'No description') return '';
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen) + '…';
}

function axisStars(n) {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' 万星';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' 千星';
  return String(n) + ' 星';
}

function renderTrending(repos, fetchedAt = null) {
  if (!trendingGrid || !repos?.length) return;
  currentRepos = repos.slice(0, 7);
  const topRepo = [...currentRepos].sort((a, b) => b.stars - a.stars)[0];
  const maxStars = Math.max(1, topRepo.stars);
  const updatedText = fetchedAt
    ? new Date(fetchedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('zh-CN');

  /* 星阶图：七个每日高星项目化作一根根星柱，
     左侧星数刻度、柱顶星标定格热度、底部项目名，
     一天一换，每日同步。 */
  trendingGrid.innerHTML =
      '<p class="trend-chart__date">★ 每日星阶 · 更新于 ' + escapeHtml(updatedText) + '</p>'
    + '<div class="trend-chart__body">'
    +   '<div class="trend-chart__axis" aria-hidden="true">'
    +     '<span style="--f:1">' + axisStars(maxStars) + '</span>'
    +     '<span style="--f:.5">' + axisStars(Math.round(maxStars / 2)) + '</span>'
    +     '<span style="--f:0">0 星</span>'
    +   '</div>'
    +   '<div class="trend-chart__plot">'
    +     currentRepos.map(function (repo, index) {
        const ratio = Math.max(0.08, repo.stars / maxStars);
        const height = Math.round(92 * ratio);
        const stars = formatStars(repo.stars);
        const langText = repo.language && repo.language !== 'N/A' ? repo.language : '';
        const descText = formatDescription(repo.description, 20);
        const metaText = langText ? langText + ' · ' + descText : descText;
        return '<a class="trend-col" href="' + escapeHtml(repo.url) + '" target="_blank" rel="noopener noreferrer"'
          + ' style="--h:' + height + '%;--delay:' + (index * 70) + 'ms"'
          + ' aria-label="' + escapeHtml(repo.name) + '，' + stars + '，' + escapeHtml(metaText) + '，在 GitHub 打开">'
          + '<span class="trend-col__beam" aria-hidden="true"></span>'
          + '<span class="trend-col__star" aria-hidden="true">✦</span>'
          + '<b class="trend-col__count">' + stars + '</b>'
          + '<em class="trend-col__name">' + escapeHtml(repo.name) + '</em>'
          + (metaText ? '<small class="trend-col__meta">' + escapeHtml(metaText) + '</small>' : '')
          + '</a>';
      }).join('')
    +   '</div>'
    + '</div>'
    + '<p class="trend-chart__foot">悬停柱身看简介 · 点击直达仓库 ↗</p>';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      trendingGrid.classList.add('is-in');
    });
  });
}
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
  });
}

async function fetchTrendingLive() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const url = 'https://api.github.com/search/repositories?q=stars:%3E200+created:%3E'
    + since + '&sort=stars&order=desc&per_page=10';
  const res = await withTimeout(fetch(url, { headers: { Accept: 'application/vnd.github+json' } }), 6000);
  if (!res.ok) throw new Error('github api ' + res.status);
  const json = await res.json();
  const repos = (json.items || []).slice(0, 10).map(function (item) {
    return {
      full_name: item.full_name,
      name: item.name,
      owner: item.owner && item.owner.login,
      description: item.description || '暂无描述',
      stars: item.stargazers_count,
      language: item.language || 'N/A',
      url: item.html_url,
      topics: item.topics || []
    };
  });
  return { fetched_at: new Date().toISOString(), repos: repos };
}

async function loadTrending() {
  if (!trendingGrid) return;
  let data = null;
  try { data = await fetchTrendingLive(); } catch (e) { /* 接口超时/限流/断网，走本地 */ }
  if (!data) { try { data = await loadTrendingScript(); } catch (e) { /* 本地脚本也失败 */ } }
  if (data && Array.isArray(data.repos) && data.repos.length) {
    renderTrending(data.repos, data.fetched_at);
    if (trendingUpdated && data.fetched_at) {
      const d = new Date(data.fetched_at);
      trendingUpdated.textContent = '数据更新于 ' + d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      trendingUpdated.hidden = false;
    }
  } else if (trendingGrid) {
    trendingGrid.innerHTML = '<div class="trending-loading">暂时加载不到数据，稍后再试试。</div>';
  }
}

function loadTrendingScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'data/trending.js?v=' + new Date().toISOString().slice(0, 10);
    script.onload = () => {
      const data = window.TRENDING_DATA || null;
      window.TRENDING_DATA = null;
      script.remove();
      if (data && Array.isArray(data.repos)) resolve(data);
      else reject(new Error('trending data empty'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('trending script failed'));
    };
    document.head.appendChild(script);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTrending);
} else {
  loadTrending();
}

/* ===== Anchor pages: all sections stay in one vertical document ===== */
const wallpaperLayers = [...document.querySelectorAll('.wallpaper-layer[data-wallpaper]')];
let wallpaperSwitchTimer = null;

function wallpaperSrcFor(layer) {
  return getComputedStyle(layer).backgroundImage.match(/url\(["']?([^"']+)["']?\)/)?.[1] || '';
}

/* Load a route wallpaper on demand, then crossfade it in over the
   current one. Hidden layers stay display:none, so opening the page
   only decodes the one wallpaper that is actually visible. */
function activateWallpaper(route) {
  if (!wallpaperLayers.length) return;
  const next = wallpaperLayers.find(layer => layer.dataset.wallpaper === route) || wallpaperLayers[0];
  if (!next) return;
  /* 直接让目标层 is-visible、其余全部去掉。CSS 的 opacity 过渡自动完成交叉
     淡入淡出。不做 is-leaving、不用 timer——永远保证恰好一层可见，正反向都稳，
     也不会出现"跳转后壁纸消失"。 */
  wallpaperLayers.forEach(layer => layer.classList.toggle('is-visible', layer === next));
}

/* 空闲时把其余壁纸预先解码好。壁纸都是几百 KB 的大图，
   等到切页时才解码会让那一下明显卡住。 */
function preloadWallpapers() {
  wallpaperLayers.forEach(layer => {
    const src = wallpaperSrcFor(layer);
    if (!src) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
  });
}

if ('requestIdleCallback' in window) requestIdleCallback(preloadWallpapers, { timeout: 3000 });
else setTimeout(preloadWallpapers, 1500);

/* ===== Route highlight =====
   原来在 scroll 事件里对每个 view 调 getBoundingClientRect，每次滚动
   都强制同步布局，滑起来一顿一顿的。改成用 IntersectionObserver 记录
   各 view 的可见比例，比例变化后去抖处理 —— 滚动路径上不再有任何
   布局读取，也不再有全局 class 切换引起的全树样式重算。 */
let routeSettleTimer = null;
const viewRatios = new WeakMap();

function routeFromViewport() {
  let bestRoute = views[0]?.dataset.view || 'home';
  let bestRatio = -1;
  views.forEach(view => {
    const ratio = viewRatios.get(view) ?? 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestRoute = view.dataset.view;
    }
  });
  return bestRoute;
}

function applyRouteFromScroll() {
  const route = routeFromViewport();
  if (!route || route === activeRoute) return;
  activeRoute = route;
  views.forEach(view => {
    const active = view.dataset.view === route;
    view.classList.toggle('is-active', active);
    view.inert = !active;
    view.setAttribute('aria-hidden', String(!active));
  });
  routeLinks.forEach(link => link.toggleAttribute('aria-current', link.dataset.route === route));
  document.title = `${routeNames[route]} / Samsara`;
  activateWallpaper(route);
  if (location.hash !== `#${route}`) history.replaceState({ route }, '', `#${route}`);
}

/* 只在"哪个页面占主体"发生变化时才动 DOM，且延后到滚动停下之后 */
const viewObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => viewRatios.set(entry.target, entry.intersectionRatio));
  if (routeSettleTimer) clearTimeout(routeSettleTimer);
  routeSettleTimer = setTimeout(applyRouteFromScroll, 60);
}, { threshold: [0, .1, .25, .4, .55, .7, .85, 1] });

views.forEach(view => viewObserver.observe(view));

/* 浏览器支持 scrollend 时可以在停稳的瞬间就更新，不必等去抖 */
if ('onscrollend' in window) {
  addEventListener('scrollend', () => {
    if (routeSettleTimer) clearTimeout(routeSettleTimer);
    applyRouteFromScroll();
  }, { passive: true });
}

function showRoute(route, { focus = true, announce = true, scroll = true } = {}) {
  const nextView = views.find(view => view.dataset.view === route) || views[0];
  const targetRoute = nextView.dataset.view;

  views.forEach(view => {
    const active = view === nextView;
    view.classList.toggle('is-active', active);
    view.inert = !active;
    view.setAttribute('aria-hidden', String(!active));
  });
  routeLinks.forEach(link => link.toggleAttribute('aria-current', link.dataset.route === targetRoute));
  activeRoute = targetRoute;
  document.title = `${routeNames[targetRoute]} / Samsara`;

  if (scroll) {
    nextView.scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }
  activateWallpaper(targetRoute);
  if (focus) nextView.querySelector('h1')?.focus({ preventScroll: true });
  if (announce) routeStatus.textContent = `已进入${routeNames[targetRoute]}`;
}

function navigate(route, { push = true } = {}) {
  if (themeChanging) return;
  if (!routeNames[route]) route = 'home';

  showRoute(route, { focus: false, announce: false, scroll: true });
  if (push) history.pushState({ route }, '', `#${route}`);
}

routeLinks.forEach(link => {
  link.addEventListener('click', () => navigate(link.dataset.route));
});

const backLinks = [...document.querySelectorAll('.back-link[data-route]')];
backLinks.forEach(link => {
  link.addEventListener('click', () => navigate(link.dataset.route));
});



addEventListener('popstate', () => {
  showRoute(location.hash.slice(1) || 'home', { focus: false, announce: false, scroll: true });
});

const initialRoute = location.hash.slice(1);
if (routeNames[initialRoute]) {
  showRoute(initialRoute, { focus: false, announce: false, scroll: false });
  requestAnimationFrame(() => {
    views.find(view => view.dataset.view === initialRoute)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  });
} else {
  history.replaceState({ route: 'home' }, '', '#home');
  showRoute('home', { focus: false, announce: false, scroll: false });
}
activateWallpaper(initialRoute || 'home');



/* 视频壁纸淡入：就绪后再显示，避免"暗底->突现" */
(function initBgVideo() {
  const v = document.getElementById('bg-video');
  if (!v) return;
  const show = function () { v.classList.add('is-ready'); };
  if (v.readyState >= 2) show();
  v.addEventListener('loadeddata', show);
  v.addEventListener('canplay', show);
  v.addEventListener('playing', show);
})();

/* 主页光尘粒子：末日雾景上漂浮的细小编尘/光点 */
(function initHomeAtmosphere() {
  const canvas = document.getElementById('home-atmosphere');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  const motes = [];
  const COUNT = reduced ? 0 : 46;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function makeMote(init) {
    return {
      x: Math.random() * W,
      y: init ? Math.random() * H : H + Math.random() * 40,
      r: 0.5 + Math.random() * 1.4,
      speed: 0.1 + Math.random() * 0.32,
      phase: Math.random() * Math.PI * 2,
      sway: 0.14 + Math.random() * 0.34,
      alpha: 0.1 + Math.random() * 0.45
    };
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.speed;
      m.x += Math.sin(t * 0.0007 + m.phase) * m.sway;
      if (m.y < -10) { motes[i] = makeMote(false); continue; }
      const fade = Math.sin(Math.PI * Math.min(1, Math.max(0, m.y / H))) * m.alpha;
      const rad = m.r * 6;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rad);
      g.addColorStop(0, 'rgba(255,250,238,' + fade.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,250,238,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  if (!reduced) {
    for (let i = 0; i < COUNT; i++) motes.push(makeMote(true));
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize, { passive: true });
})();


/* 作品页枫叶：随微风缓缓飘落的红枫叶 */
(function initSystemsLeaves() {
  const canvas = document.getElementById('systems-atmosphere');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  const leaves = [];
  const COUNT = reduced ? 0 : 26;
  const COLORS = ['#c94f3d', '#d66b3c', '#b84038', '#e08a4e', '#a63434'];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function makeLeaf(init) {
    return {
      x: Math.random() * W,
      y: init ? Math.random() * H : -20 - Math.random() * 40,
      size: 4 + Math.random() * 5,
      speed: 0.35 + Math.random() * 0.5,
      drift: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 0.03,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: 0.45 + Math.random() * 0.4
    };
  }
  function drawLeaf(l) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.beginPath();
    ctx.moveTo(0, -l.size);
    ctx.quadraticCurveTo(l.size, 0, 0, l.size);
    ctx.quadraticCurveTo(-l.size, 0, 0, -l.size);
    ctx.fillStyle = l.color;
    ctx.globalAlpha = l.alpha;
    ctx.fill();
    ctx.restore();
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.y += l.speed;
      l.x += Math.sin(t * 0.001 + l.phase) * l.drift;
      l.rot += l.rotSpd;
      if (l.y > H + 20) { leaves[i] = makeLeaf(false); continue; }
      drawLeaf(l);
    }
    requestAnimationFrame(frame);
  }

  resize();
  if (!reduced) {
    for (let i = 0; i < COUNT; i++) leaves.push(makeLeaf(true));
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize, { passive: true });
})();

/* ===== Unified detail dialogs ===== */
const detailModal = document.getElementById('detail-modal');
const detailKicker = document.getElementById('detail-modal-kicker');
const detailTitle = document.getElementById('detail-modal-title');
const detailDesc = document.getElementById('detail-modal-desc');
const detailMeta = document.getElementById('detail-modal-meta');
const detailExtra = document.getElementById('detail-modal-extra');
const detailClose = detailModal?.querySelector('.detail-modal__close');
let lastDetailTrigger = null;
const routeDetailNames = {
  home: '首页内容',
  systems: '作品与实验',
  research: 'GitHub 高星项目',
  notes: '学习与折腾笔记',
  about: '关于 Samsara'
};
const detailNotes = {
  '你画我猜': ['先稳定倒计时、题目切换、答案提交和分数结算。', '下一步处理断线和刷新后的房间状态。', '界面先保持轻，等核心流程稳定再补动画。'],
  '横版闯关': ['用 Canvas 做重力、跳跃、碰撞和镜头跟随。', '重点是把手感调到不别扭，而不是堆关卡。', '下一步做可复用的碰撞判断和地图块。'],
  '塔罗牌占卜': ['抽牌、停顿、翻面、解读各自保持节奏。', '随机结果和展示逻辑分开，方便换牌组。', '下一步增加翻牌前的等待反馈。'],
  '深夜电台': ['页面以安静氛围为主，减少打断式控件。', '把播放状态、封面和歌曲名做成清晰状态线。', '下一步补播放列表和加载失败提示。'],
  '任务小助手': ['把任务拆成搜索、整理、总结三段。', '每一步保留中间结果，方便回看原因。', '下一步试工具调用和状态记录。'],
  '学习看板': ['用周视图记录时间、任务和完成率。', '先记录真实数据，不做复杂预测。', '下一步保存到本地并支持导出。'],
  '倒计时提醒': ['支持专注计时、休息计时和长期目标倒计时。', '提醒保持温和，不靠强弹窗打扰。', '下一步增加暂停原因备注。'],
  '自动摘要': ['长文先拆成要点，再生成结论和来源。', '摘要保留原文链接，避免丢失上下文。', '下一步做长度和语气选择。'],
  '多人游戏比画板更难': ['倒计时、题目、答案和分数需要同一时间线。', '同步才是核心难点，不只是画板内容。', '下一步整理断线和重连处理。'],
  '跳跃手感需要调': ['重力、速度、碰撞边界共同决定手感。', '数值要靠可玩测试，不能只看公式。', '下一步做落地缓冲和短跳/长跳。'],
  '翻牌要慢一点': ['抽牌、停顿、翻面和解读不能挤在一起。', '等待本身就是占卜体验的一部分。', '下一步补充稳定的牌面文案。'],
  '电台不只是按钮': ['封面、文字节奏和留白比控件堆叠更重要。', '页面要像安静的小房间，而不是控制台。', '下一步减少切换时的视觉跳动。'],
  '未上线也有价值': ['未上线记录能暴露真实的完成状态。', '把卡住的问题写清楚，比只说完成更有用。', '下一步按周整理开发日志。'],
  '做项目才会留下知识': ['遇到具体问题再查资料，学完马上使用。', '项目能把零散知识串成可复用经验。', '下一步把踩坑点写进笔记。'],
  '接口要先想失败': ['请求失败、超时、空数据都要有明确反馈。', '不能把成功路径当成唯一路径。', '下一步做统一错误提示组件。'],
  'AI 不是替代思考': ['AI 适合列可能性、补细节和检查遗漏。', '最后判断和取舍仍要自己收口。', '下一步记录协作流程。'],
  '还在摸索方向': ['喜欢把突然冒出来的想法做成能运行的小东西。', '方向优先选小而完整，先跑通再扩展。', '下一步整理稳定的学习路线。'],
  'JavaScript 与交互': ['学习前端交互、Canvas、接口和基础产品设计。', '用小项目验证知识，而不是只看教程。', '下一步补事件循环和状态管理。'],
  '能行动的智能体': ['想让智能体能搜索、调用工具、保存记忆并说明过程。', '先从单任务助手开始，再考虑复杂流程。', '下一步练习 MCP 和工具调用。'],
  '开源实践': ['从高星项目里拆结构、看文档、模仿小部分。', '重点看入口、示例和说明的组织方式。', '下一步整理自己的学习清单。'],
  '清晰表达': ['把技术过程写成别人能看懂的话。', '先讲问题，再讲选择和结果。', '下一步做固定复盘模板。']
};

function escapeHtml(value) {
  const valueText = String(value || '');
  return valueText.replace(/[&<>"']/g, function (ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return '&#39;';
  });
}

function showDetail(info) {
  if (!detailModal) return;
  detailKicker.textContent = info.kicker || '详情';
  detailTitle.textContent = info.title || '未命名';
  detailDesc.textContent = info.description || '这里还没有补充说明。';
  detailMeta.innerHTML = (info.meta || []).filter(Boolean).map(function (item) {
    return `<span>${escapeHtml(item)}</span>`;
  }).join('');
  detailExtra.innerHTML = info.extraHtml || '';
  detailModal.classList.add('is-open');
  detailModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  lastDetailTrigger = info.trigger || document.activeElement;
  detailClose?.focus({ preventScroll: true });
}

function closeDetail(returnFocus) {
  if (!detailModal) return;
  detailModal.classList.remove('is-open');
  detailModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (returnFocus !== false) lastDetailTrigger?.focus({ preventScroll: true });
  lastDetailTrigger = null;
}

function openCardDetail(card) {
  const route = card.closest('.view')?.dataset.view || 'home';
  const kicker = card.querySelector('span')?.textContent.trim() || routeDetailNames[route];
  const title = card.querySelector('h2')?.textContent.trim() || '未命名内容';
  const description = card.querySelector('p')?.textContent.trim() || '这项内容还没有补充说明。';
  const tags = [...card.querySelectorAll('small')].map(item => item.textContent.trim()).filter(Boolean);
  const items = detailNotes[title] || ['这里可以先记录当前进度、下一步要解决的一个问题，以及它和其它内容的联系。'];
  showDetail({
    kicker,
    title,
    description,
    meta: [routeDetailNames[route], ...tags],
    extraHtml: items.map(function (item) {
      return `<li>${escapeHtml(item)}</li>`;
    }).join(''),
    trigger: card
  });
}

function openRepoDetail(repo) {
  const extra = [
    repo.owner ? `仓库作者：${escapeHtml(repo.owner)}` : '',
    repo.stars ? `当前热度：${formatStars(repo.stars)}` : '',
    repo.language !== 'N/A' ? `主要语言：${escapeHtml(repo.language)}` : '',
    repo.topics?.length ? `话题标签：${escapeHtml(repo.topics.slice(0, 4).join('、'))}` : '',
    `<a href="${escapeHtml(repo.url)}" target="_blank" rel="noopener noreferrer">在 GitHub 打开 ${escapeHtml(repo.name)} ↗</a>`
  ].filter(Boolean);
  showDetail({
    kicker: 'GitHub 高星项目',
    title: repo.name,
    description: repo.description || '这个项目还没有描述。',
    meta: [formatStars(repo.stars), repo.language !== 'N/A' ? repo.language : '多语言', repo.topics?.[0] || '开源项目'],
    extraHtml: extra.map(function (item) {
      return `<li>${item}</li>`;
    }).join(''),
    trigger: null
  });
}

function makeCardsInteractive() {
  document.querySelectorAll('button.index-card:not([data-detail-bound])').forEach(function (card) {
    card.dataset.detailBound = '1';
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', function () {
      openCardDetail(card);
    });
  });
}

makeCardsInteractive();

/* ===== Round 45: 作品页红绳签 —— 点签互斥展开 ===== */
function initWishTags() {
  document.querySelectorAll('.wish-tag:not([data-wish-bound])').forEach(function (tag) {
    tag.dataset.wishBound = '1';
    tag.addEventListener('click', function () {
      const li = tag.closest('li');
      const willOpen = !li.classList.contains('is-open');
      document.querySelectorAll('.wish-list li.is-open').forEach(function (other) {
        if (other !== li) {
          other.classList.remove('is-open');
          const otherTag = other.querySelector('.wish-tag');
          if (otherTag) otherTag.setAttribute('aria-expanded', 'false');
        }
      });
      li.classList.toggle('is-open', willOpen);
      tag.setAttribute('aria-expanded', String(willOpen));
    });
  });
}
initWishTags();

/* ===== Round 47: 纸签/便签的互斥展开（挂在容器上的事件委托） ===== */
function initFreeExpand(containerSel, headSel) {
  document.querySelectorAll(containerSel).forEach(function (container) {
    container.addEventListener('click', function (event) {
      const head = event.target.closest(headSel);
      if (!head) return;
      const li = head.closest('li');
      if (!li) return;
      const willOpen = !li.classList.contains('is-open');
      container.querySelectorAll('li.is-open').forEach(function (other) {
        if (other !== li) {
          other.classList.remove('is-open');
          const otherHead = other.querySelector('button[aria-expanded]');
          if (otherHead) otherHead.setAttribute('aria-expanded', 'false');
        }
      });
      li.classList.toggle('is-open', willOpen);
      head.setAttribute('aria-expanded', String(willOpen));
    });
  });
}
/* r57: 笔记说明改为常驻，展开逻辑不再使用 */

detailModal?.addEventListener('click', function (event) {
  if (event.target === detailModal || event.target.closest('[data-close-modal]')) closeDetail();
});

detailClose?.addEventListener('click', function () {
  closeDetail();
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && detailModal?.classList.contains('is-open')) closeDetail(false);
});

// 涟漪星星本身就是 <a href target=_blank>，点击交给浏览器即可。


detailModal?.addEventListener('keydown', function (event) {
  if (event.key !== 'Tab' || !detailModal.classList.contains('is-open')) return;
  const focusables = [...detailModal.querySelectorAll('a[href], button:not([disabled])')];
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});




/* ===== Round 13: clickable mini widgets ===== */
(function initInteractiveWidgets() {
  const now = new Date();

  const bump = (element) => {
    if (!element) return;
    element.classList.remove('is-bump');
    void element.offsetWidth;
    element.classList.add('is-bump');
  };

  /* --- Systems: pixel person states --- */
  const pixelCard = document.querySelector('[data-widget="pixel"]');
  const PIXEL_STATES = [
    { key: 'debug', title: '调试中的像素小人', note: '正在修第 3 个 bug · 点击切换状态' },
    { key: 'run', title: '跑通第一帧的像素小人', note: 'Canvas 碰撞 · 能停住了' },
    { key: 'jump', title: '在调跳跃手感的像素小人', note: '重力 / 速度 / 短跳长跳' },
    { key: 'win', title: '过了第一关的像素小人', note: '关卡 1 · 存档点已放好' }
  ];

  if (pixelCard) {
    const pixelTitle = pixelCard.querySelector('[data-pixel-title]');
    const pixelNote = pixelCard.querySelector('[data-pixel-note]');
    const pixelProgress = pixelCard.querySelector('[data-pixel-progress]');
    let pixelIndex = 0;

    const paintPixel = (index) => {
      const state = PIXEL_STATES[index];
      pixelCard.dataset.pixel = state.key;
      if (pixelTitle) pixelTitle.textContent = state.title;
      if (pixelNote) pixelNote.textContent = state.note;
      if (pixelProgress) {
        [...pixelProgress.children].forEach((dot, dotIndex) => {
          dot.classList.remove('is-done', 'is-active');
          if (dotIndex < index) dot.classList.add('is-done');
          if (dotIndex === index) dot.classList.add('is-active');
        });
      }
      pixelCard.setAttribute('aria-label', state.title + '，点击切换下一个状态');
    };

    pixelCard.addEventListener('click', () => {
      pixelIndex = (pixelIndex + 1) % PIXEL_STATES.length;
      paintPixel(pixelIndex);
      bump(pixelCard);
    });

    paintPixel(0);
  }

  /* --- Notes: study calendar (toggle each weekday) --- */
  const calendarGrid = document.querySelector('[data-calendar-grid]');
  const calendarNote = document.getElementById('calendar-note');

  if (calendarGrid) {
    const todayIndex = (now.getDay() + 6) % 7;
    const cells = [...calendarGrid.querySelectorAll('.mini-calendar__cell')];

    const updateCalendarNote = () => {
      if (!calendarNote) return;
      const lit = cells.filter(cell => cell.classList.contains('is-lit')).length;
      calendarNote.textContent = '今天 ' + (now.getMonth() + 1) + '/' + now.getDate()
        + ' · 点亮 ' + lit + '/7 天，点格子记录或取消';
    };

    cells.forEach((cell, index) => {
      if (index < todayIndex) {
        cell.classList.add('is-lit');
        cell.setAttribute('aria-pressed', 'true');
      }
      if (index === todayIndex) cell.classList.add('is-today');
      cell.addEventListener('click', () => {
        const lit = cell.classList.toggle('is-lit');
        cell.setAttribute('aria-pressed', String(lit));
        bump(cell);
        updateCalendarNote();
      });
    });

    updateCalendarNote();
  }

  /* --- Notes: mood card (cycle phrases) --- */
  const moodCard = document.querySelector('[data-widget="mood"]');
  const MOODS = [
    { title: '今天有点想写代码', note: 'AI 协作', level: 3 },
    { title: '刚跑通一个小页面', note: '前端 · 验证通过', level: 5 },
    { title: '卡在一个报错里', note: '正在查原因', level: 1 },
    { title: '把想法记进了笔记', note: '复盘 · 写清楚', level: 4 },
    { title: '先休息十分钟', note: '摸鱼结束继续写', level: 2 }
  ];

  if (moodCard) {
    const moodTitle = moodCard.querySelector('[data-mood-title]');
    const moodNote = moodCard.querySelector('[data-mood-note]');
    const moodMeter = moodCard.querySelector('[data-mood-meter]');
    const moodTime = document.getElementById('mood-time');
    let moodIndex = 0;

    if (moodTime) {
      moodTime.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    const paintMood = (index) => {
      const mood = MOODS[index];
      if (moodTitle) moodTitle.textContent = mood.title;
      if (moodNote) moodNote.textContent = mood.note;
      if (moodMeter) {
        [...moodMeter.children].forEach((dot, dotIndex) => {
          dot.classList.toggle('is-active', dotIndex === mood.level - 1);
        });
      }
      moodCard.setAttribute('aria-label', mood.title + '，点击再换一条状态');
    };

    moodCard.addEventListener('click', () => {
      moodIndex = (moodIndex + 1) % MOODS.length;
      paintMood(moodIndex);
      bump(moodCard);
    });

    paintMood(0);
  }

  /* --- About: avatar expression states --- */
  const avatarCard = document.querySelector('[data-widget="avatar"]');
  const AVATAR_STATES = [
    { expr: 'smile', title: '在线折腾中', time: '在线', sub: '可约聊' },
    { expr: 'focus', title: '写代码中', time: '专注', sub: '先不打扰' },
    { expr: 'joy', title: '刚跑通新页面', time: '开心', sub: '欢迎来逛' },
    { expr: 'sleep', title: '夜航模式', time: '夜航中', sub: '明天回消息' }
  ];

  if (avatarCard) {
    const avatarTitle = avatarCard.querySelector('[data-avatar-title]');
    const avatarTime = document.getElementById('avatar-time');
    const avatarSub = document.getElementById('avatar-sub');
    let avatarIndex = 0;

    const paintAvatar = (index) => {
      const state = AVATAR_STATES[index];
      avatarCard.dataset.expr = state.expr;
      if (avatarTitle) avatarTitle.textContent = state.title;
      if (avatarTime) avatarTime.textContent = state.time;
      if (avatarSub) avatarSub.textContent = state.sub;
      avatarCard.setAttribute('aria-label', '当前状态：' + state.time + ' · ' + state.sub + '，点头像切换');
    };

    avatarCard.addEventListener('click', () => {
      avatarIndex = (avatarIndex + 1) % AVATAR_STATES.length;
      paintAvatar(avatarIndex);
      bump(avatarCard);
    });

    paintAvatar(0);
  }
})();



