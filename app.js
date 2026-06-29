'use strict';

let tokenClient;
let accessToken = null;
let currentFolder = null; // { id, name } of the chosen video folder

const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const welcomeSection = document.getElementById('welcome-section');
const fileSection = document.getElementById('file-section');
const signedInArea = document.getElementById('signed-in-area');
const userEmailEl = document.getElementById('user-email');
const fileList = document.getElementById('file-list');
const loadingEl = document.getElementById('loading');
const errorMsg = document.getElementById('error-msg');
const tagFilterBar = document.getElementById('tag-filter-bar');
const listToolbar = document.getElementById('list-toolbar');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const sharedOnlyToggle = document.getElementById('shared-only');
const emptyState = document.getElementById('empty-state');
const nonVideoWarning = document.getElementById('non-video-warning');
const nonVideoWarningText = document.getElementById('non-video-warning-text');
const folderMenu = document.getElementById('folder-menu');
const folderMenuName = document.getElementById('folder-menu-name');
const changeFolderBtn = document.getElementById('change-folder-btn');
const folderPicker = document.getElementById('folder-picker');
const folderPickerCrumbs = document.getElementById('folder-picker-crumbs');
const folderPickerList = document.getElementById('folder-picker-list');
const folderPickerError = document.getElementById('folder-picker-error');
const folderSelectBtn = document.getElementById('folder-select-btn');
const folderCancelBtn = document.getElementById('folder-cancel-btn');

const activeFilters = new Set();
let allFiles = [];
let searchQuery = '';
let currentSort = 'name';
let sharedOnly = false;

// Called by the GIS script's onload attribute once the library is ready
function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleTokenResponse,
  });
  signInBtn.disabled = false;
}

function handleTokenResponse(response) {
  if (response.error) {
    showError('Sign-in failed: ' + response.error);
    return;
  }
  accessToken = response.access_token;
  showSignedInState();
  currentFolder = getStoredFolder();
  if (currentFolder) {
    renderFolderMenu();
    listFiles();
  } else {
    openFolderPicker();
  }
}

signInBtn.addEventListener('click', () => {
  tokenClient.requestAccessToken();
});

signOutBtn.addEventListener('click', () => {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  showSignedOutState();
});

function showSignedInState() {
  welcomeSection.hidden = true;
  fileSection.hidden = false;
  signedInArea.hidden = false;
  fetchUserEmail();
}

function showSignedOutState() {
  welcomeSection.hidden = false;
  fileSection.hidden = true;
  signedInArea.hidden = true;
  userEmailEl.textContent = '';
  fileList.innerHTML = '';
  activeFilters.clear();
  tagFilterBar.innerHTML = '';
  tagFilterBar.hidden = true;
  allFiles = [];
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  sharedOnly = false;
  if (sharedOnlyToggle) sharedOnlyToggle.checked = false;
  listToolbar.hidden = true;
  emptyState.hidden = true;
  if (nonVideoWarning) nonVideoWarning.hidden = true;
  currentFolder = null;
  if (folderMenu) folderMenu.hidden = true;
  if (folderPicker && folderPicker.open) folderPicker.close();
  showError(null);
}

async function fetchUserEmail() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.email) userEmailEl.textContent = data.email;
  } catch (_) {}
}

