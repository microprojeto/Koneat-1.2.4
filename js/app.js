/* ============================================================================
   KONEAT SPA — AUTH + STORE ÚNICO + INDEXEDDB (50MB) + PLAYER CENTRAL
   ============================================================================ */

const STORE_KEY = 'koneat_unified_v6';
const DB_NAME = 'koneat-db';
const DB_STORE = 'videos';
const MAX_VIDEO = 50 * 1024 * 1024; // 50MB

const INITIAL_STORE = {
  isAuthenticated: false,
  user: {
    name: '',
    handle: '',
    email: '',
    bio: '',
    birth: '',
    gender: '',
    avatar: '',
    followers: 0,
    following: 0
  },
  settings: {
    notifications: true,
    privateAccount: true
  },
  hiddenViralIds: [],
  blockedAuthors: [],
  stories: [],
  posts: []
};

let store = loadStore();
let activeScreen = 'profile';
let previousScreen = 'profile';
let homeTab = 'pra-voce';
let profileTab = 'todos';
let isCreateFullscreen = false;
let currentCommentPostId = null;
let storyTimer = null;

const objectUrlCache = new Map();

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      localStorage.setItem(STORE_KEY, JSON.stringify(INITIAL_STORE));
      return JSON.parse(JSON.stringify(INITIAL_STORE));
    }
    const parsed = JSON.parse(raw);
    if (!parsed.user) parsed.user = JSON.parse(JSON.stringify(INITIAL_STORE.user));
    if (typeof parsed.user.bio !== 'string') parsed.user.bio = '';
    if (!parsed.settings) parsed.settings = { notifications: true, privateAccount: true };
    if (!Array.isArray(parsed.hiddenViralIds)) parsed.hiddenViralIds = [];
    if (!Array.isArray(parsed.blockedAuthors)) parsed.blockedAuthors = [];
    return parsed;
  } catch (e) {
    return JSON.parse(JSON.stringify(INITIAL_STORE));
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    openToast('Aviso: limite de armazenamento de texto atingido.');
  }
}

// ----------------------------------------------------------------------------
// AUTENTICAÇÃO (LOGIN / CRIE SUA CONTA / RECUPERE SEU ACESSO -> PERFIL)
// ----------------------------------------------------------------------------
function showAuthView(view) {
  document.getElementById('screen-auth').classList.add('active');
  document.getElementById('bottom-nav').classList.add('hidden');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  ['login', 'register', 'recover'].forEach(v => {
    const el = document.getElementById('auth-view-' + v);
    if (el) el.classList.toggle('hidden', v !== view);
  });
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  if (btnEl) btnEl.style.opacity = showing ? '0.75' : '1';
}

function setupCodeBoxes(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const boxes = Array.from(wrap.querySelectorAll('.code-box'));

  boxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && idx < boxes.length - 1) {
        boxes[idx + 1].focus();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        boxes[idx - 1].focus();
      }
    });
  });
}

function getCodeValue(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return '';
  return Array.from(wrap.querySelectorAll('.code-box')).map(b => b.value).join('');
}

function clearCodeBoxes(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.code-box').forEach(b => { b.value = ''; });
}

function completeAuthAndRedirectToProfile({ email, handle, name, message }) {
  if (email) store.user.email = email;
  if (handle) {
    const normalized = handle.startsWith('@') ? handle : '@' + handle;
    store.user.handle = normalized;
    store.posts.forEach(p => { p.authorHandle = normalized; });
  }
  if (name) store.user.name = name;

  store.isAuthenticated = true;
  saveStore();

  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('bottom-nav').classList.remove('hidden');

  if (message) openToast(message);
  go('profile');
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!email) {
    openToast('Digite seu e-mail.');
    return;
  }
  if (!password) {
    openToast('Digite sua senha.');
    return;
  }

  completeAuthAndRedirectToProfile({
    email,
    message: 'Bem-vindo de volta ao Koneat!'
  });
}

function handleGoogleAuth() {
  completeAuthAndRedirectToProfile({
    email: store.user.email || 'conta.google@koneat.app',
    name: store.user.name || 'Usuário Google',
    message: 'Entrou com o Google!'
  });
}

function handleRegisterSubmit(e) {
  e.preventDefault();
  const handle = document.getElementById('reg-handle').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const code = getCodeValue('reg-code-boxes');

  if (!handle) {
    openToast('Digite seu @usuário.');
    return;
  }
  if (!email) {
    openToast('Digite seu e-mail.');
    return;
  }
  if (!password) {
    openToast('Digite sua senha.');
    return;
  }
  if (code.length < 6) {
    openToast('Digite o código de 6 dígitos enviado ao seu e-mail.');
    return;
  }

  clearCodeBoxes('reg-code-boxes');
  completeAuthAndRedirectToProfile({
    handle,
    email,
    message: 'Conta criada com sucesso!'
  });
}

function handleRecoverSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('rec-email').value.trim();
  const newPassword = document.getElementById('rec-password').value.trim();
  const code = getCodeValue('rec-code-boxes');

  if (!email) {
    openToast('Digite o e-mail da conta.');
    return;
  }
  if (!newPassword) {
    openToast('Digite sua nova senha.');
    return;
  }
  if (code.length < 6) {
    openToast('Digite o código de recuperação de 6 dígitos.');
    return;
  }

  clearCodeBoxes('rec-code-boxes');
  completeAuthAndRedirectToProfile({
    email,
    message: 'Acesso recuperado com sucesso!'
  });
}

function logoutToAuth() {
  CentralVideoController.syncAllVideos();
  store.isAuthenticated = false;
  saveStore();
  showAuthView('login');
  openToast('Você saiu da conta.');
}

