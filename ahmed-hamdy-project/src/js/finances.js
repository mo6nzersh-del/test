import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showError, formatDate, formatCurrency, isInDateRange, printReport
} from './utils.js';
import { db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, Timestamp, serverTimestamp } from './firebase.js';

await requireAuth();
buildSidebar('finances');

let finances = [];
let filtered = [];

async function loadFinances() {
  const tbody = document.getElementById('finance-tbody');
  try {
    const snap = await getDocs(query(collection(db,'finances'), orderBy('date','desc')));
    finances = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    filtered = finances;
    renderFinances(finances);
    updateTotals(finances);
  } catch(err) { showError(tbody, err, 7); }
}

function updateTotals(list) {
  const income  = list.filter(f => f.type==='income').reduce((s,f) => s+(f.amount||0), 0);
  const expense = list.filter(f => f.type==='expense').reduce((s,f) => s+(f.amount||0), 0);
  document.getElementById('total-income').textContent  = formatCurrency(income);
  document.getElementById('total-expense').textContent = formatCurrency(expense);
  const netEl = document.getElementById('net-balance');
  netEl.textContent  = formatCurrency(income - expense);
  netEl.style.color  = income - expense >= 0 ? 'var(--success)' : 'var(--danger)';
}

function renderFinances(list) {
  filtered = list;
  const tbody = document.getElementById('finance-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">💳</span><p>لا توجد معاملات مالية</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map((f, i) => `
    <tr>
      <td>${i+1}</td>
      <td><span class="badge ${f.type==='income'?'badge-green':'badge-red'}">${f.type==='income'?'📥 وارد':'📤 صادر'}</span></td>
      <td><strong class="${f.type==='income'?'text-success':'text-danger'}">${formatCurrency(f.amount)}</strong></td>
      <td>${escape(f.clientName)||'—'}</td>
      <td>${escape(f.description)||'—'}</td>
      <td>${formatDate(f.date)}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn-icon" onclick="editFinance('${f.id}')" title="تعديل">✏️</button>
          <button class="btn-icon danger" onclick="deleteFinance('${f.id}')" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function applyFilters() {
  const search  = document.getElementById('finance-search').value.toLowerCase();
  const typeF   = document.getElementById('finance-type-filter').value;
  const fromD   = document.getElementById('fin-from').value;
  const toD     = document.getElementById('fin-to').value;
  const list = finances.filter(f => {
    if (typeF && f.type !== typeF) return false;
    if (!isInDateRange(f.date, fromD, toD)) return false;
    if (search && !`${f.clientName||''} ${f.description||''}`.toLowerCase().includes(search)) return false;
    return true;
  });
  renderFinances(list);
  updateTotals(list);
}

document.getElementById('fin-filter-btn').addEventListener('click', applyFilters);
document.getElementById('finance-search').addEventListener('input', applyFilters);
document.getElementById('finance-type-filter').addEventListener('change', applyFilters);

function financeFormHTML(f = null) {
  const today = new Date().toISOString().split('T')[0];
  const dateVal = f?.date?.toDate ? f.date.toDate().toISOString().split('T')[0] : today;
  return `
    <div class="form-row">
      <div class="form-group"><label>النوع *</label>
        <select name="type" class="form-control">
          <option value="income" ${f?.type==='income'?'selected':''}>📥 وارد</option>
          <option value="expense" ${f?.type==='expense'?'selected':''}>📤 صادر</option>
        </select>
      </div>
      <div class="form-group"><label>المبلغ *</label>
        <input type="number" name="amount" class="form-control" min="0" step="0.01" value="${f?.amount||''}" required placeholder="0.00">
      </div>
    </div>
    <div class="form-group"><label>اسم العميل / الجهة</label>
      <input name="clientName" class="form-control" value="${escape(f?.clientName||'')}" placeholder="اسم العميل أو الجهة">
    </div>
    <div class="form-group"><label>الوصف</label>
      <textarea name="description" class="form-control" placeholder="وصف المعاملة">${escape(f?.description||'')}</textarea>
    </div>
    <div class="form-group"><label>التاريخ</label>
      <input type="date" name="date" class="form-control" value="${dateVal}">
    </div>`;
}

document.getElementById('add-finance-btn').addEventListener('click', () => {
  showModal('إضافة معاملة مالية', financeFormHTML(), async (body) => {
    const amt = parseFloat(body.querySelector('[name=amount]').value);
    if (isNaN(amt) || amt <= 0) { showToast('المبلغ مطلوب','warning'); return; }
    const dv = body.querySelector('[name=date]').value;
    try {
      await addDoc(collection(db,'finances'), {
        type: body.querySelector('[name=type]').value, amount: amt,
        clientName: body.querySelector('[name=clientName]').value.trim(),
        description: body.querySelector('[name=description]').value.trim(),
        date: Timestamp.fromDate(new Date(dv+'T00:00:00')),
        createdAt: serverTimestamp()
      });
      closeModal(); showToast('تم الإضافة بنجاح','success'); loadFinances();
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.editFinance = (id) => {
  const f = finances.find(x => x.id === id);
  if (!f) return;
  showModal('تعديل المعاملة', financeFormHTML(f), async (body) => {
    const amt = parseFloat(body.querySelector('[name=amount]').value);
    if (isNaN(amt) || amt <= 0) { showToast('المبلغ مطلوب','warning'); return; }
    const dv = body.querySelector('[name=date]').value;
    try {
      await updateDoc(doc(db,'finances',id), {
        type: body.querySelector('[name=type]').value, amount: amt,
        clientName: body.querySelector('[name=clientName]').value.trim(),
        description: body.querySelector('[name=description]').value.trim(),
        date: Timestamp.fromDate(new Date(dv+'T00:00:00')),
      });
      closeModal(); showToast('تم التعديل','success'); loadFinances();
    } catch { showToast('خطأ في التعديل','error'); }
  }, 'حفظ التعديل');
};

window.deleteFinance = (id) => {
  showConfirm('حذف هذه المعاملة؟', async () => {
    await deleteDoc(doc(db,'finances',id));
    showToast('تم الحذف','success'); loadFinances();
  });
};

document.getElementById('fin-print-btn').addEventListener('click', () => {
  const list   = filtered.length ? filtered : finances;
  const income  = list.filter(f => f.type==='income').reduce((s,f) => s+(f.amount||0), 0);
  const expense = list.filter(f => f.type==='expense').reduce((s,f) => s+(f.amount||0), 0);
  const html = `
    <table>
      <thead><tr><th>#</th><th>النوع</th><th>المبلغ</th><th>العميل/الجهة</th><th>الوصف</th><th>التاريخ</th></tr></thead>
      <tbody>${list.map((f,i) => `<tr><td>${i+1}</td><td>${f.type==='income'?'وارد':'صادر'}</td><td>${formatCurrency(f.amount)}</td><td>${escape(f.clientName)||'—'}</td><td>${escape(f.description)||'—'}</td><td>${formatDate(f.date)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="5"><strong>إجمالي الوارد</strong></td><td>${formatCurrency(income)}</td></tr>
        <tr><td colspan="5"><strong>إجمالي الصادر</strong></td><td>${formatCurrency(expense)}</td></tr>
        <tr><td colspan="5"><strong>الرصيد الصافي</strong></td><td>${formatCurrency(income-expense)}</td></tr>
      </tfoot>
    </table>`;
  printReport(html, 'كشف المعاملات المالية');
});

loadFinances();
