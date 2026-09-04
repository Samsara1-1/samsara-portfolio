const root = document.documentElement;
const main = document.querySelector('main');
const views = [...document.querySelectorAll('.view')];
const routeLinks = [...document.querySelectorAll('.route-link')];
const routeStatus = document.querySelector('.route-status');
const themeToggle = document.querySelector('.theme-toggle');
const musicToggle = document.querySelector('.music-toggle');
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
  themeToggle.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
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

const initialTheme = getStoredTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
setTheme(initialTheme);
const preloadAlternateTheme = () => preloadThemeImages(initialTheme === 'dark' ? 'light' : 'dark');
if ('requestIdleCallback' in window) requestIdleCallback(preloadAlternateTheme, { timeout: 1500 });
else setTimeout(preloadAlternateTheme, 0);

themeToggle.addEventListener('click', async () => {
  if (routing || themeChanging) return;
  themeChanging = true;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  await preloadThemeImages(next);

  const commit = () => {
    setTheme(next);
    try { localStorage.setItem('samsara-theme', next); } catch {}
  };

  if (reducedMotion.matches || typeof document.startViewTransition !== 'function') {
    commit();
    themeChanging = false;
    return;
  }

  main.classList.add('route-changing');
  pageShell.forEach(element => { if (element) element.inert = true; });
  const currentView = views.find(view => view.dataset.view === activeRoute);
  namedTransitionElements = nameTransitionRegions(currentView);
  const transition = document.startViewTransition(async () => {
    clearTransitionNames(namedTransitionElements);
    commit();
    const visibleImages = [...currentView.querySelectorAll('img[data-light-src][data-dark-src]')];
    await Promise.all(visibleImages.map(image => image.decode().catch(() => {})));
    namedTransitionElements = nameTransitionRegions(currentView);
  });
  transition.finished.catch(() => {}).finally(() => {
    clearTransitionNames(namedTransitionElements);
    namedTransitionElements = [];
    main.classList.remove('route-changing');
    pageShell.forEach(element => { if (element) element.inert = false; });
    themeChanging = false;
  });
});

/* ===== Music player: ambient audio via <audio> element ===== */
const bgAudio = document.getElementById('bg-audio');
let musicPlaying = false;

musicToggle.addEventListener('click', () => {
  if (!bgAudio) return;
  if (musicPlaying) {
    bgAudio.pause();
    musicPlaying = false;
    musicToggle.setAttribute('aria-pressed', 'false');
    musicToggle.setAttribute('aria-label', '播放背景音乐');
    musicToggle.title = '播放背景音乐';
    musicToggle.classList.remove('is-playing');
  } else {
    bgAudio.play().then(() => {
      musicPlaying = true;
      musicToggle.setAttribute('aria-pressed', 'true');
      musicToggle.setAttribute('aria-label', '暂停背景音乐');
      musicToggle.title = '暂停背景音乐';
      musicToggle.classList.add('is-playing');
    }).catch(() => {
      musicToggle.disabled = true;
      musicToggle.setAttribute('aria-label', '音频加载失败');
    });
  }
});

bgAudio?.addEventListener('ended', () => {
  musicPlaying = false;
  musicToggle.setAttribute('aria-pressed', 'false');
  musicToggle.classList.remove('is-playing');
});

/* ===== GitHub trending data fetcher ===== */
const trendingGrid = document.getElementById('trending-grid');
const trendingUpdated = document.getElementById('trending-updated');

function formatStars(n) {
  if (n >= 100000) return (n / 10000).toFixed(1) + ' 万星';
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万星';
  if (n >= 1000) return (n / 1000).toFixed(1) + ' 千星';
  return n + ' 星';
}

function formatDescription(desc, maxLen) {
  if (!desc || desc === '暂无描述' || desc === 'No description') return '暂无描述。';
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen) + '…';
}

function renderTrending(repos) {
  if (!trendingGrid || !repos?.length) return;
  trendingGrid.innerHTML = repos.map(repo => {
    const desc = formatDescription(repo.description, 72);
    const stars = formatStars(repo.stars);
    const lang = repo.language !== 'N/A' ? `<em>${repo.language}</em>` : '';
    const topics = (repo.topics || []).map(t => `<small>${t}</small>`).join(' ');
    return `<a href="${repo.url}" target="_blank" rel="noopener noreferrer">
      <span>${stars}${lang ? ' · ' + lang : ''}</span>
      <h3>${repo.name}</h3>
      <p>${desc}</p>
      ${topics ? `<b>${topics} ↗</b>` : `<b>查看项目 ↗</b>`}
    </a>`;
  }).join('');
}