// ----------------------------------------------------------------------------
// INDEXEDDB (koneat-db / store videos — Blobs até 50MB)
// ----------------------------------------------------------------------------
function openKoneatDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveMediaBlobToDB(id, blob) {
  const db = await openKoneatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => {
      const url = URL.createObjectURL(blob);
      objectUrlCache.set(id, url);
      resolve(url);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaUrlFromDB(id) {
  if (!id) return null;
  if (objectUrlCache.has(id)) return objectUrlCache.get(id);
  try {
    const db = await openKoneatDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          const url = URL.createObjectURL(req.result.blob);
          objectUrlCache.set(id, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function hydrateIndexedDBMedia() {
  const elements = document.querySelectorAll('[data-db-id]');
  for (const el of elements) {
    const dbId = el.getAttribute('data-db-id');
    if (!dbId) continue;
    const url = await getMediaUrlFromDB(dbId);
    if (url && el.src !== url) {
      el.src = url;
    }
  }
}

// ----------------------------------------------------------------------------
// NAVEGAÇÃO SPA (go(n)) + TEMA ADAPTATIVO DA BOTTOMNAV (CLARO / ESCURO)
// ----------------------------------------------------------------------------
function go(n) {
  if (!store.isAuthenticated) {
    showAuthView('login');
    return;
  }

  closeProfileDotsMenu();
  closeViralDecisionsSheet();

  if (n !== 'create') {
    previousScreen = n;
    isCreateFullscreen = false;
    document.getElementById('screen-create').classList.remove('fullscreen-create');
  }

  activeScreen = n;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + n);
  if (target) target.classList.add('active');

  const isDarkScreen = (n === 'create' || n === 'reels');
  applyAdaptiveBottomNav(n, isDarkScreen);

  CentralVideoController.syncAllVideos();

  if (n === 'home') renderHome();
  if (n === 'reels') renderReels();
  if (n === 'profile') renderProfile();
}

function openCreateFromNavPlus() {
  if (activeScreen !== 'create') {
    previousScreen = activeScreen;
  }
  isCreateFullscreen = false;
  document.getElementById('screen-create').classList.remove('fullscreen-create');
  clearSelectedMedia();
  go('create');
  setCreateMode('POST');
}

function openCreateFromProfileFirstPost() {
  if (activeScreen !== 'create') {
    previousScreen = activeScreen;
  }
  isCreateFullscreen = true;
  document.getElementById('screen-create').classList.add('fullscreen-create');
  clearSelectedMedia();
  go('create');
  setCreateMode('POST');
}

function closeCreateScreen() {
  clearSelectedMedia();
  const backTo = previousScreen && previousScreen !== 'create' ? previousScreen : 'profile';
  go(backTo);
}

function applyAdaptiveBottomNav(current, isDark) {
  const nav = document.getElementById('bottom-nav');
  const shell = document.getElementById('app-shell');

  if (isDark) {
    nav.classList.remove('theme-light');
    nav.classList.add('theme-dark');
    shell.style.backgroundColor = '#000000';
  } else {
    nav.classList.remove('theme-dark');
    nav.classList.add('theme-light');
    shell.style.backgroundColor = '#ffffff';
  }

  document.querySelectorAll('#bottom-nav button').forEach(b => b.classList.remove('on'));
  const activeBtn = document.getElementById('nav-' + current);
  if (activeBtn) activeBtn.classList.add('on');

  const fg = isDark ? '#ffffff' : '#000000';
  const bg = isDark ? '#000000' : '#ffffff';

  const iconHome = document.getElementById('icon-home');
  iconHome.setAttribute('stroke', fg);
  iconHome.setAttribute('fill', current === 'home' ? fg : 'none');

  const iconCreate = document.getElementById('icon-create');
  if (current === 'create') {
    iconCreate.innerHTML = `
      <rect x="3" y="3" width="18" height="18" rx="5" fill="${fg}" stroke="${fg}" stroke-width="2"></rect>
      <line x1="12" y1="8" x2="12" y2="16" stroke="${bg}" stroke-width="2.2" stroke-linecap="round"></line>
      <line x1="8" y1="12" x2="16" y2="12" stroke="${bg}" stroke-width="2.2" stroke-linecap="round"></line>
    `;
  } else {
    iconCreate.innerHTML = `
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="${fg}" stroke-width="2" fill="none"></rect>
      <line x1="12" y1="8" x2="12" y2="16" stroke="${fg}" stroke-width="2" stroke-linecap="round"></line>
      <line x1="8" y1="12" x2="16" y2="12" stroke="${fg}" stroke-width="2" stroke-linecap="round"></line>
    `;
  }

  const iconReels = document.getElementById('icon-reels');
  if (current === 'reels') {
    iconReels.innerHTML = `
      <rect x="3" y="3" width="18" height="18" rx="5" fill="${fg}" stroke="${fg}" stroke-width="2"></rect>
      <polygon points="10 8.5 16 12 10 15.5 10 8.5" fill="${bg}" stroke="${bg}" stroke-width="1.5" stroke-linejoin="round"></polygon>
    `;
  } else {
    iconReels.innerHTML = `
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="${fg}" stroke-width="2" fill="none"></rect>
      <polygon points="10 8.5 16 12 10 15.5 10 8.5" stroke="${fg}" stroke-width="1.9" stroke-linejoin="round" fill="none"></polygon>
    `;
  }

  const profSvg = document.getElementById('icon-profile-svg');
  const profImg = document.getElementById('nav-profile-img');
  profSvg.setAttribute('stroke', fg);

  if (store.user.avatar) {
    profSvg.classList.add('hidden');
    profImg.src = store.user.avatar;
    profImg.classList.remove('hidden');
  } else {
    profImg.classList.add('hidden');
    profSvg.classList.remove('hidden');
  }
}

// ----------------------------------------------------------------------------
// PLAYER CENTRAL ÚNICO
// ----------------------------------------------------------------------------
const CentralVideoController = {
  observer: null,
  muted: true,

  init() {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        const isScreenVisible = video.closest('.screen')?.classList.contains('active');
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65 && isScreenVisible) {
          if (video.dataset.userPaused !== 'true') {
            this.playOnlyThis(video);
          }
        } else if (!video.paused) {
          video.pause();
          this.updateBadge(video, false);
        }
      });
    }, { threshold: [0.25, 0.65, 0.9] });
  },

  register(videoEl) {
    if (!this.observer) this.init();
    videoEl.muted = this.muted;
    this.observer.observe(videoEl);
  },

  playOnlyThis(targetVideo) {
    document.querySelectorAll('video.koneat-video').forEach(v => {
      if (v !== targetVideo && !v.paused) {
        v.pause();
        this.updateBadge(v, false);
      }
    });
    targetVideo.play()
      .then(() => this.updateBadge(targetVideo, true))
      .catch(() => {
        targetVideo.muted = true;
        targetVideo.play().then(() => this.updateBadge(targetVideo, true)).catch(() => {});
      });
  },

  toggleManualPlay(videoEl) {
    if (videoEl.paused) {
      videoEl.dataset.userPaused = 'false';
      this.playOnlyThis(videoEl);
    } else {
      videoEl.dataset.userPaused = 'true';
      videoEl.pause();
      this.updateBadge(videoEl, false);
    }
  },

  toggleMute(e) {
    if (e) e.stopPropagation();
    this.muted = !this.muted;
    document.querySelectorAll('video.koneat-video').forEach(v => v.muted = this.muted);
    openToast(this.muted ? 'Áudio silenciado' : 'Áudio ativado');
  },

  updateBadge(videoEl, playing) {
    const badge = videoEl.parentElement?.querySelector('.play-badge');
    if (badge) badge.style.opacity = playing ? '0' : '1';
  },

  syncAllVideos() {
    document.querySelectorAll('video.koneat-video').forEach(v => {
      const isActive = v.closest('.screen')?.classList.contains('active');
      if (!isActive) {
        v.pause();
        this.updateBadge(v, false);
      } else {
        const rect = v.getBoundingClientRect();
        if (rect.top >= -50 && rect.bottom <= window.innerHeight + 50 && v.dataset.userPaused !== 'true') {
          this.playOnlyThis(v);
        }
      }
    });
  }
};

