import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showError, formatDate, formatCurrency, isInDateRange, printReport, initTabs
} from './utils.js';
import {
  db, collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, where, Timestamp, serverTimestamp
} from './firebase.js';

await requireAuth();
buildSidebar('merchants');

let merchants = [];
let txList    = [];
let activeMerchantId = '';

initTabs((tabId) => {
  if (tabId === 'merchant-transactions-tab') populateMerchantFilter();
});

// ── Merchants list ────────────────────────────────────────────────────────────
async function loadMerchants() {
  const tbody = document.getElementById('merchants-tbody');
  try {
    const snap = await getDocs(query(collection(db,'merchants'), orderBy('createdAt','desc')));
    merchants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMerchants(merchants);
  } catch(err) { showError(tbody, err, 7); }
}

async function getMerchantBalance(id) {
  try {
    const snap = await getDocs(query(collection(db,'merchantTransactions'), where('merchantId','==',id)));
    return snap.docs.reduce((s,d) => {
      const r = d.data();
      return r.type === 'credit' ? s + (r.amount||0) : s - (r.amount||0);
    }, 0);
  } catch { return 0; }
}

function renderMerchants(list) {
  const tbody = document.getElementById('merchants-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">🤝</span><p>لا يوجد تجار</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map((m, i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${escape(m.name)}</strong></td>
      <td>${escape(m.address)||'—'}</td>
      <td>${escape(m.phone)||'—'}</td>
      <td>${escape(m.email)||'—'}</td>
      <td id="balance-${m.id}"><span class="text-muted">...</span></td>
      <td>
        <div class="flex gap-2">
          <button class="btn-icon success" onclick="viewMerchant('${m.id}')" title="عرض">👁️</button>
          <button class="btn-icon" onclick="editMerchant('${m.id}')" title="تعديل">✏️</button>
          <button class="btn-icon danger" onclick="deleteMerchant('${m.id}')" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
  // Load balances asynchronously
  list.forEach(m => {
    getMerchantBalance(m.id).then(bal => {
      const el = document.getElementById(`balance-${m.id}`);
      if (el) el.innerHTML = `<span class="${bal>=0?'text-success':'text-danger'} fw-bold">${formatCurrency(bal)}</span>`;
    });
  });
}

document.getElementById('merchant-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderMerchants(merchants.filter(m => `${m.name} ${m.phone} ${m.email}`.toLowerCase().includes(q)));
});

const merchantFormHTML = (m = null) => `
  <div class="form-row">
    <div class="form-group"><label>الاسم *</label><input name="name" class="form-control" value="${escape(m?.name||'')}" required placeholder="اسم التاجر"></div>
    <div class="form-group"><label>الهاتف</label><input name="phone" class="form-control" value="${escape(m?.phone||'')}" type="tel"></div>
  </div>
  <div class="form-group"><label>العنوان</label><input name="address" class="form-control" value="${escape(m?.address||'')}"></div>
  <div class="form-group"><label>البريد الإلكتروني</label><input name="email" class="form-control" type="email" value="${escape(m?.email||'')}"></div>
  <div class="form-group"><label>ملاحظات</label><textarea name="notes" class="form-control">${escape(m?.notes||'')}</textarea></div>
`;