async function loadTrending() {
  if (!trendingGrid) return;
  try {
    const res = await fetch('data/trending.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    renderTrending(data.repos);
    if (trendingUpdated && data.fetched_at) {
      const d = new Date(data.fetched_at);
      trendingUpdated.textContent = `数据更新于 ${d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      trendingUpdated.hidden = false;
    }
  } catch {
    if (trendingGrid) {
      trendingGrid.innerHTML = '<div class="trending-loading">暂时加载不到数据，稍后再试试。</div>';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTrending);
} else {
  loadTrending();
}

const regionSelector = [
  '.hero-copy', '.hero-visual', '.fold-route', '.home-marquee',
  '.view-heading', '.system-project', '.research-grid article',
  '.github-grid a', '.research-strip', '.notes-list article',
  '.about-layout > *'
].join(',');

function visibleRegions(view) {
  return [...view.querySelectorAll(regionSelector)]
    .filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    })
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.top - b.top || a.left - b.left;
    })
    .slice(0, 5);
}

function nameTransitionRegions(view) {
  view.style.viewTransitionName = 'fold-shell';
  const regions = visibleRegions(view);
  regions.forEach((element, index) => { element.style.viewTransitionName = `fold-${index + 1}`; });
  return [view, ...regions];
}

function clearTransitionNames(elements) {
  elements.forEach(element => { element.style.viewTransitionName = ''; });
}

function showRoute(route, { focus = true, restore = false, announce = true } = {}) {
  const nextView = views.find(view => view.dataset.view === route) || views[0];
  views.forEach(view => {
    const active = view === nextView;
    view.classList.toggle('is-active', active);
    view.setAttribute('aria-hidden', String(!active));
  });
  routeLinks.forEach(link => link.toggleAttribute('aria-current', link.dataset.route === route));
  activeRoute = route;
  document.title = `${routeNames[route]} / Samsara`;
  scrollTo({ top: restore ? (scrollPositions[route] || 0) : 0, behavior: 'auto' });
  if (focus) nextView.querySelector('h1')?.focus({ preventScroll: true });
  if (announce) routeStatus.textContent = `已进入${routeNames[route]}`;
}

function cancelRouteTransition() {
  nativeTransition?.skipTransition();
  nativeTransition = null;
  clearTransitionNames(namedTransitionElements);
  namedTransitionElements = [];
  main.classList.remove('route-changing');
  pageShell.forEach(element => { if (element) element.inert = false; });
  routing = false;
}

function navigate(route, { push = true, restore = false } = {}) {
  if (themeChanging) return;
  if (!routeNames[route]) route = 'home';
  if (route === activeRoute) {
    if (routing) cancelRouteTransition();
    if (location.hash !== `#${route}`) history.replaceState({ route }, '', `#${route}`);
    return;
  }

  scrollPositions[activeRoute] = scrollY;
  cancelRouteTransition();

  const commit = () => {
    showRoute(route, { focus: false, restore, announce: false });
    if (push) history.pushState({ route }, '', `#${route}`);
  };
  const complete = () => {
    main.classList.remove('route-changing');
    pageShell.forEach(element => { if (element) element.inert = false; });
    routing = false;
    nativeTransition = null;
    clearTransitionNames(namedTransitionElements);
    namedTransitionElements = [];
    views.find(view => view.dataset.view === route)?.querySelector('h1')?.focus({ preventScroll: true });
    routeStatus.textContent = `已进入${routeNames[route]}`;
  };

  if (reducedMotion.matches || typeof document.startViewTransition !== 'function') {
    commit();
    complete();
    return;
  }

  routing = true;
  main.classList.add('route-changing');
  pageShell.forEach(element => { if (element) element.inert = true; });
  const oldView = views.find(view => view.dataset.view === activeRoute);
  namedTransitionElements = nameTransitionRegions(oldView);
  nativeTransition = document.startViewTransition(() => {
    clearTransitionNames(namedTransitionElements);
    commit();
    const newView = views.find(view => view.dataset.view === route);
    namedTransitionElements = nameTransitionRegions(newView);
  });
  nativeTransition.finished.catch(() => {}).finally(complete);
}

routeLinks.forEach(link => link.addEventListener('click', () => navigate(link.dataset.route)));
addEventListener('popstate', () => navigate(location.hash.slice(1) || 'home', { push: false, restore: true }));

const initialRoute = location.hash.slice(1);
if (routeNames[initialRoute]) showRoute(initialRoute, { focus: false, announce: false });
else {
  history.replaceState({ route: 'home' }, '', '#home');
  showRoute('home', { focus: false, announce: false });
}