async function listFiles() {
  if (!currentFolder) {
    openFolderPicker();
    return;
  }
  fileList.innerHTML = '';
  showError(null);
  emptyState.hidden = true;
  listToolbar.hidden = true;
  loadingEl.hidden = false;

  const fetched = [];
  let pageToken = null;

  try {
    do {
      const params = new URLSearchParams({
        q: `'${currentFolder.id}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,hasThumbnail,description,videoMediaMetadata,appProperties,permissions(id,type,emailAddress,role))',
        pageSize: '100',
        orderBy: 'name',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const resp = await fetch(
        'https://www.googleapis.com/drive/v3/files?' + params,
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );

      if (resp.status === 401) {
        showError('Session expired — please sign in again.');
        showSignedOutState();
        return;
      }
      if (resp.status === 404) {
        loadingEl.hidden = true;
        showError('That video folder is no longer available — please choose another.');
        clearStoredFolder();
        currentFolder = null;
        renderFolderMenu();
        openFolderPicker();
        return;
      }
      if (!resp.ok) {
        throw new Error('Drive API returned ' + resp.status);
      }

      const data = await resp.json();
      fetched.push(...data.files);
      pageToken = data.nextPageToken || null;
    } while (pageToken);
  } catch (err) {
    showError(err.message);
    return;
  } finally {
    loadingEl.hidden = true;
  }

  const isFolder = f => f.mimeType === 'application/vnd.google-apps.folder';
  const isVideo  = f => f.mimeType && f.mimeType.startsWith('video/');
  allFiles = fetched.filter(isVideo);
  const nonVideoCount = fetched.filter(f => !isFolder(f) && !isVideo(f)).length;
  if (nonVideoWarning) {
    if (nonVideoCount > 0) {
      nonVideoWarningText.textContent =
        `This folder contains ${nonVideoCount} non-video file${nonVideoCount === 1 ? '' : 's'} that are not shown.`;
      nonVideoWarning.hidden = false;
    } else {
      nonVideoWarning.hidden = true;
    }
  }
  listToolbar.hidden = !allFiles.length;
  renderList();
  renderTagBar();
}

// Sort comparator for the current sort mode.
function sortFiles(files) {
  const byNameAsc = (a, b) => (a.name || '').localeCompare(b.name || '');
  const sorted = [...files];
  switch (currentSort) {
    case 'filmed': // newest filmed first; undated sink to the bottom
      return sorted.sort((a, b) => {
        const da = a.appProperties?.date_filmed || '';
        const db = b.appProperties?.date_filmed || '';
        if (!da && !db) return byNameAsc(a, b);
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      });
    case 'duration': // longest first
      return sorted.sort((a, b) =>
        Number(b.videoMediaMetadata?.durationMillis || 0) -
        Number(a.videoMediaMetadata?.durationMillis || 0));
    case 'shared': // most recently shared first; never-shared sink to the bottom
      return sorted.sort((a, b) => {
        const da = lastSharedDate(a);
        const db = lastSharedDate(b);
        if (!da && !db) return byNameAsc(a, b);
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      });
    default: // 'name'
      return sorted.sort(byNameAsc);
  }
}

// Render the list from the in-memory file set using the current sort, then apply filters.
function renderList() {
  renderFiles(sortFiles(allFiles));
  applyFilter();
}

function renderFiles(files) {
  if (!files.length) {
    fileList.innerHTML = '';
    emptyState.textContent = 'No videos found in your Drive folder yet.';
    emptyState.hidden = false;
    return;
  }
  fileList.innerHTML = files.map(file => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const icon = isFolder ? '📁' : '📄';
    const dateFilmed = file.appProperties?.['date_filmed'] || '';
    const duration = formatDuration(file.videoMediaMetadata?.durationMillis);
    const thumbSrc = file.hasThumbnail
      ? `https://drive.google.com/thumbnail?id=${file.id}&sz=w160-h120`
      : null;
    const thumbInner = thumbSrc
      ? `<img class="file-thumb" src="${thumbSrc}" alt="" referrerpolicy="no-referrer" onerror="handleThumbError(this)">`
      : `<span class="file-icon">${icon}</span>`;
    const thumb = `<div class="thumb-wrap">${thumbInner}<span class="play-btn" aria-hidden="true">&#9654;</span></div>`;
    const descText = file.description || '';
    const desc = `<div class="desc-area">
        <small class="file-desc">${escapeHtml(descText)}</small>
        <button class="edit-desc-btn" title="Edit description">&#9998;</button>
      </div>`;
    const tags = parseTags(file.appProperties?.tags);
    const share = publicShare(file);
    return `<li class="file-item" data-id="${file.id}" data-name="${escapeHtml(file.name)}" data-desc="${escapeHtml(descText)}" data-shared="${share ? '1' : '0'}" data-share-perm="${share ? escapeHtml(share.permId) : ''}" data-last-shared="${escapeHtml(lastSharedRawFor(file))}" data-tags="${escapeHtml(tags.join(','))}" data-date-filmed="${escapeHtml(dateFilmed)}">
      <div class="file-row">
        ${thumb}
        <div class="file-info">
          <div class="name-area">
            <span class="file-name">${escapeHtml(splitName(file.name).base)}</span>
            <button class="edit-name-btn" title="Edit filename">&#9998;</button>
          </div>
          ${desc}
          <div class="tags-area">${tagsAreaHtml(tags)}</div>
          <div class="shared-area">${sharedAreaHtml(file)}</div>
        </div>
        <div class="file-meta">
          ${duration ? `<span class="file-duration">${duration}</span>` : ''}
          <div class="filmed-date-area">${filmedDateAreaHtml(dateFilmed)}</div>
        </div>
      </div>
    </li>`;
  }).join('');
}


let activePlayerItem = null;
let activePlayerRow = null;

function openPlayer(item) {
  if (activePlayerItem === item) {
    closePlayer();
    return;
  }
  closePlayer();
  const { id } = item.dataset;
  const player = document.createElement('div');
  player.className = 'video-player-inner';
  player.innerHTML = `
    <div class="video-close-bar">
      <button class="close-player-btn" aria-label="Close player">&#x2715; Close</button>
    </div>
    <iframe src="https://drive.google.com/file/d/${id}/preview"
            allowfullscreen allow="autoplay"
            class="video-frame-inline"></iframe>`;
  item.appendChild(player);
  item.classList.add('active-video');
  activePlayerItem = item;
  activePlayerRow = player;
  player.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePlayer() {
  if (activePlayerRow) {
    activePlayerRow.remove();
    activePlayerRow = null;
  }
  if (activePlayerItem) {
    activePlayerItem.classList.remove('active-video');
    activePlayerItem = null;
  }
}

fileList.addEventListener('click', event => {
  if (event.target.closest('.close-player-btn')) {
    closePlayer();
    return;
  }

  const item = event.target.closest('.file-item');
  if (!item) return;

  const copyBtn = event.target.closest('.copy-link-btn');
  if (copyBtn) {
    copyShareLink(item, copyBtn);
    return;
  }
  if (event.target.closest('.share-btn')) {
    doShare(item);
    return;
  }
  if (event.target.closest('.disable-share-btn')) {
    disableShare(item);
    return;
  }

  if (event.target.closest('.edit-name-btn')) {
    startEditName(item);
    return;
  }
  if (event.target.closest('.save-name-btn')) {
    saveName(item);
    return;
  }
  if (event.target.closest('.cancel-name-btn')) {
    cancelEditName(item);
    return;
  }

  if (event.target.closest('.edit-desc-btn')) {
    startEditDesc(item);
    return;
  }
  if (event.target.closest('.save-desc-btn')) {
    saveDesc(item);
    return;
  }
  if (event.target.closest('.cancel-desc-btn')) {
    cancelEditDesc(item);
    return;
  }

  if (event.target.closest('.edit-filmed-date-btn')) {
    startEditFilmedDate(item);
    return;
  }
  if (event.target.closest('.save-filmed-date-btn')) {
    saveFilmedDate(item);
    return;
  }
  if (event.target.closest('.cancel-filmed-date-btn')) {
    cancelEditFilmedDate(item);
    return;
  }

  if (event.target.closest('.add-tag-btn')) {
    startAddTag(item);
    return;
  }
  if (event.target.closest('.cancel-tag-btn')) {
    cancelAddTag(item);
    return;
  }
  const removeBtn = event.target.closest('.remove-tag-btn');
  if (removeBtn) {
    removeTag(item, removeBtn.dataset.tag);
    return;
  }

  if (event.target.closest('.thumb-wrap')) {
    openPlayer(item);
  }
});

fileList.addEventListener('change', event => {
  if (event.target.classList.contains('tag-select')) {
    const item = event.target.closest('.file-item');
    if (item && event.target.value) saveTag(item, event.target.value);
  }
});

fileList.addEventListener('keydown', event => {
  const item = event.target.closest('.file-item');
  if (!item) return;
  if (event.target.classList.contains('name-input')) {
    if (event.key === 'Enter') saveName(item);
    if (event.key === 'Escape') cancelEditName(item);
  }
  if (event.target.classList.contains('desc-input')) {
    if (event.key === 'Enter') saveDesc(item);
    if (event.key === 'Escape') cancelEditDesc(item);
  }
  if (event.target.classList.contains('filmed-date-input')) {
    if (event.key === 'Enter') saveFilmedDate(item);
    if (event.key === 'Escape') cancelEditFilmedDate(item);
  }
});

// Single date format used everywhere: "May 6, 2026".
function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Briefly flash a row green after a successful save so edits feel acknowledged.
function flashSaved(item) {
  item.classList.remove('just-saved');
  void item.offsetWidth; // restart the animation if it's mid-flight
  item.classList.add('just-saved');
  setTimeout(() => item.classList.remove('just-saved'), 1200);
}

// ── Public link sharing ──

// The active public-link share for a file, derived from its live Drive permissions.
// Returns the "anyone with the link" permission (carrying its id, needed to disable)
// or null when the file isn't shared.
function publicShare(file) {
  const perm = (file.permissions || []).find(p => p.type === 'anyone');
  return perm ? { permId: perm.id } : null;
}

// The raw "<email>|<iso>" string we store, folding in the legacy date-only property.
function lastSharedRawFor(file) {
  if (file.appProperties?.last_shared) return file.appProperties.last_shared;
  const legacy = file.appProperties?.['last-shared-date'];
  return legacy ? '|' + legacy : '';
}

function parseLastSharedStr(raw) {
  if (!raw) return { email: '', iso: '' };
  const i = raw.indexOf('|');
  return i === -1 ? { email: '', iso: raw } : { email: raw.slice(0, i), iso: raw.slice(i + 1) };
}

function lastSharedDate(file) {
  return parseLastSharedStr(lastSharedRawFor(file)).iso;
}

function sharedAreaInnerHtml(shared, lastSharedRaw) {
  const badge = shared ? '<span class="share-badge">Shared</span>' : '';
  const last = parseLastSharedStr(lastSharedRaw);
  let info;
  if (last.iso) {
    info = `<small class="shared-info">Last shared ${formatDate(new Date(last.iso))}</small>`;
  } else {
    info = '<small class="shared-info muted">Never shared</small>';
  }
  const copy = '<button class="copy-link-btn" title="Copy view link">&#128279; Copy link</button>';
  const toggle = shared
    ? '<button class="disable-share-btn" title="Stop sharing the public link">Stop sharing</button>'
    : '<button class="share-btn" title="Create a public view link">&#8599; Share</button>';
  return `${badge}${info}${copy}${toggle}`;
}

// Initial render straight from the file object.
function sharedAreaHtml(file) {
  return sharedAreaInnerHtml(!!publicShare(file), lastSharedRawFor(file));
}

// Re-render the shared area from the item's own dataset (source of truth after edits).
function renderSharedArea(item) {
  item.querySelector('.shared-area').innerHTML =
    sharedAreaInnerHtml(item.dataset.shared === '1', item.dataset.lastShared || '');
  applyFilter();
}

// Copy the file's Drive view link. While sharing is enabled the link grants
// anyone view-only access; when disabled the link no longer opens.
async function copyShareLink(item, btn) {
  const link = `https://drive.google.com/file/d/${item.dataset.id}/view`;
  try {
    await navigator.clipboard.writeText(link);
    const original = btn.innerHTML;
    btn.innerHTML = 'Copied!';
    setTimeout(() => { btn.innerHTML = original; }, 1200);
  } catch (err) {
    showError('Could not copy link: ' + err.message);
  }
}

async function doShare(item) {
  const area = item.querySelector('.shared-area');
  area.querySelectorAll('button, select').forEach(el => el.disabled = true);
  const fileId = item.dataset.id;
  const now = new Date().toISOString();
  try {
    // 1. Disable download/print/copy for viewers (idempotent, file-level setting).
    let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyRequiresWriterPermission: true }),
    });
    if (!resp.ok) throw new Error('Failed (' + resp.status + ')');

    // 2. Publish a public, view-only link (link-only: allowFileDiscovery defaults to false).
    resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=id`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!resp.ok) throw new Error('Failed (' + resp.status + ')');
    const perm = await resp.json();

    // 3. Record when for the "Last shared" line.
    resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: { last_shared: now } }),
    });
    if (!resp.ok) throw new Error('Failed (' + resp.status + ')');

    item.dataset.shared = '1';
    item.dataset.sharePerm = perm.id;
    item.dataset.lastShared = now;
    renderSharedArea(item);
    flashSaved(item);
  } catch (err) {
    showError('Failed to share: ' + err.message);
    renderSharedArea(item);
  }
}

async function disableShare(item) {
  const area = item.querySelector('.shared-area');
  area.querySelectorAll('button, select').forEach(el => el.disabled = true);
  const permId = item.dataset.sharePerm;
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.dataset.id}/permissions/${permId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    // 204 on success; 404 means it's already gone — treat both as removed.
    if (!resp.ok && resp.status !== 404) throw new Error('Failed (' + resp.status + ')');
    item.dataset.shared = '0';
    item.dataset.sharePerm = '';
    renderSharedArea(item);
    flashSaved(item);
  } catch (err) {
    showError('Failed to stop sharing: ' + err.message);
    renderSharedArea(item);
  }
}

function formatDuration(ms) {
  if (!ms) return '';
  const total = Math.round(Number(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function splitName(fullName) {
  const dot = fullName.lastIndexOf('.');
  return dot === -1
    ? { base: fullName, ext: '' }
    : { base: fullName.slice(0, dot), ext: fullName.slice(dot) };
}

function nameAreaHtml(fullName) {
  const { base } = splitName(fullName);
  return `<span class="file-name">${escapeHtml(base)}</span>
      <button class="edit-name-btn" title="Edit filename">&#9998;</button>`;
}