// ----------------------------------------------------------------------------
// COMPONENTE LEGO: StoryCircle
// ----------------------------------------------------------------------------
function renderStoryCircleComponent() {
  const container = document.getElementById('stories-container');
  if (!container) return;

  const myStory = store.stories[0];
  const avatarInner = store.user.avatar
    ? `<img src="${store.user.avatar}" alt="seu story" class="w-full h-full object-cover rounded-full" />`
    : `<div class="w-full h-full rounded-full bg-[#E5E7EB]"></div>`;

  const circleAction = myStory
    ? `openStoryViewer('${myStory.id}')`
    : `openToast('Nenhum story publicado ainda')`;

  container.innerHTML = `
    <div class="flex flex-col items-center gap-1.5 shrink-0 w-[72px]">
      <div class="relative w-[66px] h-[66px] cursor-pointer" onclick="${circleAction}">
        <div class="w-full h-full rounded-full ${myStory ? 'p-[2px] ring-2 ring-black' : ''}">
          ${avatarInner}
        </div>
        <button type="button" onclick="event.stopPropagation(); openToast('Toque no + da barra inferior para criar');" aria-label="Story"
          class="absolute bottom-0 right-0 w-[22px] h-[22px] rounded-full bg-black text-white border-2 border-white flex items-center justify-center font-bold text-sm leading-none shadow-xs">
          +
        </button>
      </div>
      <span class="text-[12px] text-[#262626] font-normal text-center leading-tight">seu story</span>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// TELA HOME
// ----------------------------------------------------------------------------
function setHomeTab(tab) {
  homeTab = tab;
  ['pra-voce', 'seguindo', 'explorar'].forEach(t => {
    const btn = document.getElementById('htab-' + t);
    if (t === tab) {
      btn.classList.add('font-bold', 'text-black', 'border-black');
      btn.classList.remove('font-semibold', 'text-[#9CA3AF]', 'border-transparent');
    } else {
      btn.classList.remove('font-bold', 'text-black', 'border-black');
      btn.classList.add('font-semibold', 'text-[#9CA3AF]', 'border-transparent');
    }
  });
  renderHome();
}

function toggleHomeSearch() {
  const bar = document.getElementById('home-search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    document.getElementById('home-search-input').focus();
  }
}

function renderHome() {
  renderStoryCircleComponent();

  const feedEl = document.getElementById('feed-container');
  const query = (document.getElementById('home-search-input')?.value || '').trim().toLowerCase();

  let posts = store.posts.filter(p => !store.blockedAuthors.includes(p.authorHandle));
  if (query) {
    posts = posts.filter(p =>
      (p.caption || '').toLowerCase().includes(query) ||
      (p.authorHandle || '').toLowerCase().includes(query)
    );
  }

  if (posts.length === 0) {
    feedEl.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center px-6 pb-16 text-center">
        <p class="text-[14px] text-[#6B7280] leading-relaxed">
          Nenhuma publicação no momento.<br/>
          Crie um post para começar!
        </p>
      </div>
    `;
    return;
  }

  feedEl.innerHTML = posts.map(post => createPostCardHTML(post)).join('');

  hydrateIndexedDBMedia().then(() => {
    document.querySelectorAll('#screen-home video.koneat-video').forEach(v => CentralVideoController.register(v));
  });
}

