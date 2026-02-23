/* ═══════════════════════════════════════════════════════════════════════════
   CandidateMatch — Content Script
   Detects job-application form fields and fills them from the stored profile.
   Works across: Greenhouse, Lever, Workday, Taleo, iCIMS, BambooHR, etc.
   ═══════════════════════════════════════════════════════════════════════════ */

const FIELD_MAP = {
  firstName: {
    names:  ['first_name','firstname','fname','given_name','givenname','first-name','applicant_first_name','candidate_first_name'],
    labels: ['first name','given name','prénom','vorname'],
    placeholders: ['first name','given name'],
  },
  lastName: {
    names:  ['last_name','lastname','lname','surname','family_name','familyname','last-name','applicant_last_name','candidate_last_name'],
    labels: ['last name','surname','family name','nom'],
    placeholders: ['last name','surname','family name'],
  },
  fullName: {
    names:  ['full_name','fullname','name','candidate_name','applicant_name','your_name','display_name'],
    labels: ['full name','name','your name','legal name'],
    placeholders: ['full name','your name','enter your name','legal name'],
  },
  email: {
    names:  ['email','email_address','emailaddress','e-mail','candidate_email','applicant_email'],
    labels: ['email','e-mail','email address'],
    placeholders: ['email','your email','email address'],
    types:  ['email'],
  },
  phone: {
    names:  ['phone','telephone','tel','phone_number','phonenumber','mobile','cell','cell_phone','candidate_phone'],
    labels: ['phone','telephone','mobile','phone number','cell','contact number'],
    placeholders: ['phone','phone number','(xxx) xxx-xxxx','mobile'],
    types:  ['tel'],
  },
  linkedinUrl: {
    names:  ['linkedin','linkedin_url','linkedinurl','linkedin_profile','linkedin_profile_url'],
    labels: ['linkedin','linkedin url','linkedin profile'],
    placeholders: ['linkedin','linkedin.com/in/','linkedin url','linkedin profile url'],
  },
  portfolioUrl: {
    names:  ['portfolio','website','portfolio_url','personal_website','website_url','homepage','github','github_url'],
    labels: ['portfolio','website','personal website','portfolio url','github','personal url'],
    placeholders: ['portfolio','website url','your website','github.com/','https://'],
  },
  location: {
    names:  ['location','city','address','current_location','city_name','candidate_location','address_line1'],
    labels: ['location','city','current location','where are you based','where are you located','address'],
    placeholders: ['city','location','city, state','where are you located'],
  },
  currentTitle: {
    names:  ['current_title','title','job_title','current_job_title','position','headline','current_role'],
    labels: ['current title','job title','current position','title','headline','current role'],
    placeholders: ['current title','job title','your title','current role'],
  },
  currentCompany: {
    names:  ['current_company','company','current_employer','employer','company_name','organization'],
    labels: ['current company','company','current employer','employer','organization'],
    placeholders: ['current company','company name','employer'],
  },
  yearsExperience: {
    names:  ['years_experience','experience','years_of_experience','total_experience','experience_years'],
    labels: ['years of experience','total experience','how many years','experience'],
    placeholders: ['years of experience','years','experience'],
  },
  summary: {
    names:  ['summary','about','bio','cover_letter','coverletter','about_me','cover_letter_text','additional_information','message'],
    labels: ['summary','about you','cover letter','tell us about yourself','why are you interested','additional information','message to hiring manager'],
    placeholders: ['tell us about yourself','cover letter','summary','why are you interested','write a cover letter'],
  },
  skills: {
    names:  ['skills','key_skills','technical_skills','competencies'],
    labels: ['skills','key skills','technical skills','competencies'],
    placeholders: ['skills','enter skills','list your skills'],
  },
  degree: {
    names:  ['degree','education_level','highest_degree','qualification'],
    labels: ['degree','education','highest degree','qualification','education level'],
    placeholders: ['degree','highest degree'],
  },
  school: {
    names:  ['school','university','institution','college','alma_mater','school_name'],
    labels: ['school','university','institution','college','school name'],
    placeholders: ['school','university name','institution'],
  },
  visaStatus: {
    names:  ['visa','visa_status','work_authorization','authorization','sponsorship','work_permit'],
    labels: ['visa','work authorization','authorized to work','require sponsorship','visa status','immigration status','work permit'],
    placeholders: ['visa status','work authorization'],
  },
};