function startEditName(item) {
  const nameArea = item.querySelector('.name-area');
  const { base } = splitName(item.dataset.name || '');
  nameArea.innerHTML = `<input class="name-input" type="text" value="${escapeHtml(base)}" placeholder="Filename">
      <button class="save-name-btn">Save</button>
      <button class="cancel-name-btn outline secondary">Cancel</button>`;
  const input = nameArea.querySelector('.name-input');
  input.focus();
  input.select();
}

function cancelEditName(item) {
  item.querySelector('.name-area').innerHTML = nameAreaHtml(item.dataset.name || '');
}

async function saveName(item) {
  const nameArea = item.querySelector('.name-area');
  const input = nameArea.querySelector('.name-input');
  const newBase = input.value.trim();
  if (!newBase) return;
  const { ext } = splitName(item.dataset.name || '');
  const newFullName = newBase + ext;
  input.disabled = true;
  nameArea.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.dataset.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFullName }),
    });
    if (!resp.ok) throw new Error('Save failed (' + resp.status + ')');
    item.dataset.name = newFullName;
    nameArea.innerHTML = nameAreaHtml(newFullName);
    flashSaved(item);
  } catch (err) {
    showError('Failed to save filename: ' + err.message);
    input.disabled = false;
    nameArea.querySelectorAll('button').forEach(b => b.disabled = false);
  }
}