function createPostCardHTML(post) {
  const isVideo = post.mediaType === 'video';
  const dbAttr = post.dbVideoId ? `data-db-id="${post.dbVideoId}"` : '';
  const displayHandle = post.authorHandle || '@usuario';

  const avatarHTML = store.user.avatar
    ? `<img src="${store.user.avatar}" class="w-8 h-8 rounded-full object-cover border border-zinc-200" alt="" />`
    : `<div class="w-8 h-8 rounded-full bg-[#E5E7EB] flex items-center justify-center text-zinc-500 text-xs font-bold">${displayHandle.replace('@','').charAt(0).toUpperCase()}</div>`;

  const mediaHTML = isVideo
    ? `
      <div class="relative w-full aspect-[4/5] bg-black overflow-hidden cursor-pointer" onclick="CentralVideoController.toggleManualPlay(this.querySelector('video'))">
        <video class="koneat-video w-full h-full object-cover" src="${post.mediaUrl || ''}" ${dbAttr} loop playsinline muted data-user-paused="false"></video>
        <div class="play-badge pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/55 flex items-center justify-center opacity-0 transition">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg>
        </div>
        <button type="button" onclick="CentralVideoController.toggleMute(event)" class="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-xs">🔇</button>
      </div>
    `
    : `
      <div class="relative w-full aspect-[4/5] bg-zinc-100 overflow-hidden" ondblclick="handleDoubleTapLike('${post.id}', this)">
        <img src="${post.mediaUrl || ''}" ${dbAttr} class="w-full h-full object-cover" alt="Post" />
      </div>
    `;

  return `
    <article class="border-b border-[#EFEFEF] pb-3.5 bg-white">
      <div class="px-4 py-2.5 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          ${avatarHTML}
          <div>
            <span class="text-[13px] font-bold text-black block leading-tight">${escapeHTML(displayHandle)}</span>
            <span class="text-[11px] text-zinc-400">${post.timestamp}</span>
          </div>
        </div>
        <button type="button" onclick="deletePost('${post.id}')" class="text-zinc-400 hover:text-red-500 text-xs px-2 py-1" title="Excluir">•••</button>
      </div>

      ${mediaHTML}

      <div class="px-4 pt-3 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <button type="button" onclick="toggleLike('${post.id}')" class="flex items-center gap-1.5 active:scale-90 transition">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="${post.liked ? '#EF4444' : 'none'}" stroke="${post.liked ? '#EF4444' : '#000000'}" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span class="text-xs font-bold text-black">${post.likes}</span>
          </button>

          <button type="button" onclick="openCommentsModal('${post.id}')" class="flex items-center gap-1.5 active:scale-90 transition">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            <span class="text-xs font-semibold text-black">${post.comments.length}</span>
          </button>
        </div>

        <button type="button" onclick="toggleSavePost('${post.id}')" class="active:scale-90 transition">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="${post.saved ? '#000000' : 'none'}" stroke="#000000" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>

      ${post.caption ? `
        <div class="px-4 pt-2">
          <p class="text-[13px] text-black leading-snug">
            <span class="font-bold mr-1">${escapeHTML(displayHandle)}</span>${escapeHTML(post.caption)}
          </p>
        </div>
      ` : ''}
    </article>
  `;
}

// ----------------------------------------------------------------------------
// TELA VIRAL START / VÍDEO + FOLHINHA 'DECISÕES'
// ----------------------------------------------------------------------------
function toggleViralDecisionsSheet(e) {
  if (e) e.stopPropagation();
  const sheet = document.getElementById('viral-decisions-sheet');
  const backdrop = document.getElementById('viral-decisions-backdrop');
  const isHidden = sheet.classList.contains('hidden');
  if (isHidden) {
    sheet.classList.remove('hidden');
    backdrop.classList.remove('hidden');
  } else {
    closeViralDecisionsSheet();
  }
}

function closeViralDecisionsSheet() {
  const sheet = document.getElementById('viral-decisions-sheet');
  const backdrop = document.getElementById('viral-decisions-backdrop');
  if (sheet) sheet.classList.add('hidden');
  if (backdrop) backdrop.classList.add('hidden');
}

function getCurrentVisibleViralPost() {
  const videos = store.posts.filter(
    p => p.mediaType === 'video' &&
    !store.hiddenViralIds.includes(p.id) &&
    !store.blockedAuthors.includes(p.authorHandle)
  );
  if (!videos.length) return null;

  const container = document.getElementById('reels-feed');
  const slides = Array.from(container.querySelectorAll('.reel-slide'));
  if (!slides.length) return videos[0];

  const cRect = container.getBoundingClientRect();
  let bestIdx = 0;
  let bestDist = Infinity;

  slides.forEach((slide, idx) => {
    const r = slide.getBoundingClientRect();
    const dist = Math.abs(r.top - cRect.top);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });

  return videos[bestIdx] || videos[0];
}

function handleViralDecision(action) {
  closeViralDecisionsSheet();
  const currentPost = getCurrentVisibleViralPost();

  if (action === 'not-interested') {
    if (currentPost && !store.hiddenViralIds.includes(currentPost.id)) {
      store.hiddenViralIds.push(currentPost.id);
      saveStore();
      renderReels();
    }
    openToast('Marcado como: Não tenho interesse');
  } else if (action === 'report') {
    openToast('Denúncia enviada para análise do Koneat');
  } else if (action === 'block') {
    if (currentPost && currentPost.authorHandle && !store.blockedAuthors.includes(currentPost.authorHandle)) {
      store.blockedAuthors.push(currentPost.authorHandle);
      saveStore();
      renderReels();
      renderHome();
    }
    openToast('Criador bloqueado');
  }
}

function renderReels() {
  const container = document.getElementById('reels-feed');
  const videos = store.posts.filter(
    p => p.mediaType === 'video' &&
    !store.hiddenViralIds.includes(p.id) &&
    !store.blockedAuthors.includes(p.authorHandle)
  );

  if (videos.length === 0) {
    container.innerHTML = `
      <div class="w-full h-full flex items-center justify-center px-6 text-center">
        <p class="text-[14px] text-[#9CA3AF] font-normal">Vídeos virais aparecerão aqui</p>
      </div>
    `;
    return;
  }

  container.innerHTML = videos.map(post => {
    const dbAttr = post.dbVideoId ? `data-db-id="${post.dbVideoId}"` : '';
    return `
      <div class="reel-slide" ondblclick="handleDoubleTapLike('${post.id}', this)">
        <video class="koneat-video w-full h-full object-cover cursor-pointer" src="${post.mediaUrl || ''}" ${dbAttr} loop playsinline muted data-user-paused="false"
          onclick="CentralVideoController.toggleManualPlay(this)"></video>

        <div class="play-badge pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/55 flex items-center justify-center opacity-0 transition">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#ffffff"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg>
        </div>

        <div class="absolute right-3 bottom-6 z-20 flex flex-col items-center gap-4">
          <button type="button" onclick="toggleLike('${post.id}')" class="flex flex-col items-center gap-1">
            <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="${post.liked ? '#EF4444' : 'none'}" stroke="${post.liked ? '#EF4444' : '#ffffff'}" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </div>
            <span class="text-[11px] font-bold text-white">${post.likes}</span>
          </button>

          <button type="button" onclick="openCommentsModal('${post.id}')" class="flex flex-col items-center gap-1">
            <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
            </div>
            <span class="text-[11px] font-bold text-white">${post.comments.length}</span>
          </button>
        </div>

        <div class="absolute left-4 right-16 bottom-6 z-20 pointer-events-none">
          <p class="text-xs font-bold text-white mb-1">${escapeHTML(post.authorHandle || '@usuario')}</p>
          <p class="text-xs text-zinc-200 line-clamp-2">${escapeHTML(post.caption || '')}</p>
        </div>
      </div>
    `;
  }).join('');

  hydrateIndexedDBMedia().then(() => {
    document.querySelectorAll('#screen-reels video.koneat-video').forEach(v => CentralVideoController.register(v));
  });
}

// ----------------------------------------------------------------------------
// TELA CRIAR
// ----------------------------------------------------------------------------
let createState = {
  mode: 'POST',
  mediaType: null,
  fileBlob: null,
  previewUrl: null,
  coverFit: false
};

function setCreateMode(mode) {
  createState.mode = mode;
  document.querySelectorAll('.create-mode-btn').forEach(btn => {
    if (btn.dataset.mode === mode) {
      btn.classList.add('text-white', 'border-white');
      btn.classList.remove('text-[#71717A]', 'border-transparent');
    } else {
      btn.classList.remove('text-white', 'border-white');
      btn.classList.add('text-[#71717A]', 'border-transparent');
    }
  });

  const hint = document.getElementById('create-center-hint');
  if (mode === 'STORY') hint.textContent = 'Adicionar Imagem ou Vídeo Story.';
  else if (mode === 'VIRAL') hint.textContent = 'Adicionar Vídeo Viral (até 50MB).';
  else hint.textContent = 'Adicionar Imagem ou Vídeo Feed.';
}

function togglePreviewAspect() {
  if (!createState.fileBlob) {
    triggerGalleryPicker();
    return;
  }
  createState.coverFit = !createState.coverFit;
  const imgEl = document.getElementById('create-preview-img');
  const vidEl = document.getElementById('create-preview-video');
  const clsAdd = createState.coverFit ? 'object-cover' : 'object-contain';
  const clsRem = createState.coverFit ? 'object-contain' : 'object-cover';
  imgEl.classList.remove(clsRem);
  imgEl.classList.add(clsAdd);
  vidEl.classList.remove(clsRem);
  vidEl.classList.add(clsAdd);
}

function triggerGalleryPicker() {
  const input = document.getElementById('media-file-input');
  input.value = '';
  input.click();
}

function handleMediaFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');

  if (!isVideo && !isImage) {
    openToast('Selecione uma imagem ou vídeo válido.');
    return;
  }

  if (isVideo && file.size > MAX_VIDEO) {
    openToast('Vídeo excede o limite máximo de 50MB!');
    e.target.value = '';
    return;
  }

  clearSelectedMedia();

  createState.mediaType = isVideo ? 'video' : 'image';
  createState.fileBlob = file;
  createState.previewUrl = URL.createObjectURL(file);

  if (isVideo && createState.mode === 'POST') {
    setCreateMode('VIRAL');
  }

  document.getElementById('create-empty-canvas').classList.add('hidden');
  document.getElementById('create-selected-stage').classList.remove('hidden');
  document.getElementById('btn-publish-label').textContent = 'Publicar';

  const imgEl = document.getElementById('create-preview-img');
  const vidEl = document.getElementById('create-preview-video');

  if (isVideo) {
    imgEl.classList.add('hidden');
    vidEl.src = createState.previewUrl;
    vidEl.classList.remove('hidden');
  } else {
    vidEl.classList.add('hidden');
    imgEl.src = createState.previewUrl;
    imgEl.classList.remove('hidden');
  }
}

function clearSelectedMedia() {
  if (createState.previewUrl) {
    URL.revokeObjectURL(createState.previewUrl);
  }
  createState.mediaType = null;
  createState.fileBlob = null;
  createState.previewUrl = null;
  createState.coverFit = false;

  const captionInput = document.getElementById('create-caption');
  if (captionInput) captionInput.value = '';

  document.getElementById('create-empty-canvas').classList.remove('hidden');
  document.getElementById('create-selected-stage').classList.add('hidden');
  document.getElementById('btn-publish-label').textContent = 'Avançar';

  const imgEl = document.getElementById('create-preview-img');
  const vidEl = document.getElementById('create-preview-video');
  imgEl.src = '';
  imgEl.classList.add('hidden');
  vidEl.pause();
  vidEl.src = '';
  vidEl.classList.add('hidden');
}

function handleCreateNextStep() {
  if (!createState.fileBlob || !createState.mediaType) {
    triggerGalleryPicker();
    return;
  }
  publishContent();
}

