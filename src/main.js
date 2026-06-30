// ── FIREBASE ──────────────────────────────────────────────────────────────────
import { initializeApp }           from 'firebase/app'
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import './style.css'

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Values come from .env (VITE_* vars). Hardcoded fallbacks ensure the app
// works even if the dev server was started before .env was created.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyBWNd0jfebqqmFYnw8_yIPt6MAzYGvbrn8',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'projecttitle-ccffc.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'projecttitle-ccffc',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'projecttitle-ccffc.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| '523424515927',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:523424515927:web:5bee6e91d3b74eae50a012',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || 'G-LQP8X451S5',
}

// ── STARTUP DIAGNOSTIC ────────────────────────────────────────────────────────
// Logs config so you can confirm env vars are being picked up.
// apiKey is partially masked for safety.
const maskedKey = firebaseConfig.apiKey
  ? firebaseConfig.apiKey.slice(0, 8) + '…' + firebaseConfig.apiKey.slice(-4)
  : 'MISSING'

console.log('[TitleReg] Firebase config loaded:', {
  apiKey:            maskedKey,
  projectId:         firebaseConfig.projectId,
  authDomain:        firebaseConfig.authDomain,
  source:            import.meta.env.VITE_FIREBASE_API_KEY ? '.env' : 'hardcoded fallback',
})

// ── INIT ──────────────────────────────────────────────────────────────────────
let app, db

try {
  app = initializeApp(firebaseConfig)
  db  = getFirestore(app)
  console.log('[TitleReg] Firebase initialised ✓')
} catch (err) {
  console.error('[TitleReg] Firebase init failed:', err)
  showFatalError('Firebase failed to initialise. Check the config.')
}

const COLL = 'claims'

// ── DOM REFS ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

const form           = $('claim-form')
const teamInput      = $('team-name')
const titleInput     = $('project-title')
const noteInput      = $('project-note')
const submitBtn      = $('submit-btn')
const btnLabel       = $('btn-label')
const dupWarning     = $('dup-warning')
const dupDetail      = $('dup-detail')
const claimsList     = $('claims-list')
const emptyState     = $('empty-state')
const loadingSkel    = $('loading-skeletons')
const countTotal     = $('count-total')
const countToday     = $('count-today')
const searchInput    = $('search-input')
const toast          = $('toast')
const removeModal    = $('remove-modal')
const removeCancel   = $('remove-cancel')
const removeConfirm  = $('remove-confirm')
const removeTitleP   = $('remove-title-preview')
const dupModal       = $('dup-modal')
const dupCancel      = $('dup-cancel')
const dupConfirm     = $('dup-confirm')
const dupModalDetail = $('dup-modal-detail')

// ── APP STATE ─────────────────────────────────────────────────────────────────
let allClaims         = []
let pendingRemoveId   = null
let pendingSubmitData = null
let toastTimer        = null
let lastHighIds       = []

// ── DUPLICATE DETECTION ───────────────────────────────────────────────────────
const STOP = new Set([
  'a','an','the','and','or','of','in','on','at','to','for','is','are',
  'be','it','its','that','this','with','by','as','into','from','was',
  'based','using','system','application','app','project','implementation',
  'detection','tool','platform','framework','approach','technique',
  'study','analysis','design','development','smart','automated','intelligent',
  'advanced','enhanced','deep','learning','machine','model','network','web',
  'mobile','cloud','data','security','cyber','digital','online','real','time',
])

const tokenise = t =>
  t.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))

const jaccard = (a, b) => {
  const A = new Set(tokenise(a))
  const B = new Set(tokenise(b))
  if (!A.size && !B.size) return 0
  const intersection = [...A].filter(x => B.has(x)).length
  return intersection / new Set([...A, ...B]).size
}

const findDups = (inputTitle, excludeId = null) =>
  allClaims
    .filter(c => c.id !== excludeId)
    .map(c => ({ ...c, sim: jaccard(inputTitle, c.title) }))
    .filter(c => c.sim >= 0.35)
    .sort((a, b) => b.sim - a.sim)