function filmedDateAreaHtml(dateStr) {
  const display = dateStr ? formatDate(new Date(dateStr + 'T00:00:00')) : 'No filmed date';
  return `<span class="file-date${dateStr ? '' : ' muted'}">${escapeHtml(display)}</span>
      <button class="edit-filmed-date-btn" title="Edit filmed date">&#9998;</button>`;
}

function startEditFilmedDate(item) {
  const area = item.querySelector('.filmed-date-area');
  const current = item.dataset.dateFilmed || '';
  area.innerHTML = `<input class="filmed-date-input" type="date" value="${escapeHtml(current)}">
      <button class="save-filmed-date-btn">Save</button>
      <button class="cancel-filmed-date-btn outline secondary">Cancel</button>`;
  area.querySelector('.filmed-date-input').focus();
}

function cancelEditFilmedDate(item) {
  item.querySelector('.filmed-date-area').innerHTML = filmedDateAreaHtml(item.dataset.dateFilmed || '');
}

async function saveFilmedDate(item) {
  const area = item.querySelector('.filmed-date-area');
  const input = area.querySelector('.filmed-date-input');
  const newDate = input.value;
  input.disabled = true;
  area.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.dataset.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: { date_filmed: newDate } }),
    });
    if (!resp.ok) throw new Error('Save failed (' + resp.status + ')');
    item.dataset.dateFilmed = newDate;
    area.innerHTML = filmedDateAreaHtml(newDate);
    flashSaved(item);
  } catch (err) {
    showError('Failed to save filmed date: ' + err.message);
    input.disabled = false;
    area.querySelectorAll('button').forEach(b => b.disabled = false);
  }
}