document.getElementById('add-merchant-btn').addEventListener('click', () => {
  showModal('إضافة تاجر جديد', merchantFormHTML(), async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('اسم التاجر مطلوب','warning'); return; }
    try {
      await addDoc(collection(db,'merchants'), {
        name, phone: body.querySelector('[name=phone]').value.trim(),
        address: body.querySelector('[name=address]').value.trim(),
        email: body.querySelector('[name=email]').value.trim(),
        notes: body.querySelector('[name=notes]').value.trim(),
        createdAt: serverTimestamp()
      });
      closeModal(); showToast('تم إضافة التاجر بنجاح','success'); loadMerchants();
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.editMerchant = (id) => {
  const m = merchants.find(x => x.id === id);
  if (!m) return;
  showModal('تعديل بيانات التاجر', merchantFormHTML(m), async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    try {
      const { updateDoc } = await import('./firebase.js');
      await updateDoc(doc(db,'merchants',id), {
        name, phone: body.querySelector('[name=phone]').value.trim(),
        address: body.querySelector('[name=address]').value.trim(),
        email: body.querySelector('[name=email]').value.trim(),
        notes: body.querySelector('[name=notes]').value.trim(),
      });
      closeModal(); showToast('تم التعديل بنجاح','success'); loadMerchants();
    } catch { showToast('خطأ في التعديل','error'); }
  }, 'حفظ التعديل');
};

window.deleteMerchant = (id) => {
  showConfirm('هل تريد حذف هذا التاجر؟', async () => {
    try {
      await deleteDoc(doc(db,'merchants',id));
      showToast('تم الحذف','success'); loadMerchants();
    } catch { showToast('خطأ في الحذف','error'); }
  });
};

window.viewMerchant = (id) => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="merchant-transactions-tab"]').classList.add('active');
  document.getElementById('merchant-transactions-tab').classList.add('active');
  populateMerchantFilter();
  setTimeout(() => {
    document.getElementById('merchant-filter').value = id;
    loadMerchantTx(id);
  }, 100);
};