// ── LIVE DUPLICATE CHECK ──────────────────────────────────────────────────────
function checkDupsUI(val) {
  clearHighlights()
  if (val.trim().length < 8) { dupWarning.classList.remove('visible'); return [] }

  const dups = findDups(val)
  if (!dups.length) { dupWarning.classList.remove('visible'); return [] }

  const top = dups[0]
  dupDetail.textContent =
    `"${top.title}" by ${top.teamName} — ${Math.round(top.sim * 100)}% keyword overlap`
  dupWarning.classList.add('visible')

  dups.forEach(d => {
    lastHighIds.push(d.id)
    const el = document.querySelector(`[data-id="${d.id}"]`)
    if (el) { el.classList.add('is-dup'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
  })
  return dups
}

titleInput.addEventListener('input', () => checkDupsUI(titleInput.value))

// ── FORM SUBMIT ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault()
  const teamName = teamInput.value.trim()
  const title    = titleInput.value.trim()
  const note     = noteInput.value.trim()
  if (!teamName || !title) return

  const dups = findDups(title)
  if (dups.length) {
    const top = dups[0]
    dupModalDetail.textContent =
      `Your title is ${Math.round(top.sim * 100)}% similar to "${top.title}" by ${top.teamName}. Submit anyway?`
    pendingSubmitData = { teamName, title, note }
    dupModal.classList.add('open')
    return
  }

  await doSubmit({ teamName, title, note })
})

dupCancel.addEventListener('click',  () => { dupModal.classList.remove('open'); pendingSubmitData = null })
dupConfirm.addEventListener('click', async () => {
  dupModal.classList.remove('open')
  if (pendingSubmitData) await doSubmit(pendingSubmitData)
  pendingSubmitData = null
})

async function doSubmit({ teamName, title, note }) {
  // Disable button immediately, show loading state
  submitBtn.disabled    = true
  btnLabel.textContent  = 'Registering…'

  try {
    await addDoc(collection(db, COLL), {
      teamName,
      title,
      note,
      // submittedAt is the canonical timestamp field for ordering
      submittedAt: serverTimestamp(),
    })

    form.reset()
    dupWarning.classList.remove('visible')
    clearHighlights()
    showToast('✓ Title registered!', 'ok')
    console.log('[TitleReg] Document written successfully')

  } catch (err) {
    // Log the full error so you can diagnose permission/index issues
    console.error('[TitleReg] addDoc failed:', err.code, err.message, err)

    // Show a clear, specific message based on error type
    if (err.code === 'permission-denied') {
      showToast('❌ Permission denied — check Firestore rules.', 'error')
      showInlineError('Database permission denied. Ask your admin to update Firestore rules.')
    } else if (err.code === 'unavailable' || err.code === 'network-request-failed') {
      showToast('❌ No connection — check your internet.', 'error')
    } else {
      showToast(`❌ Write failed: ${err.code || err.message}`, 'error')
    }

  } finally {
    // Always reset the button — it will NEVER stay stuck
    submitBtn.disabled   = false
    btnLabel.textContent = 'Register Title'
  }
}

// ── REMOVE ────────────────────────────────────────────────────────────────────
removeCancel.addEventListener('click', () => { removeModal.classList.remove('open'); pendingRemoveId = null })

removeConfirm.addEventListener('click', async () => {
  if (!pendingRemoveId) return
  removeModal.classList.remove('open')
  try {
    await deleteDoc(doc(db, COLL, pendingRemoveId))
    showToast('✓ Claim removed.', 'ok')
    console.log('[TitleReg] Document deleted:', pendingRemoveId)
  } catch (err) {
    console.error('[TitleReg] deleteDoc failed:', err.code, err.message)
    showToast(`❌ Remove failed: ${err.code || err.message}`, 'error')
  }
  pendingRemoveId = null
})

window.__removeEntry = (id, title) => {
  pendingRemoveId = id
  removeTitleP.textContent = `"${title}"`
  removeModal.classList.add('open')
}

// ── REAL-TIME LISTENER ────────────────────────────────────────────────────────
// NOTE on ordering:
//   - New documents written by this app set `submittedAt` via serverTimestamp().
//   - Old documents (written by the previous version) used field name `ts`.
//   - We query orderBy('submittedAt') which only requires a single-field index
//     (auto-created by Firestore — NO composite index needed).
//   - Old docs without `submittedAt` will appear at the END of the list (nulls last),
//     which is fine. They will NOT cause the listener to fail.