function descAreaHtml(text) {
  return `<small class="file-desc">${escapeHtml(text)}</small>
      <button class="edit-desc-btn" title="Edit description">&#9998;</button>`;
}

function startEditDesc(item) {
  const descArea = item.querySelector('.desc-area');
  const current = item.dataset.desc || '';
  descArea.innerHTML = `<input class="desc-input" type="text" value="${escapeHtml(current)}" placeholder="Add a description…">
      <button class="save-desc-btn">Save</button>
      <button class="cancel-desc-btn outline secondary">Cancel</button>`;
  descArea.querySelector('.desc-input').focus();
}

function cancelEditDesc(item) {
  item.querySelector('.desc-area').innerHTML = descAreaHtml(item.dataset.desc || '');
}

async function saveDesc(item) {
  const descArea = item.querySelector('.desc-area');
  const input = descArea.querySelector('.desc-input');
  const newDesc = input.value.trim();
  input.disabled = true;
  descArea.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.dataset.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc }),
    });
    if (!resp.ok) throw new Error('Save failed (' + resp.status + ')');
    item.dataset.desc = newDesc;
    descArea.innerHTML = descAreaHtml(newDesc);
    flashSaved(item);
  } catch (err) {
    showError('Failed to save description: ' + err.message);
    input.disabled = false;
    descArea.querySelectorAll('button').forEach(b => b.disabled = false);
  }
}

function parseTags(str) {
  const seen = new Set();
  return (str || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t && !seen.has(t) && seen.add(t));
}

function serializeTags(arr) {
  return arr.join(',');
}

// Curated, brand-aligned tag colors (hue, saturation%, lightness% of the base/solid color).
// Hues are sampled from the Inspired to Move logo & site: blue, teal, purple, green, magenta.
// Known tags get an intentional color; anything else falls back to a stable pick from PALETTE
// so new tags still look designed rather than random.
const TAG_COLORS = {
  legs:    { h: 205, s: 70, l: 45 }, // brand blue
  core:    { h: 188, s: 62, l: 42 }, // teal
  arms:    { h: 280, s: 42, l: 52 }, // purple
  cardio:  { h: 150, s: 48, l: 40 }, // green
  stretch: { h: 330, s: 55, l: 52 }, // magenta
};
const PALETTE = [
  { h: 205, s: 70, l: 45 },
  { h: 188, s: 62, l: 42 },
  { h: 280, s: 42, l: 52 },
  { h: 150, s: 48, l: 40 },
  { h: 330, s: 55, l: 52 },
  { h: 25,  s: 68, l: 50 },
];

// Always returns the same color for a given tag name.
function tagColor(tag) {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  let i = 0;
  for (let n = 0; n < tag.length; n++) i = (i * 31 + tag.charCodeAt(n)) % PALETTE.length;
  return PALETTE[i];
}

function tagChipHtml(t) {
  const c = tagColor(t);
  const style = `background:hsl(${c.h} ${c.s}% 92%);color:hsl(${c.h} ${c.s}% 28%)`;
  return `<span class="tag-chip" style="${style}">${escapeHtml(t)}<button class="remove-tag-btn" data-tag="${escapeHtml(t)}" title="Remove tag">&#x2715;</button></span>`;
}

function tagsAreaHtml(tags) {
  const chips = tags.map(tagChipHtml).join('');
  return `${chips}<button class="add-tag-btn" title="Add tag">+ Tag</button>`;
}

function startAddTag(item) {
  const area = item.querySelector('.tags-area');
  const current = parseTags(item.dataset.tags);
  const available = (typeof AVAILABLE_TAGS !== 'undefined' ? AVAILABLE_TAGS : [])
    .filter(t => !current.includes(t));
  const chips = current.map(tagChipHtml).join('');
  if (!available.length) {
    area.innerHTML = `${chips}<small class="all-tags-note">All tags added</small>
      <button class="cancel-tag-btn outline secondary">Done</button>`;
    return;
  }
  const options = ['<option value="">Add tag…</option>']
    .concat(available.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`))
    .join('');
  area.innerHTML = `${chips}<select class="tag-select">${options}</select>
      <button class="cancel-tag-btn outline secondary">Cancel</button>`;
  area.querySelector('.tag-select').focus();
}

function cancelAddTag(item) {
  item.querySelector('.tags-area').innerHTML = tagsAreaHtml(parseTags(item.dataset.tags));
}

async function saveTag(item, tag) {
  const merged = parseTags(item.dataset.tags);
  if (!merged.includes(tag)) merged.push(tag);
  await patchTags(item, merged);
}

async function removeTag(item, tag) {
  const remaining = parseTags(item.dataset.tags).filter(t => t !== tag);
  await patchTags(item, remaining);
}

async function patchTags(item, tags) {
  const area = item.querySelector('.tags-area');
  area.querySelectorAll('button, select').forEach(el => el.disabled = true);
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${item.dataset.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: { tags: serializeTags(tags) } }),
    });
    if (!resp.ok) throw new Error('Save failed (' + resp.status + ')');
    item.dataset.tags = serializeTags(tags);
    area.innerHTML = tagsAreaHtml(tags);
    flashSaved(item);
    applyFilter();
  } catch (err) {
    showError('Failed to update tags: ' + err.message);
    area.innerHTML = tagsAreaHtml(parseTags(item.dataset.tags));
  }
}

function renderTagBar() {
  const tags = typeof AVAILABLE_TAGS !== 'undefined' ? AVAILABLE_TAGS : [];
  if (!tags.length) {
    tagFilterBar.hidden = true;
    tagFilterBar.innerHTML = '';
    return;
  }
  const chips = tags.map(t => {
    const c = tagColor(t);
    const active = activeFilters.has(t);
    const style = active
      ? `background:hsl(${c.h} ${c.s}% ${c.l}%);border-color:hsl(${c.h} ${c.s}% ${c.l}%);color:#fff`
      : `border-color:hsl(${c.h} ${c.s}% 65%);color:hsl(${c.h} ${c.s}% 32%)`;
    return `<button class="tag-filter${active ? ' active' : ''}" data-tag="${escapeHtml(t)}" style="${style}">${escapeHtml(t)}</button>`;
  }).join('');
  const clear = activeFilters.size
    ? '<button class="tag-filter-clear outline secondary">Clear</button>'
    : '';
  tagFilterBar.innerHTML = chips + clear;
  tagFilterBar.hidden = false;
}