// ── Transactions tab ──────────────────────────────────────────────────────────
function populateMerchantFilter() {
  const sel = document.getElementById('merchant-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">اختر التاجر</option>' +
    merchants.map(m => `<option value="${m.id}" ${m.id===cur?'selected':''}>${escape(m.name)}</option>`).join('');
}

async function loadMerchantTx(merchantId) {
  activeMerchantId = merchantId;
  const tbody = document.getElementById('merchant-tx-tbody');
  if (!merchantId) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📊</span><p>اختر تاجراً</p></div></td></tr>';
    document.getElementById('merchant-summary').innerHTML = '';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>';
  try {
    const snap = await getDocs(query(collection(db,'merchantTransactions'), where('merchantId','==',merchantId), orderBy('date','desc')));
    txList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTx(txList, merchantId);
  } catch(err) { showError(tbody, err, 7); }
}

function renderTx(list, merchantId) {
  const tbody   = document.getElementById('merchant-tx-tbody');
  const summary = document.getElementById('merchant-summary');
  const credit  = list.filter(t => t.type==='credit').reduce((s,t) => s+(t.amount||0), 0);
  const debit   = list.filter(t => t.type==='debit').reduce((s,t) => s+(t.amount||0), 0);
  const bal     = credit - debit;
  summary.innerHTML = `
    <div class="stat-card green"><div class="stat-icon">💚</div><div class="stat-label">إجمالي دائن</div><div class="stat-value">${formatCurrency(credit)}</div></div>
    <div class="stat-card red"><div class="stat-icon">❤️</div><div class="stat-label">إجمالي مدين</div><div class="stat-value">${formatCurrency(debit)}</div></div>
    <div class="stat-card blue"><div class="stat-icon">💙</div><div class="stat-label">الرصيد</div><div class="stat-value">${formatCurrency(bal)}</div></div>
  `;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span><p>لا توجد معاملات</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map((t, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${escape(merchants.find(m => m.id===t.merchantId)?.name)||'—'}</td>
      <td><span class="badge ${t.type==='credit'?'badge-green':'badge-red'}">${t.type==='credit'?'دائن':'مدين'}</span></td>
      <td><strong>${formatCurrency(t.amount)}</strong></td>
      <td>${escape(t.description)||'—'}</td>
      <td>${formatDate(t.date)}</td>
      <td>
        <button class="btn-icon danger" onclick="deleteMerchantTx('${t.id}','${merchantId}')" title="حذف">🗑️</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('merchant-filter').addEventListener('change', (e) => loadMerchantTx(e.target.value));

document.getElementById('tx-filter-btn').addEventListener('click', () => {
  const from = document.getElementById('tx-from').value;
  const to   = document.getElementById('tx-to').value;
  renderTx(txList.filter(t => isInDateRange(t.date, from, to)), activeMerchantId);
});

document.getElementById('add-merchant-tx-btn').addEventListener('click', () => {
  const cur = document.getElementById('merchant-filter').value;
  showModal('إضافة معاملة', `
    <div class="form-group"><label>التاجر *</label>
      <select name="merchantId" class="form-control" required>
        <option value="">اختر التاجر</option>
        ${merchants.map(m => `<option value="${m.id}" ${m.id===cur?'selected':''}>${escape(m.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>النوع</label>
        <select name="type" class="form-control">
          <option value="credit">دائن (له)</option>
          <option value="debit">مدين (عليه)</option>
        </select>
      </div>
      <div class="form-group"><label>المبلغ *</label><input type="number" name="amount" class="form-control" required min="0" step="0.01" placeholder="0.00"></div>
    </div>
    <div class="form-group"><label>الوصف</label><input name="description" class="form-control" placeholder="وصف المعاملة"></div>
    <div class="form-group"><label>التاريخ</label><input type="date" name="date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
  `, async (body) => {
    const mid = body.querySelector('[name=merchantId]').value;
    const amt = parseFloat(body.querySelector('[name=amount]').value);
    if (!mid || isNaN(amt) || amt <= 0) { showToast('البيانات غير مكتملة','warning'); return; }
    try {
      const dv = body.querySelector('[name=date]').value;
      await addDoc(collection(db,'merchantTransactions'), {
        merchantId: mid, type: body.querySelector('[name=type]').value, amount: amt,
        description: body.querySelector('[name=description]').value.trim(),
        date: Timestamp.fromDate(new Date(dv + 'T00:00:00')),
        createdAt: serverTimestamp()
      });
      closeModal(); showToast('تم إضافة المعاملة','success'); loadMerchantTx(mid);
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.deleteMerchantTx = (id, merchantId) => {
  showConfirm('حذف هذه المعاملة؟', async () => {
    await deleteDoc(doc(db,'merchantTransactions',id));
    showToast('تم الحذف','success'); loadMerchantTx(merchantId);
  });
};

document.getElementById('print-statement-btn').addEventListener('click', () => {
  const mid = document.getElementById('merchant-filter').value;
  if (!mid) { showToast('اختر تاجراً أولاً','warning'); return; }
  const m = merchants.find(x => x.id === mid);
  const credit = txList.filter(t => t.type==='credit').reduce((s,t) => s+(t.amount||0), 0);
  const debit  = txList.filter(t => t.type==='debit').reduce((s,t) => s+(t.amount||0), 0);
  const html = `
    <div><strong>التاجر:</strong> ${escape(m?.name||'')}</div>
    <div><strong>الهاتف:</strong> ${escape(m?.phone||'—')}</div>
    <div><strong>العنوان:</strong> ${escape(m?.address||'—')}</div>
    <table>
      <thead><tr><th>#</th><th>النوع</th><th>المبلغ</th><th>الوصف</th><th>التاريخ</th></tr></thead>
      <tbody>${txList.map((t,i) => `<tr><td>${i+1}</td><td>${t.type==='credit'?'دائن':'مدين'}</td><td>${formatCurrency(t.amount)}</td><td>${escape(t.description)||'—'}</td><td>${formatDate(t.date)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="4"><strong>إجمالي دائن</strong></td><td>${formatCurrency(credit)}</td></tr>
        <tr><td colspan="4"><strong>إجمالي مدين</strong></td><td>${formatCurrency(debit)}</td></tr>
        <tr><td colspan="4"><strong>الرصيد النهائي</strong></td><td>${formatCurrency(credit-debit)}</td></tr>
      </tfoot>
    </table>`;
  printReport(html, `كشف حساب — ${m?.name||''}`);
});

loadMerchants();