async function publishContent() {
  if (!createState.fileBlob || !createState.mediaType) {
    triggerGalleryPicker();
    return;
  }

  const caption = document.getElementById('create-caption').value.trim();
  const btn = document.getElementById('btn-publish');
  btn.disabled = true;

  try {
    const dbId = 'media-' + Date.now();
    const blobUrl = await saveMediaBlobToDB(dbId, createState.fileBlob);

    if (createState.mode === 'STORY') {
      store.stories = [{
        id: 'st-' + Date.now(),
        mediaType: createState.mediaType,
        mediaUrl: blobUrl,
        dbVideoId: dbId,
        caption: caption || 'Story no Koneat'
      }];
      saveStore();
      openToast('Publicado no seu story!');
      closeCreateScreen();
      go('home');
    } else {
      const newPost = {
        id: 'post-' + Date.now(),
        authorHandle: store.user.handle || '@usuario',
        mode: createState.mode,
        mediaType: createState.mediaType,
        mediaUrl: blobUrl,
        dbVideoId: dbId,
        caption,
        likes: 0,
        liked: false,
        saved: false,
        timestamp: 'Agora',
        comments: []
      };
      store.posts.unshift(newPost);
      saveStore();
      openToast('Publicado com sucesso!');

      const dest = (createState.mode === 'VIRAL' || createState.mediaType === 'video') ? 'reels' : 'home';
      closeCreateScreen();
      go(dest);
    }
  } catch (err) {
    openToast('Erro ao salvar arquivo no IndexedDB.');
  } finally {
    btn.disabled = false;
  }
}

// ----------------------------------------------------------------------------
// TELA PERFIL + MENU 3 PONTINHOS + CONFIGURAÇÕES + EDITAR PERFIL
// ----------------------------------------------------------------------------
function toggleProfileDotsMenu(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('profile-dots-popover');
  const backdrop = document.getElementById('profile-dots-backdrop');
  const isHidden = popover.classList.contains('hidden');
  if (isHidden) {
    popover.classList.remove('hidden');
    backdrop.classList.remove('hidden');
  } else {
    closeProfileDotsMenu();
  }
}

function closeProfileDotsMenu() {
  const popover = document.getElementById('profile-dots-popover');
  const backdrop = document.getElementById('profile-dots-backdrop');
  if (popover) popover.classList.add('hidden');
  if (backdrop) backdrop.classList.add('hidden');
}