function applyFilter() {
  const q = searchQuery.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.file-item').forEach(item => {
    const tags = new Set(parseTags(item.dataset.tags));
    const tagMatch = [...activeFilters].every(t => tags.has(t));
    const haystack = `${item.dataset.name || ''} ${item.dataset.desc || ''}`.toLowerCase();
    const searchMatch = !q || haystack.includes(q);
    const sharedMatch = !sharedOnly || item.dataset.shared === '1';
    const matches = tagMatch && searchMatch && sharedMatch;
    item.hidden = !matches;
    if (matches) visible++;
    if (!matches && item === activePlayerItem) closePlayer();
  });
  // Only manage the empty state here when there are files to filter;
  // the "no files at all" message is owned by renderFiles().
  if (allFiles.length) {
    if (!visible) {
      emptyState.textContent = 'No videos match your search or filters.';
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
    }
  }
}

tagFilterBar.addEventListener('click', event => {
  if (event.target.closest('.tag-filter-clear')) {
    activeFilters.clear();
  } else {
    const btn = event.target.closest('.tag-filter');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (activeFilters.has(tag)) activeFilters.delete(tag);
    else activeFilters.add(tag);
  }
  renderTagBar();
  applyFilter();
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    applyFilter();
  });
}

if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderList();
  });
}

if (sharedOnlyToggle) {
  sharedOnlyToggle.addEventListener('change', () => {
    sharedOnly = sharedOnlyToggle.checked;
    applyFilter();
  });
}

function showError(msg) {
  if (msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  } else {
    errorMsg.textContent = '';
    errorMsg.hidden = true;
  }
}

