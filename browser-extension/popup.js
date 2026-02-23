const $ = (s) => document.querySelector(s);
const loginScreen = $('#login-screen');
const selectScreen = $('#select-screen');
const connectedScreen = $('#connected-screen');

const FIELD_LABELS = {
  fullName: 'Full Name', firstName: 'First Name', lastName: 'Last Name',
  email: 'Email', phone: 'Phone', location: 'Location',
  currentTitle: 'Title', currentCompany: 'Company',
  linkedinUrl: 'LinkedIn', portfolioUrl: 'Portfolio',
  summary: 'Summary', skills: 'Skills', yearsExperience: 'Experience',
  degree: 'Degree', school: 'School',
};

let allCandidates = [];

/* ── Boot ── */
chrome.storage.local.get(['accessToken', 'profileData', 'appUrl', 'anonKey', 'userRole', 'selectedCandidateId']).then((d) => {
  if (d.accessToken && d.profileData) {
    showConnected(d.profileData, d.userRole);
  } else if (d.accessToken && d.userRole && (d.userRole === 'admin' || d.userRole === 'recruiter')) {
    loadCandidateList();
  } else if (d.appUrl) {
    $('#app-url').value = d.appUrl;
    if (d.anonKey) $('#anon-key').value = d.anonKey;
  }
});

/* ── Login ── */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const errEl = $('#login-error');
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Connecting…';

  const appUrl = $('#app-url').value.replace(/\/+$/, '');
  const anonKey = $('#anon-key').value.trim();
  const email = $('#email').value.trim();
  const password = $('#password').value;

  try {
    const supabaseUrl = await resolveSupabaseUrl(appUrl, anonKey);
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const data = await res.json();

    await chrome.storage.local.set({
      appUrl,
      anonKey,
      supabaseUrl,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });

    // Fetch profile to determine role
    const profileRes = await fetch(`${appUrl}/api/autofill-profile`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => ({}));
      throw new Error(err.error || 'Could not load profile');
    }

    const profileData = await profileRes.json();

    if (profileData.mode === 'select_candidate') {
      // Admin or recruiter — show candidate selector
      await chrome.storage.local.set({
        userRole: profileData.role,
        userName: profileData.userName,
      });
      allCandidates = profileData.candidates;
      showSelectScreen(profileData);
    } else {
      // Candidate — direct to connected screen
      await chrome.storage.local.set({ profileData, userRole: 'candidate' });
      showConnected(profileData, 'candidate');
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
});

async function resolveSupabaseUrl(appUrl, anonKey) {
  try {
    const parts = anonKey.split('.');
    const payload = JSON.parse(atob(parts[1]));
    if (payload.iss) return payload.iss.replace(/\/auth\/v1$/, '');
  } catch { /* ignore */ }
  return appUrl;
}

/* ── Candidate selector (admin/recruiter) ── */
function showSelectScreen(data) {
  loginScreen.hidden = true;
  connectedScreen.hidden = true;
  selectScreen.hidden = false;

  const roleName = data.role === 'admin' ? 'Admin' : 'Recruiter';
  $('#role-badge').textContent = roleName;
  $('#user-name').textContent = data.userName || '';

  renderCandidateList(data.candidates);
}

function renderCandidateList(candidates) {
  const list = $('#candidate-list');
  const noMsg = $('#no-candidates');
  list.innerHTML = '';

  if (candidates.length === 0) {
    noMsg.hidden = false;
    return;
  }
  noMsg.hidden = true;

  for (const c of candidates) {
    const item = document.createElement('div');
    item.className = 'candidate-item';
    item.innerHTML = `
      <div class="candidate-avatar">${(c.name || '?')[0].toUpperCase()}</div>
      <div class="candidate-info">
        <div class="candidate-name">${escHtml(c.name)}</div>
        <div class="candidate-title">${escHtml(c.title || 'No title')}</div>
      </div>
      <span class="candidate-status ${c.active ? 'active' : 'inactive'}">${c.active ? 'Active' : 'Inactive'}</span>
    `;
    item.addEventListener('click', () => selectCandidate(c));
    list.appendChild(item);
  }
}

