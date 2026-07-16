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

let audioContext = null;
let musicTimer = null;
let musicPlaying = false;
let musicStarting = false;
const activeTones = new Set();
const melody = [261.63, 329.63, 392, 493.88, 440, 392, 329.63, 293.66];

function scheduleMelody() {
  const start = audioContext.currentTime + 0.04;
  melody.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = start + index * 0.75;
    const noteEnd = noteStart + 2.1;
    oscillator.type = index % 2 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.022, noteStart + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
    activeTones.add(oscillator);
    oscillator.addEventListener('ended', () => activeTones.delete(oscillator), { once: true });
  });
}

async function startMusic() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  scheduleMelody();
  musicTimer = setInterval(scheduleMelody, 6000);
  musicPlaying = true;
  musicToggle.setAttribute('aria-pressed', 'true');
  musicToggle.setAttribute('aria-label', '暂停背景音乐');
  musicToggle.title = '暂停背景音乐';
  musicToggle.classList.add('is-playing');
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
  activeTones.forEach(oscillator => {
    try { oscillator.stop(); } catch {}
  });
  activeTones.clear();
  musicPlaying = false;
  musicToggle.setAttribute('aria-pressed', 'false');
  musicToggle.setAttribute('aria-label', '播放背景音乐');
  musicToggle.title = '播放背景音乐';
  musicToggle.classList.remove('is-playing');
}

musicToggle.addEventListener('click', async () => {
  if (musicStarting) return;
  if (musicPlaying) stopMusic();
  else {
    musicStarting = true;
    try { await startMusic(); }
    finally { musicStarting = false; }
  }
});

if (!('AudioContext' in window) && !('webkitAudioContext' in window)) {
  musicToggle.disabled = true;
  musicToggle.setAttribute('aria-label', '当前浏览器不支持背景音乐');
  musicToggle.title = '当前浏览器不支持背景音乐';
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