function openSettingsModal() {
  syncSettingsUI();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function syncSettingsUI() {
  applySwitchVisual('toggle-notifications', !!store.settings.notifications);
  applySwitchVisual('toggle-private-account', !!store.settings.privateAccount);
}

function applySwitchVisual(elId, isOn) {
  const btn = document.getElementById(elId);
  if (!btn) return;
  if (isOn) {
    btn.classList.remove('bg-zinc-300', 'justify-start');
    btn.classList.add('bg-[#2563EB]', 'justify-end');
  } else {
    btn.classList.remove('bg-[#2563EB]', 'justify-end');
    btn.classList.add('bg-zinc-300', 'justify-start');
  }
}

function toggleSettingSwitch(key) {
  store.settings[key] = !store.settings[key];
  syncSettingsUI();
}

function saveSettingsChanges() {
  saveStore();
  closeSettingsModal();
  openToast('Alterações salvas com sucesso!');
}

function confirmResetAccount() {
  localStorage.removeItem(STORE_KEY);
  store = JSON.parse(JSON.stringify(INITIAL_STORE));
  saveStore();
  closeSettingsModal();
  showAuthView('login');
  openToast('Dados locais da conta redefinidos.');
}

function openInfoSheet(topic) {
  const titleEl = document.getElementById('info-sheet-title');
  const bodyEl = document.getElementById('info-sheet-body');
  titleEl.textContent = topic;

  if (topic === 'Privacidade') {
    bodyEl.innerHTML = `
      <p><strong>Controle da sua conta:</strong> Você pode alternar entre conta privada e pública a qualquer momento em Configurações.</p>
      <p><strong>Armazenamento local seguro:</strong> Suas mídias de até 50MB são armazenadas localmente no navegador via IndexedDB durante a fase de protótipo.</p>
      <p><strong>Informações pessoais:</strong> Data de nascimento e gênero são visíveis apenas para você.</p>
    `;
  } else if (topic === 'Termos') {
    bodyEl.innerHTML = `
      <p><strong>Termos de Uso do Koneat:</strong> Ao publicar fotos, stories ou vídeos virais no Koneat, você mantém os direitos sobre o seu conteúdo original.</p>
      <p><strong>Diretrizes da Comunidade:</strong> Não publique conteúdo ofensivo, ilegal ou que viole direitos autorais de terceiros.</p>
    `;
  } else {
    bodyEl.innerHTML = `
      <p><strong>Central de Ajuda Koneat:</strong></p>
      <p>• Toque no <strong>+</strong> na barra inferior para abrir o criador rápido mantendo a navegação visível.</p>
      <p>• No Perfil, toque em <strong>Crie seu primeiro post</strong> para abrir o estúdio em tela cheia.</p>
      <p>• Vídeos suportam até <strong>50MB</strong> diretamente no aplicativo.</p>
    `;
  }

  document.getElementById('info-sheet-modal').classList.remove('hidden');
}

function closeInfoSheet() {
  document.getElementById('info-sheet-modal').classList.add('hidden');
}

function setProfileTab(tab) {
  profileTab = tab;
  ['todos', 'reposts', 'marcacoes'].forEach(t => {
    const btn = document.getElementById('ptab-' + t);
    if (t === tab) {
      btn.classList.add('border-black', 'text-black');
      btn.classList.remove('border-transparent', 'text-[#8E8E93]');
    } else {
      btn.classList.remove('border-black', 'text-black');
      btn.classList.add('border-transparent', 'text-[#8E8E93]');
    }
  });
  renderProfile();
}

function renderProfile() {
  document.getElementById('stat-posts-count').textContent = store.posts.length;
  document.getElementById('stat-followers-count').textContent = store.user.followers || 0;
  document.getElementById('stat-following-count').textContent = store.user.following || 0;

  const nameEl = document.getElementById('profile-name-display');
  if (store.user.name) {
    nameEl.textContent = store.user.name;
    nameEl.classList.remove('hidden');
  } else {
    nameEl.textContent = '';
    nameEl.classList.add('hidden');
  }

  const handleHeader = document.getElementById('profile-header-handle');
  if (store.user.handle) {
    handleHeader.textContent = store.user.handle;
    handleHeader.classList.remove('opacity-0');
  } else {
    handleHeader.classList.add('opacity-0');
  }

  const bioEl = document.getElementById('profile-bio-display');
  const bioText = (store.user.bio || '').trim();
  if (bioText) {
    bioEl.textContent = bioText;
    bioEl.classList.remove('hidden');
  } else {
    bioEl.textContent = '';
    bioEl.classList.add('hidden');
  }

  const sil = document.getElementById('profile-default-silhouette');
  const img = document.getElementById('profile-custom-img');
  if (store.user.avatar) {
    sil.classList.add('hidden');
    img.src = store.user.avatar;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    sil.classList.remove('hidden');
  }

  const area = document.getElementById('profile-content-area');

  if (profileTab === 'todos') {
    if (store.posts.length === 0) {
      area.innerHTML = `
        <div class="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="mb-3">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <p class="text-[13px] text-[#8E8E93] mb-3.5">Compartilhe seu primeiro momento com o koneat</p>
          <button type="button" onclick="openCreateFromProfileFirstPost()" class="bg-[#EFEFEF] hover:bg-[#E4E4E7] active:scale-95 text-black font-bold text-[12px] px-4 py-1.5 rounded-full transition">
            Crie seu primeiro post
          </button>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="grid grid-cols-3 gap-0.5 pt-0.5">
        ${store.posts.map(p => {
          const dbAttr = p.dbVideoId ? `data-db-id="${p.dbVideoId}"` : '';
          if (p.mediaType === 'video') {
            return `
              <div onclick="go('reels')" class="relative aspect-square bg-black overflow-hidden cursor-pointer">
                <video src="${p.mediaUrl || ''}" ${dbAttr} class="w-full h-full object-cover" muted playsinline></video>
                <span class="absolute top-1.5 right-1.5 text-white text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded">▶</span>
              </div>
            `;
          }
          return `
            <div onclick="go('home')" class="relative aspect-square bg-zinc-100 overflow-hidden cursor-pointer">
              <img src="${p.mediaUrl || ''}" ${dbAttr} class="w-full h-full object-cover" alt="" />
            </div>
          `;
        }).join('')}
      </div>
    `;
    hydrateIndexedDBMedia();
  } else if (profileTab === 'reposts') {
    area.innerHTML = `
      <div class="flex-1 flex items-center justify-center px-6 py-14 text-center">
        <p class="text-[13px] text-[#8E8E93]">Nenhum repost no momento.</p>
      </div>
    `;
  } else {
    area.innerHTML = `
      <div class="flex-1 flex items-center justify-center px-6 py-14 text-center">
        <p class="text-[13px] text-[#8E8E93]">Nenhuma marcação ainda.</p>
      </div>
    `;
  }
}

function openEditProfileModal() {
  document.getElementById('input-edit-name').value = store.user.name || '';
  document.getElementById('input-edit-handle').value = store.user.handle || '';
  document.getElementById('input-edit-bio').value = store.user.bio || '';
  document.getElementById('input-edit-birth').value = store.user.birth || '';
  document.getElementById('input-edit-gender').value = store.user.gender || '';

  updateEditAvatarPreview();
  document.getElementById('edit-profile-modal').classList.remove('hidden');
}

function closeEditProfileModal() {
  document.getElementById('edit-profile-modal').classList.add('hidden');
}

function updateEditAvatarPreview() {
  const sil = document.getElementById('edit-avatar-silhouette');
  const prev = document.getElementById('edit-avatar-preview');
  if (store.user.avatar) {
    sil.classList.add('hidden');
    prev.src = store.user.avatar;
    prev.classList.remove('hidden');
  } else {
    prev.classList.add('hidden');
    sil.classList.remove('hidden');
  }
}

function triggerAvatarUpload() {
  const input = document.getElementById('avatar-file-input');
  input.value = '';
  input.click();
}

function handleAvatarFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    store.user.avatar = ev.target.result;
    saveStore();
    updateEditAvatarPreview();
    renderProfile();
    applyAdaptiveBottomNav(activeScreen, activeScreen === 'create' || activeScreen === 'reels');
    openToast('Foto de perfil atualizada!');
  };
  reader.readAsDataURL(file);
}

function saveEditedProfile() {
  const name = document.getElementById('input-edit-name').value.trim();
  let handle = document.getElementById('input-edit-handle').value.trim();
  const bio = document.getElementById('input-edit-bio').value.trim();
  const birth = document.getElementById('input-edit-birth').value.trim();
  const gender = document.getElementById('input-edit-gender').value.trim();

  if (handle && !handle.startsWith('@')) {
    handle = '@' + handle;
  }

  store.user.name = name;
  store.user.handle = handle;
  store.user.bio = bio;
  store.user.birth = birth;
  store.user.gender = gender;

  if (handle) {
    store.posts.forEach(p => { p.authorHandle = handle; });
  }

  saveStore();
  closeEditProfileModal();
  renderProfile();
  renderHome();
  openToast('Perfil salvo com sucesso!');
}

function openShareSheet() {
  const slug = store.user.handle ? `/${store.user.handle.replace('@', '')}` : '';
  document.getElementById('share-profile-url').textContent = `microprojeto.github.io${slug}`;
  document.getElementById('share-sheet-backdrop').classList.remove('hidden');
}