function handleThumbError(img) {
  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = '📄';
  img.replaceWith(icon);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Chosen video folder (persisted in a cookie) ──

const FOLDER_COOKIE = 'tea_folder';

// Returns the stored folder as { id, name }, or null if none is set.
function getStoredFolder() {
  const match = document.cookie
    .split('; ')
    .find(c => c.startsWith(FOLDER_COOKIE + '='));
  if (!match) return null;
  const raw = match.slice(FOLDER_COOKIE.length + 1);
  const sep = raw.indexOf('|');
  if (sep === -1) return null;
  const id = raw.slice(0, sep);
  const name = decodeURIComponent(raw.slice(sep + 1));
  return id ? { id, name } : null;
}

function setStoredFolder(id, name) {
  const value = `${id}|${encodeURIComponent(name)}`;
  // ~1 year, scoped to the app; Lax is fine for this same-site read on load.
  document.cookie = `${FOLDER_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function clearStoredFolder() {
  document.cookie = `${FOLDER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

// ── Header folder menu ──

// Fill in the current folder name and reveal the menu (hidden when no folder).
function renderFolderMenu() {
  if (!folderMenu) return;
  if (currentFolder) {
    if (folderMenuName) folderMenuName.textContent = currentFolder.name;
    folderMenu.hidden = false;
  } else {
    folderMenu.hidden = true;
  }
}

if (changeFolderBtn) {
  changeFolderBtn.addEventListener('click', event => {
    event.preventDefault();
    if (folderMenu) folderMenu.open = false; // close the <details> dropdown
    openFolderPicker();
  });
}

// ── Folder picker modal ──

// The folder currently being viewed in the picker; also the selection target.
let pickerCurrent = null;
// Breadcrumb stack of ancestors, e.g. [{ id:'root', name:'My Drive' }, …].
let pickerTrail = [];

function openFolderPicker() {
  if (!folderPicker) return;
  pickerTrail = [];
  // Cancel is only allowed once a folder is already configured.
  if (folderCancelBtn) folderCancelBtn.hidden = !currentFolder;
  if (!folderPicker.open) folderPicker.showModal();
  browseFolder('root', 'My Drive');
}

// List the subfolders of `parentId` and render them as the current view.
async function browseFolder(parentId, parentName) {
  pickerCurrent = { id: parentId, name: parentName };
  if (folderPickerError) folderPickerError.hidden = true;
  if (folderSelectBtn) folderSelectBtn.disabled = true;
  folderPickerList.innerHTML = '<li class="folder-loading">Loading…</li>';
  renderCrumbs();

  try {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      orderBy: 'name',
      pageSize: '200',
    });
    const resp = await fetch(
      'https://www.googleapis.com/drive/v3/files?' + params,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    if (resp.status === 401) {
      folderPicker.close();
      showError('Session expired — please sign in again.');
      showSignedOutState();
      return;
    }
    if (!resp.ok) throw new Error('Drive API returned ' + resp.status);
    const data = await resp.json();
    const folders = data.files || [];
    const parent = pickerTrail.length ? pickerTrail[pickerTrail.length - 1] : null;
    const upRow = parent
      ? `<li><button class="folder-row folder-up" data-id="${escapeHtml(parent.id)}" data-name="${escapeHtml(parent.name)}" data-up="1">
           <span class="folder-row-icon">↩</span>..&ensp;<small>${escapeHtml(parent.name)}</small>
         </button></li>`
      : '';
    const folderRows = folders.map(f =>
      `<li><button class="folder-row" data-id="${escapeHtml(f.id)}" data-name="${escapeHtml(f.name)}">
         <span class="folder-row-icon">📁</span>${escapeHtml(f.name)}
       </button></li>`).join('');
    folderPickerList.innerHTML = upRow + (folderRows || '<li class="folder-empty">No subfolders here.</li>');
  } catch (err) {
    folderPickerList.innerHTML = '';
    if (folderPickerError) {
      folderPickerError.textContent = 'Could not load folders: ' + err.message;
      folderPickerError.hidden = false;
    }
  } finally {
    if (folderSelectBtn) folderSelectBtn.disabled = false;
  }
}

// Render the breadcrumb trail plus the current folder (the selection target).
function renderCrumbs() {
  if (!folderPickerCrumbs) return;
  const crumbs = [...pickerTrail, pickerCurrent];
  folderPickerCrumbs.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    const label = escapeHtml(c.name);
    const node = isLast
      ? `<span class="crumb-current">${label}</span>`
      : `<button class="crumb-link" data-index="${i}">${label}</button>`;
    return i === 0 ? node : `<span class="crumb-sep">›</span>${node}`;
  }).join('');
}

if (folderPickerCrumbs) {
  folderPickerCrumbs.addEventListener('click', event => {
    const link = event.target.closest('.crumb-link');
    if (!link) return;
    const index = Number(link.dataset.index);
    const target = pickerTrail[index];
    pickerTrail = pickerTrail.slice(0, index);
    browseFolder(target.id, target.name);
  });
}

if (folderPickerList) {
  folderPickerList.addEventListener('click', event => {
    const row = event.target.closest('.folder-row');
    if (!row) return;
    if (row.dataset.up) {
      // ".. parent" row: pop the trail without re-pushing current
      pickerTrail.pop();
    } else {
      pickerTrail.push(pickerCurrent);
    }
    browseFolder(row.dataset.id, row.dataset.name);
  });
}

if (folderSelectBtn) {
  folderSelectBtn.addEventListener('click', () => {
    if (!pickerCurrent) return;
    currentFolder = { id: pickerCurrent.id, name: pickerCurrent.name };
    setStoredFolder(currentFolder.id, currentFolder.name);
    renderFolderMenu();
    folderPicker.close();
    listFiles();
  });
}

if (folderCancelBtn) {
  folderCancelBtn.addEventListener('click', () => folderPicker.close());
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