if (db) {
  const q = query(collection(db, COLL), orderBy('submittedAt', 'desc'))

  onSnapshot(
    q,

    // SUCCESS handler
    snap => {
      loadingSkel.style.display = 'none'
      console.log(`[TitleReg] onSnapshot received ${snap.size} document(s)`)

      allClaims = snap.docs.map(d => {
        const data = d.data()
        return {
          id:          d.id,
          // Support both old field name (ts) and new field name (submittedAt)
          teamName:    data.teamName  || data.team || '',
          title:       data.title     || '',
          note:        data.note      || '',
          submittedAt: data.submittedAt || data.ts || null,
        }
      })

      // Update stat cards
      const today      = new Date().toDateString()
      const todayCount = allClaims.filter(c =>
        c.submittedAt?.toDate?.()?.toDateString?.() === today
      ).length

      countTotal.textContent = allClaims.length
      countToday.textContent = todayCount

      renderCards(searchInput.value.trim())
    },

    // ERROR handler — never leave skeletons spinning forever
    err => {
      loadingSkel.style.display = 'none'
      console.error('[TitleReg] onSnapshot error:', err.code, err.message, err)

      // Show inline error in the list area instead of infinite skeletons
      claimsList.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#dc2626">
          <div style="font-size:32px;margin-bottom:12px">⚠️</div>
          <div style="font-weight:700;margin-bottom:6px">Couldn't connect to the database</div>
          <div style="font-size:13px;color:#6b7280">
            ${err.code === 'permission-denied'
              ? 'Firestore rules are blocking reads. Update rules to allow <code>claims</code>.'
              : err.code === 'failed-precondition'
              ? 'A Firestore index is required. See console for the link.'
              : `Error: ${err.code || err.message}`
            }
          </div>
          <button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;background:#1a6bff;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">
            Retry
          </button>
        </div>`

      // Also surface index creation link if needed
      if (err.code === 'failed-precondition') {
        const match = err.message.match(/https?:\/\/\S+/)
        if (match) {
          console.warn('[TitleReg] Create the required Firestore index here:', match[0])
          showToast('⚠️ Index needed — see console for link', 'error')
        }
      }
    }
  )
}

// ── RENDER CARDS ──────────────────────────────────────────────────────────────
function renderCards(filter = '') {
  const filtered = filter
    ? allClaims.filter(c =>
        c.title.toLowerCase().includes(filter.toLowerCase()) ||
        c.teamName.toLowerCase().includes(filter.toLowerCase())
      )
    : allClaims

  if (!filtered.length) {
    claimsList.innerHTML = ''
    emptyState.style.display = 'block'
    return
  }
  emptyState.style.display = 'none'

  const curInput = titleInput.value.trim()
  const curDups  = curInput.length >= 8
    ? new Set(findDups(curInput).map(d => d.id))
    : new Set()

  claimsList.innerHTML = filtered.map(c => {
    const isDup     = curDups.has(c.id)
    const globalIdx = String(allClaims.indexOf(c) + 1).padStart(3, '0')
    const noteHtml  = c.note ? `<div class="card-note">${esc(c.note)}</div>` : ''

    return `
      <div class="claim-card ${isDup ? 'is-dup' : ''}" data-id="${c.id}">
        <div class="stamp-badge">Possible Duplicate</div>
        <div class="card-top">
          <div class="card-team-badge">👤 ${esc(c.teamName)}</div>
          <div class="card-id">#${globalIdx}</div>
        </div>
        <div class="card-title">${esc(c.title)}</div>
        ${noteHtml}
        <div class="card-footer">
          <div class="card-time">🕐 ${fmt(c.submittedAt)}</div>
          <button class="remove-btn"
            onclick="window.__removeEntry('${c.id}',${JSON.stringify(c.title)})">
            Remove
          </button>
        </div>
      </div>`
  }).join('')
}

searchInput.addEventListener('input', () => renderCards(searchInput.value.trim()))

// ── HELPERS ───────────────────────────────────────────────────────────────────
function clearHighlights() {
  lastHighIds.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`)
    if (el) el.classList.remove('is-dup')
  })
  lastHighIds = []
}

function fmt(ts) {
  if (!ts) return 'just now'
  const d    = ts.toDate ? ts.toDate() : new Date(ts)
  const now  = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

let toastEl = toast  // reference kept for showFatalError (called before DOM is guaranteed)

function showToast(msg, type = '') {
  toastEl.textContent = msg
  toastEl.className   = 'show' + (type ? ' ' + type : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastEl.className = '' }, 4000)
}

function showInlineError(msg) {
  const el = document.createElement('div')
  el.style.cssText =
    'background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;' +
    'padding:12px 14px;font-size:13px;color:#dc2626;margin-top:8px;line-height:1.5'
  el.textContent = '⚠️ ' + msg
  form.appendChild(el)
  setTimeout(() => el.remove(), 8000)
}

function showFatalError(msg) {
  const body = document.body
  if (!body) return
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
    'background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;' +
    'font-size:14px;font-weight:600;z-index:9999;text-align:center;max-width:90vw'
  el.textContent = '⚠️ ' + msg
  body.appendChild(el)
}

;[removeModal, dupModal].forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) {
      m.classList.remove('open')
      pendingRemoveId   = null
      pendingSubmitData = null
    }
  })
})