/* ── Field detection helpers ─────────────────────────────────────────────── */

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAssociatedLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return normalize(label.textContent);
  }
  const parent = el.closest('label, .field, .form-group, .form-field, [class*="field"], [class*="input"]');
  if (parent) {
    const label = parent.querySelector('label, .label, [class*="label"], legend');
    if (label && label !== el) return normalize(label.textContent);
  }
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'P')) {
    return normalize(prev.textContent);
  }
  return '';
}

function getAriaLabel(el) {
  return normalize(el.getAttribute('aria-label') || el.getAttribute('aria-describedby') || '');
}

function classifyField(el) {
  const name  = normalize(el.name);
  const id    = normalize(el.id);
  const ph    = normalize(el.placeholder);
  const type  = (el.type || '').toLowerCase();
  const label = getAssociatedLabel(el);
  const aria  = getAriaLabel(el);
  const haystack = `${name} ${id} ${ph} ${label} ${aria}`;

  for (const [field, patterns] of Object.entries(FIELD_MAP)) {
    if (patterns.types && patterns.types.includes(type)) return field;
    if (patterns.names.some((n) => name === n || id === n)) return field;
    if (patterns.names.some((n) => name.includes(n) || id.includes(n))) return field;
    if (patterns.labels.some((l) => label.includes(l))) return field;
    if (patterns.placeholders.some((p) => ph.includes(p))) return field;
    if (patterns.labels.some((l) => aria.includes(l))) return field;
  }
  return null;
}

/* ── Fill logic ──────────────────────────────────────────────────────────── */

function setNativeValue(el, value) {
  if (!value) return false;

  const tag = el.tagName.toLowerCase();
  const isSelect = tag === 'select';

  if (isSelect) {
    const options = Array.from(el.options);
    const match = options.find((o) =>
      normalize(o.text).includes(normalize(value)) ||
      normalize(o.value).includes(normalize(value))
    );
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

function fillPage(profile) {
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select'
  );

  let filled = 0;
  const results = [];

  for (const el of inputs) {
    if (el.offsetParent === null) continue; // hidden
    const field = classifyField(el);
    if (!field || !profile[field]) continue;
    if (el.value && el.value.trim().length > 0) continue; // don't overwrite existing

    const ok = setNativeValue(el, profile[field]);
    if (ok) {
      filled++;
      el.style.outline = '2px solid #6366f1';
      el.style.outlineOffset = '1px';
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2000);
    }
    results.push({ field, filled: ok, el: el.name || el.id || el.placeholder });
  }

  showToast(filled > 0 ? `Filled ${filled} field${filled !== 1 ? 's' : ''}` : 'No matching fields found on this page');
  return results;
}

/* ── Floating autofill button ────────────────────────────────────────────── */

let fabEl = null;

function injectFAB() {
  if (fabEl) return;
  if (!hasVisibleFormFields()) return;

  fabEl = document.createElement('div');
  fabEl.id = 'cm-autofill-fab';
  fabEl.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
    <span>Autofill</span>
  `;
  fabEl.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('profileData');
    if (data.profileData) {
      fillPage(data.profileData);
    } else {
      showToast('Not connected — open the extension popup to log in');
    }
  });
  document.body.appendChild(fabEl);
}

function hasVisibleFormFields() {
  const forms = document.querySelectorAll('form');
  if (forms.length === 0) {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea');
    return inputs.length >= 3;
  }
  for (const form of forms) {
    const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select');
    if (fields.length >= 3) return true;
  }
  return false;
}

/* ── Toast ───────────────────────────────────────────────────────────────── */

function showToast(msg) {
  let toast = document.getElementById('cm-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cm-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── Message listener ────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUTOFILL' && msg.profile) {
    fillPage(msg.profile);
  }
});

/* ── Init ────────────────────────────────────────────────────────────────── */

function init() {
  chrome.storage.local.get('profileData').then((d) => {
    if (d.profileData) injectFAB();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 500);
}

const observer = new MutationObserver(() => {
  if (!fabEl && hasVisibleFormFields()) {
    chrome.storage.local.get('profileData').then((d) => {
      if (d.profileData) injectFAB();
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });
