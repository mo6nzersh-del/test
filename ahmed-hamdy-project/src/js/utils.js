import { auth, db, signOut, collection, doc, getDoc, setDoc, runTransaction, serverTimestamp } from './firebase.js';

const BASE = './';

const NAV = [
  { id: 'dashboard',  label: 'لوحة التحكم',      icon: '📊', href: 'dashboard.html' },
  { id: 'warehouses', label: 'المخازن والحركات',  icon: '🏭', href: 'warehouses.html' },
  { id: 'products',   label: 'المنتجات والمخزون', icon: '📦', href: 'products.html' },
  { id: 'merchants',  label: 'التجار',             icon: '🤝', href: 'merchants.html' },
  { id: 'employees',  label: 'الموظفين',           icon: '👥', href: 'employees.html' },
  { id: 'finances',   label: 'المالية',            icon: '💰', href: 'finances.html' },
  { id: 'salaries',   label: 'الرواتب والسلف',     icon: '💵', href: 'salaries.html' },
];

export function buildSidebar(activeId) {
  const aside = document.createElement('aside');
  aside.className = 'sidebar';
  aside.innerHTML = `
    <div class="sidebar-brand">
      <img src="/logo.png" class="sidebar-logo-img" alt="Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="sidebar-logo-fallback" style="display:none">AH</div>
      <div class="sidebar-brand-text">
        <div class="sidebar-title">أحمد وحمدي</div>
        <div class="sidebar-subtitle">نظام إدارة المصنع</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${NAV.map(n => `
        <a href="${BASE}${n.href}" class="nav-item ${activeId === n.id ? 'active' : ''}">
          <span class="nav-icon">${n.icon}</span>
          <span>${n.label}</span>
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <span class="user-avatar">👤</span>
        <span id="user-email" class="user-email">...</span>
      </div>
      <button id="logout-btn" class="btn-logout">
        <span>تسجيل الخروج</span><span>🚪</span>
      </button>
    </div>
  `;
  document.body.prepend(aside);

  const emailEl = document.getElementById('user-email');
  if (auth.currentUser && emailEl) emailEl.textContent = auth.currentUser.email || '';

  const toggle = document.createElement('button');
  toggle.className = 'sidebar-toggle';
  toggle.innerHTML = '☰';
  toggle.addEventListener('click', () => {
    aside.classList.toggle('open');
  });
  document.body.appendChild(toggle);

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', () => aside.classList.remove('open'));
  document.body.appendChild(overlay);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (confirm('هل تريد تسجيل الخروج؟')) {
      await signOut(auth);
      window.location.href = BASE + 'login.html';
    }
  });
}

// ── XSS escape ───────────────────────────────────────────────────────────────
export function escape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _tc = null;
function getTC() {
  if (!_tc) { _tc = document.createElement('div'); _tc.className = 'toast-container'; document.body.appendChild(_tc); }
  return _tc;
}
export function showToast(msg, type = 'success', duration = 3500) {
  const c = getTC();
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  // Use textContent for message to prevent XSS
  const iconEl = document.createElement('span'); iconEl.textContent = icons[type]||'📢';
  const msgEl  = document.createElement('span'); msgEl.textContent = msg;
  t.append(iconEl, msgEl);
  c.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
let _modal = null;
export function closeModal() {
  if (_modal) {
    _modal.classList.remove('open');
    setTimeout(() => { _modal && (_modal.remove(), _modal = null); }, 200);
  }
}
export function showModal(title, bodyHTML, onSubmit, submitLabel = 'حفظ', size = '') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${size}">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="modal-submit-btn">${submitLabel}</button>
        <button class="btn btn-ghost" id="modal-cancel-btn">إلغاء</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _modal = overlay;
  setTimeout(() => overlay.classList.add('open'), 10);
  overlay.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  overlay.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector('#modal-submit-btn').addEventListener('click', () => {
    onSubmit && onSubmit(overlay.querySelector('.modal-body'));
  });
}
export function showConfirm(msg, onConfirm, isDanger = true) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header"><h3 class="modal-title">تأكيد العملية</h3></div>
      <div class="modal-body"><p style="text-align:center;font-size:1rem;padding:1rem 0;color:var(--text)">${msg}</p></div>
      <div class="modal-footer">
        <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="conf-ok">تأكيد</button>
        <button class="btn btn-ghost" id="conf-cancel">إلغاء</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('open'), 10);
  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
  overlay.querySelector('#conf-cancel').addEventListener('click', close);
  overlay.querySelector('#conf-ok').addEventListener('click', () => { close(); onConfirm(); });
}

// ── State helpers ─────────────────────────────────────────────────────────────
export function showLoading(el, msg = 'جاري التحميل...') {
  if (typeof el === 'string') el = document.querySelector(el);
  if (el) el.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${msg}</p></div>`;
}
export function showEmpty(el, msg = 'لا توجد بيانات', icon = '📭') {
  if (typeof el === 'string') el = document.querySelector(el);
  if (el) el.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
}
export function showError(el, err, colspan = null) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (!el) return;
  const msg = err?.code === 'permission-denied'
    ? '🔒 لا توجد صلاحية — تحقق من Firebase Rules'
    : '⚠️ خطأ في تحميل البيانات';
  const inner = `<div class="empty-state"><p style="color:var(--danger)">${msg}</p></div>`;
  el.innerHTML = colspan ? `<tr><td colspan="${colspan}">${inner}</td></tr>` : inner;
}
export function showLoadingRow(tbody, colspan, msg = 'جاري التحميل...') {
  if (typeof tbody === 'string') tbody = document.querySelector(tbody);
  if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="loading-state"><div class="spinner"></div><p>${msg}</p></div></td></tr>`;
}

// ── Formatters ────────────────────────────────────────────────────────────────
export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}
export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d);
}
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(amount);
}
export function isInDateRange(ts, from, to) {
  if (!ts) return !from && !to;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to   && d > new Date(to   + 'T23:59:59')) return false;
  return true;
}
// Local-timezone YYYY-MM-DD (avoids UTC off-by-one in UTC+ zones like Egypt)
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function getToday()     { return localDateStr(); }
export function getWeekStart() { const d = new Date(); d.setDate(d.getDate() - 7); return localDateStr(d); }
export function getMonthStart(){ const d = new Date(); d.setDate(1); return localDateStr(d); }

// ── Print ─────────────────────────────────────────────────────────────────────
export function printReport(html, title = 'تقرير') {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:Cairo,sans-serif;direction:rtl;padding:24px;color:#1e293b;font-size:14px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #cbd5e1;padding:8px 12px;text-align:right}
      th{background:#f1f5f9;font-weight:700;font-size:.8rem}
      h2{color:#1e40af;margin-bottom:4px} .header{display:flex;justify-content:space-between;margin-bottom:16px;align-items:center}
      tfoot td{font-weight:700;background:#f8fafc} @media print{button{display:none}}
    </style></head><body>
    <div class="header"><h2>${title}</h2><div>${new Date().toLocaleDateString('ar-EG',{dateStyle:'full'})}</div></div>
    ${html}
    <script>setTimeout(()=>window.print(),400)<\/script>
    </body></html>`);
  w.document.close();
}

// ── Auto serial ───────────────────────────────────────────────────────────────
export async function generateSerial(name) {
  const counterRef = doc(db, 'counters', name);
  let serial = 1;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    serial = snap.exists() ? (snap.data().count || 0) + 1 : 1;
    tx.set(counterRef, { count: serial });
  });
  return serial;
}

// ── Warehouse inventory helpers ───────────────────────────────────────────────
/**
 * Atomically adjust inventory for one product in one warehouse (inside a transaction).
 * delta = +N for add, -N for subtract (throws if result < 0)
 */
export async function adjustInventoryTx(tx, warehouseId, productId, productName, delta) {
  const invRef = doc(db, 'warehouseInventory', `${warehouseId}_${productId}`);
  const snap   = await tx.get(invRef);
  const current = snap.exists() ? (snap.data().quantity || 0) : 0;
  const next    = current + delta;
  if (next < 0) throw new Error(`الرصيد غير كافٍ للمنتج: ${productName} (متاح: ${current}، مطلوب: ${Math.abs(delta)})`);
  tx.set(invRef, { warehouseId, productId, productName, quantity: next, updatedAt: serverTimestamp() }, { merge: true });
  return next;
}

/**
 * Get full inventory snapshot for a warehouse.
 * Returns [{productId, productName, quantity}]
 */
export async function getWarehouseInventory(warehouseId) {
  const { getDocs, query, collection, where } = await import('./firebase.js');
  const snap = await getDocs(query(collection(db, 'warehouseInventory'), where('warehouseId', '==', warehouseId)));
  return snap.docs.map(d => d.data()).filter(d => d.quantity > 0);
}

// ── Image resize (base64) ─────────────────────────────────────────────────────
export function resizeImage(file, maxSize = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else       { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
export function initTabs(onSwitch, containerSel = null) {
  const container = containerSel ? document.querySelector(containerSel) : document;
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById(btn.dataset.tab);
      if (tab) tab.classList.add('active');
      onSwitch && onSwitch(btn.dataset.tab);
    });
  });
}