function closeShareSheet() {
  document.getElementById('share-sheet-backdrop').classList.add('hidden');
}

function copyShareLink() {
  const url = document.getElementById('share-profile-url').textContent;
  const dummy = document.createElement('input');
  dummy.value = `https://${url}`;
  document.body.appendChild(dummy);
  dummy.select();
  document.execCommand('copy');
  document.body.removeChild(dummy);
  closeShareSheet();
  openToast('Link copiado para a área de transferência!');
}

function shareViaApp(appName) {
  closeShareSheet();
  openToast(`Abrindo compartilhamento via ${appName}...`);
}

function openQrCodePreview() {
  const url = document.getElementById('share-profile-url').textContent;
  document.getElementById('qr-handle-text').textContent = url;
  closeShareSheet();
  document.getElementById('qr-modal').classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// INTERAÇÕES SOCIAIS & STORY VIEWER
// ----------------------------------------------------------------------------
function toggleLike(postId) {
  const post = store.posts.find(p => p.id === postId);
  if (!post) return;
  post.liked = !post.liked;
  post.likes += post.liked ? 1 : -1;
  saveStore();
  if (activeScreen === 'home') renderHome();
  if (activeScreen === 'reels') renderReels();
}

function handleDoubleTapLike(postId, el) {
  const post = store.posts.find(p => p.id === postId);
  if (!post) return;
  if (!post.liked) {
    post.liked = true;
    post.likes += 1;
    saveStore();
    if (activeScreen === 'home') renderHome();
    if (activeScreen === 'reels') renderReels();
  }
  const burst = document.createElement('div');
  burst.className = 'heart-burst';
  burst.innerHTML = `<svg width="72" height="72" viewBox="0 0 24 24" fill="#EF4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  el.appendChild(burst);
  setTimeout(() => burst.remove(), 750);
}

function toggleSavePost(postId) {
  const post = store.posts.find(p => p.id === postId);
  if (!post) return;
  post.saved = !post.saved;
  saveStore();
  renderHome();
  openToast(post.saved ? 'Salvo!' : 'Removido dos salvos');
}

function deletePost(postId) {
  store.posts = store.posts.filter(p => p.id !== postId);
  saveStore();
  renderHome();
  renderReels();
  renderProfile();
  openToast('Publicação excluída.');
}

function openCommentsModal(postId) {
  currentCommentPostId = postId;
  const post = store.posts.find(p => p.id === postId);
  if (!post) return;
  renderComments(post);
  document.getElementById('comments-modal').classList.remove('hidden');
}

function closeCommentsModal() {
  document.getElementById('comments-modal').classList.add('hidden');
  currentCommentPostId = null;
}

function renderComments(post) {
  const list = document.getElementById('comments-list');
  if (!post.comments.length) {
    list.innerHTML = `<p class="text-center text-xs text-zinc-400 py-8">Nenhum comentário ainda.</p>`;
    return;
  }
  list.innerHTML = post.comments.map(c => `
    <div class="bg-[#F4F6F9] rounded-2xl px-3.5 py-2">
      <span class="text-[11px] font-bold text-black block">${escapeHTML(c.user)}</span>
      <p class="text-xs text-zinc-800 mt-0.5">${escapeHTML(c.text)}</p>
    </div>
  `).join('');
}

function submitComment(e) {
  e.preventDefault();
  if (!currentCommentPostId) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;
  const post = store.posts.find(p => p.id === currentCommentPostId);
  if (!post) return;
  post.comments.push({ user: store.user.handle || '@usuario', text });
  input.value = '';
  saveStore();
  renderComments(post);
  if (activeScreen === 'home') renderHome();
  if (activeScreen === 'reels') renderReels();
}

async function openStoryViewer(storyId) {
  const story = store.stories.find(s => s.id === storyId);
  if (!story) return;

  document.getElementById('story-view-user').textContent = store.user.handle || '@usuario';
  document.getElementById('story-view-caption').textContent = story.caption || '';

  const imgEl = document.getElementById('story-view-img');
  const vidEl = document.getElementById('story-view-video');
  imgEl.classList.add('hidden');
  vidEl.classList.add('hidden');

  let src = story.mediaUrl;
  if (story.dbVideoId) {
    const dbUrl = await getMediaUrlFromDB(story.dbVideoId);
    if (dbUrl) src = dbUrl;
  }

  if (story.mediaType === 'video') {
    vidEl.src = src;
    vidEl.classList.remove('hidden');
    vidEl.play().catch(() => {});
  } else {
    imgEl.src = src;
    imgEl.classList.remove('hidden');
  }

  document.getElementById('story-viewer').classList.remove('hidden');
  clearInterval(storyTimer);
  const bar = document.getElementById('story-progress-bar');
  bar.style.width = '0%';
  let pct = 0;
  storyTimer = setInterval(() => {
    pct += 2.5;
    bar.style.width = pct + '%';
    if (pct >= 100) closeStoryViewer();
  }, 100);
}

function closeStoryViewer() {
  clearInterval(storyTimer);
  document.getElementById('story-view-video').pause();
  document.getElementById('story-viewer').classList.add('hidden');
}

// ----------------------------------------------------------------------------
// UTILITÁRIOS
// ----------------------------------------------------------------------------
let toastTimer = null;
function openToast(msg) {
  const box = document.getElementById('toast-box');
  document.getElementById('toast-text').textContent = msg;
  box.classList.remove('opacity-0', '-translate-y-2');
  box.classList.add('opacity-100', 'translate-y-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.add('opacity-0', '-translate-y-2');
    box.classList.remove('opacity-100', 'translate-y-0');
  }, 2400);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  CentralVideoController.init();
  setupCodeBoxes('reg-code-boxes');
  setupCodeBoxes('rec-code-boxes');

  if (store.isAuthenticated) {
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('bottom-nav').classList.remove('hidden');
    go('profile');
  } else {
    showAuthView('login');
  }
});
