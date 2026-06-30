// ── FIREBASE ──────────────────────────────────────────────────────────────────
import { initializeApp }           from 'firebase/app'
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import './style.css'

// All values come from .env (Vite exposes VITE_* vars via import.meta.env)
// ──────────────────────────────────────────────────────────────────────────────
// PASTE YOUR FIREBASE CONFIG HERE  ↓  (or fill in .env file)
// ──────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app  = initializeApp(firebaseConfig)
const db   = getFirestore(app)
const COLL = 'claims'

// ── DOM REFS ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

const form          = $('claim-form')
const teamInput     = $('team-name')
const titleInput    = $('project-title')
const noteInput     = $('project-note')
const submitBtn     = $('submit-btn')
const btnLabel      = $('btn-label')
const dupWarning    = $('dup-warning')
const dupDetail     = $('dup-detail')
const claimsList    = $('claims-list')
const emptyState    = $('empty-state')
const loadingSkel   = $('loading-skeletons')
const countTotal    = $('count-total')
const countToday    = $('count-today')
const searchInput   = $('search-input')
const toast         = $('toast')
const removeModal   = $('remove-modal')
const removeCancel  = $('remove-cancel')
const removeConfirm = $('remove-confirm')
const removeTitleP  = $('remove-title-preview')
const dupModal      = $('dup-modal')
const dupCancel     = $('dup-cancel')
const dupConfirm    = $('dup-confirm')
const dupModalDetail= $('dup-modal-detail')

// ── APP STATE ─────────────────────────────────────────────────────────────────
let allClaims         = []   // [{id, teamName, title, note, submittedAt}]
let pendingRemoveId   = null
let pendingSubmitData = null
let toastTimer        = null
let lastHighIds       = []

// ── DUPLICATE DETECTION ───────────────────────────────────────────────────────
// Words to ignore when comparing titles
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

// Returns list of existing claims that are ≥35% similar to inputTitle
const findDups = (inputTitle, excludeId = null) =>
  allClaims
    .filter(c => c.id !== excludeId)
    .map(c => ({ ...c, sim: jaccard(inputTitle, c.title) }))
    .filter(c => c.sim >= 0.35)
    .sort((a, b) => b.sim - a.sim)

// ── LIVE DUPLICATE CHECK ──────────────────────────────────────────────────────
function checkDupsUI(val) {
  // Clear previous highlights
  lastHighIds.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`)
    if (el) el.classList.remove('is-dup')
  })
  lastHighIds = []

  if (val.trim().length < 8) {
    dupWarning.classList.remove('visible')
    return []
  }

  const dups = findDups(val)
  if (!dups.length) {
    dupWarning.classList.remove('visible')
    return []
  }

  const top = dups[0]
  dupDetail.textContent =
    `"${top.title}" by ${top.teamName} — ${Math.round(top.sim * 100)}% keyword overlap`
  dupWarning.classList.add('visible')

  dups.forEach(d => {
    lastHighIds.push(d.id)
    const el = document.querySelector(`[data-id="${d.id}"]`)
    if (el) {
      el.classList.add('is-dup')
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
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
      `Your title is ${Math.round(top.sim * 100)}% similar to ` +
      `"${top.title}" by ${top.teamName}. Submit anyway?`
    pendingSubmitData = { teamName, title, note }
    dupModal.classList.add('open')
    return
  }

  await doSubmit({ teamName, title, note })
})

dupCancel.addEventListener('click', () => {
  dupModal.classList.remove('open')
  pendingSubmitData = null
})

dupConfirm.addEventListener('click', async () => {
  dupModal.classList.remove('open')
  if (pendingSubmitData) await doSubmit(pendingSubmitData)
  pendingSubmitData = null
})

async function doSubmit({ teamName, title, note }) {
  submitBtn.disabled = true
  btnLabel.textContent = 'Registering…'
  try {
    await addDoc(collection(db, COLL), {
      teamName,
      title,
      note,
      submittedAt: serverTimestamp(),
    })
    form.reset()
    dupWarning.classList.remove('visible')
    clearHighlights()
    showToast('✓ Title registered!', 'ok')
  } catch (err) {
    console.error(err)
    showToast('❌ Failed — check connection.', 'error')
  } finally {
    submitBtn.disabled = false
    btnLabel.textContent = 'Register Title'
  }
}

// ── REMOVE ────────────────────────────────────────────────────────────────────
removeCancel.addEventListener('click', () => {
  removeModal.classList.remove('open')
  pendingRemoveId = null
})

removeConfirm.addEventListener('click', async () => {
  if (!pendingRemoveId) return
  removeModal.classList.remove('open')
  try {
    await deleteDoc(doc(db, COLL, pendingRemoveId))
    showToast('✓ Claim removed.', 'ok')
  } catch (err) {
    console.error(err)
    showToast('❌ Could not remove.', 'error')
  }
  pendingRemoveId = null
})

// Exposed to card onclick handlers (safe, no eval)
window.__removeEntry = (id, title) => {
  pendingRemoveId = id
  removeTitleP.textContent = `"${title}"`
  removeModal.classList.add('open')
}

// ── REAL-TIME LISTENER ────────────────────────────────────────────────────────
const q = query(collection(db, COLL), orderBy('submittedAt', 'desc'))

onSnapshot(
  q,
  snap => {
    loadingSkel.style.display = 'none'

    allClaims = snap.docs.map(d => ({
      id:          d.id,
      teamName:    d.data().teamName  || '',
      title:       d.data().title     || '',
      note:        d.data().note      || '',
      submittedAt: d.data().submittedAt,
    }))

    // Update stat cards
    const today     = new Date().toDateString()
    const todayCount = allClaims.filter(c =>
      c.submittedAt?.toDate?.()?.toDateString?.() === today
    ).length

    countTotal.textContent = allClaims.length
    countToday.textContent = todayCount

    renderCards(searchInput.value.trim())
  },
  err => {
    loadingSkel.style.display = 'none'
    console.error(err)
    showToast('❌ Firebase error — check config & rules.', 'error')
  }
)

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
    const isDup    = curDups.has(c.id)
    const globalIdx = String(allClaims.indexOf(c) + 1).padStart(3, '0')
    const noteHtml  = c.note
      ? `<div class="card-note">${esc(c.note)}</div>`
      : ''

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
          <button class="remove-btn" onclick="window.__removeEntry('${c.id}',${JSON.stringify(c.title)})">Remove</button>
        </div>
      </div>`
  }).join('')
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
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

function showToast(msg, type = '') {
  toast.textContent = msg
  toast.className   = 'show' + (type ? ' ' + type : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.className = '' }, 3400)
}

// Close modals by clicking the overlay backdrop
;[removeModal, dupModal].forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) {
      m.classList.remove('open')
      pendingRemoveId   = null
      pendingSubmitData = null
    }
  })
})