$('#candidate-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderCandidateList(allCandidates);
    return;
  }
  const filtered = allCandidates.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q)
  );
  renderCandidateList(filtered);
});

async function selectCandidate(c) {
  const { appUrl, accessToken } = await chrome.storage.local.get(['appUrl', 'accessToken']);
  if (!appUrl || !accessToken) return;

  // Show loading state on the clicked item
  const items = document.querySelectorAll('.candidate-item');
  items.forEach((el) => { el.style.pointerEvents = 'none'; el.style.opacity = '0.5'; });

  try {
    const res = await fetch(`${appUrl}/api/autofill-profile?candidate_id=${c.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load candidate');
    }
    const profileData = await res.json();
    const { userRole } = await chrome.storage.local.get('userRole');
    await chrome.storage.local.set({ profileData, selectedCandidateId: c.id });
    showConnected(profileData, userRole);
  } catch (err) {
    alert(err.message);
    items.forEach((el) => { el.style.pointerEvents = ''; el.style.opacity = ''; });
  }
}

async function loadCandidateList() {
  const { appUrl, accessToken } = await chrome.storage.local.get(['appUrl', 'accessToken']);
  if (!appUrl || !accessToken) return;

  const res = await fetch(`${appUrl}/api/autofill-profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  if (data.mode === 'select_candidate') {
    allCandidates = data.candidates;
    showSelectScreen(data);
  }
}

/* ── Connected screen ── */
function showConnected(profile, role) {
  loginScreen.hidden = true;
  selectScreen.hidden = true;
  connectedScreen.hidden = false;

  $('#p-name').textContent = profile.fullName || '—';
  $('#p-title').textContent = [profile.currentTitle, profile.currentCompany].filter(Boolean).join(' at ') || '—';
  $('#p-email').textContent = profile.email || '—';

  const isManager = role === 'admin' || role === 'recruiter';
  const changeBtn = $('#change-candidate-btn');
  changeBtn.hidden = !isManager;

  const list = $('#fields-list');
  list.innerHTML = '';
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const val = profile[key];
    const tag = document.createElement('span');
    tag.className = val ? 'tag' : 'tag empty';
    tag.textContent = label;
    tag.title = val || 'Not set';
    list.appendChild(tag);
  }
}

/* ── Fill current page ── */
$('#fill-btn').addEventListener('click', async () => {
  const { profileData } = await chrome.storage.local.get('profileData');
  if (!profileData) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL', profile: profileData });
  window.close();
});

/* ── Refresh ── */
$('#refresh-btn').addEventListener('click', async () => {
  const btn = $('#refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  const { appUrl, accessToken, selectedCandidateId, userRole } = await chrome.storage.local.get([
    'appUrl', 'accessToken', 'selectedCandidateId', 'userRole',
  ]);
  const url = selectedCandidateId
    ? `${appUrl}/api/autofill-profile?candidate_id=${selectedCandidateId}`
    : `${appUrl}/api/autofill-profile`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.mode) {
        await chrome.storage.local.set({ profileData: data });
        showConnected(data, userRole);
      }
    }
  } catch { /* silent */ }

  btn.disabled = false;
  btn.textContent = 'Refresh Profile';
});

/* ── Change candidate (admin/recruiter) ── */
$('#change-candidate-btn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['profileData', 'selectedCandidateId']);
  loadCandidateList();
});

/* ── Logout (all screens) ── */
function logout() {
  chrome.storage.local.remove([
    'accessToken', 'refreshToken', 'profileData',
    'userRole', 'userName', 'selectedCandidateId',
  ]);
  connectedScreen.hidden = true;
  selectScreen.hidden = true;
  loginScreen.hidden = false;
}

$('#logout-btn').addEventListener('click', logout);
$('#select-logout-btn').addEventListener('click', logout);

/* ── Util ── */
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
