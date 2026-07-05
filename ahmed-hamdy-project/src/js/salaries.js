import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showError, showLoadingRow, formatDate, formatCurrency, isInDateRange, initTabs, printReport
} from './utils.js';
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, where, Timestamp, serverTimestamp
} from './firebase.js';

await requireAuth();
buildSidebar('salaries');

let employees = [];
let salaries  = [];
let advances  = [];

const ADV_STATUS = {
  pending:    { label:'معلقة',          icon:'⏳', cls:'badge-orange' },
  deducted:   { label:'مخصومة',         icon:'✅', cls:'badge-green'  },
  paid_early: { label:'مدفوعة مسبقاً',  icon:'💵', cls:'badge-blue'   },
  rejected:   { label:'مرفوضة',         icon:'❌', cls:'badge-red'    },
};

initTabs((tab) => { if (tab === 'advances-tab') loadAdvances(); });

// ── Load employees ────────────────────────────────────────────────────────────
async function loadEmployees() {
  try {
    const snap = await getDocs(query(collection(db,'employees'), orderBy('name','asc')));
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateSelects();
  } catch(err) { console.error(err); }
}

function populateSelects() {
  const activeEmps = employees.filter(e=>(e.status||'active')==='active');
  const allOpts    = employees.map(e=>`<option value="${e.id}">${escape(e.name)}</option>`).join('');
  const actOpts    = activeEmps.map(e=>`<option value="${e.id}">${escape(e.name)}</option>`).join('');

  document.getElementById('sal-employee').innerHTML    = '<option value="">اختر الموظف</option>' + actOpts;
  document.getElementById('sal-filter-emp').innerHTML  = '<option value="">كل الموظفين</option>' + allOpts;
  document.getElementById('adv-filter-emp').innerHTML  = '<option value="">كل الموظفين</option>' + allOpts;

  const now = new Date();
  const mv  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if (!document.getElementById('sal-month').value)        document.getElementById('sal-month').value = mv;
  if (!document.getElementById('sal-filter-month').value) document.getElementById('sal-filter-month').value = mv;
}

// ── Salary calculator ─────────────────────────────────────────────────────────
document.getElementById('calc-salary-btn').addEventListener('click', async () => {
  const empId    = document.getElementById('sal-employee').value;
  const monthVal = document.getElementById('sal-month').value;
  if (!empId || !monthVal) { showToast('اختر الموظف والشهر','warning'); return; }
  const emp = employees.find(e=>e.id===empId); if (!emp) return;
  const [year, month] = monthVal.split('-').map(Number);
  const resultEl = document.getElementById('salary-calc-result');
  resultEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const [attSnap, advSnap] = await Promise.all([
      getDocs(query(collection(db,'attendance'), where('employeeId','==',empId))),
      getDocs(query(collection(db,'advances'),   where('employeeId','==',empId))),
    ]);

    const att = attSnap.docs.map(d=>d.data()).filter(a => {
      const dt = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      return dt.getFullYear()===year && dt.getMonth()+1===month;
    });

    const present  = att.filter(a=>a.status==='present').length;
    const absent   = att.filter(a=>a.status==='absent').length;
    const late     = att.filter(a=>a.status==='late').length;
    const vacation = att.filter(a=>a.status==='vacation').length;

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyRate   = (emp.salary||0) / daysInMonth;
    const absentDeduct= absent * dailyRate;
    const lateDeduct  = late   * (dailyRate * 0.25);

    const pendingAdv  = advSnap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.status==='pending'||!a.status);
    const advTotal    = pendingAdv.reduce((s,a)=>s+(a.amount||0),0);
    const netSalary   = Math.max(0, (emp.salary||0) - absentDeduct - lateDeduct - advTotal);

    resultEl.innerHTML = `
      <div style="border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-top:16px">
        <div style="background:var(--primary);color:#fff;padding:12px 18px;font-weight:700">
          تفاصيل راتب ${escape(emp.name)} — ${monthVal}
        </div>
        <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <h4 style="margin-bottom:8px;color:var(--text-muted);font-size:.8rem;text-transform:uppercase">الأساسيات</h4>
            <div class="info-row"><span class="info-label">الراتب الأساسي</span><span class="info-value text-primary">${formatCurrency(emp.salary||0)}</span></div>
            <div class="info-row"><span class="info-label">أيام الشهر</span><span class="info-value">${daysInMonth} يوم</span></div>
            <div class="info-row"><span class="info-label">قيمة اليوم</span><span class="info-value">${formatCurrency(dailyRate)}</span></div>
          </div>
          <div>
            <h4 style="margin-bottom:8px;color:var(--text-muted);font-size:.8rem;text-transform:uppercase">الحضور</h4>
            <div class="info-row"><span class="info-label">✅ حاضر</span><span class="info-value">${present} يوم</span></div>
            <div class="info-row"><span class="info-label">❌ غائب</span><span class="info-value text-danger">${absent} يوم</span></div>
            <div class="info-row"><span class="info-label">⏰ متأخر</span><span class="info-value text-warning">${late} مرة</span></div>
            <div class="info-row"><span class="info-label">🏖️ إجازة</span><span class="info-value">${vacation} يوم</span></div>
          </div>
        </div>
        <div style="padding:0 16px 16px;border-top:1px solid var(--border);padding-top:12px">
          <h4 style="margin-bottom:8px;color:var(--danger);font-size:.8rem;text-transform:uppercase">الخصومات</h4>
          <div class="info-row"><span class="info-label">خصم الغياب</span><span class="info-value text-danger">- ${formatCurrency(absentDeduct)}</span></div>
          <div class="info-row"><span class="info-label">خصم التأخير</span><span class="info-value text-danger">- ${formatCurrency(lateDeduct)}</span></div>
          <div class="info-row"><span class="info-label">سلف معلقة</span><span class="info-value text-danger">- ${formatCurrency(advTotal)}</span></div>
        </div>
        <div style="margin:0 16px 16px;background:linear-gradient(135deg,#1e40af,#1d4ed8);border-radius:8px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
          <span style="color:#fff;font-weight:700">💵 صافي الراتب المستحق</span>
          <strong style="color:#fff;font-size:1.4rem">${formatCurrency(netSalary)}</strong>
        </div>
        ${pendingAdv.length ? `<div style="margin:0 16px 16px;background:var(--warning-light);border-radius:8px;padding:10px 14px;font-size:.82rem;color:var(--warning)">
          ⚠️ يوجد ${pendingAdv.length} سلفة معلقة بإجمالي ${formatCurrency(advTotal)} ستُخصم من الراتب.
        </div>` : ''}
        <div style="padding:0 16px 16px">
          <button class="btn btn-success" id="pay-salary-btn" style="width:100%;justify-content:center">✅ تأكيد صرف الراتب</button>
        </div>
      </div>
    `;

    document.getElementById('pay-salary-btn').addEventListener('click', async () => {
      const btn = document.getElementById('pay-salary-btn');
      btn.disabled=true; btn.textContent='جاري الصرف...';
      try {
        await addDoc(collection(db,'salaryPayments'), {
          employeeId:empId, employeeName:emp.name, month:monthVal,
          baseSalary:emp.salary||0, absentDeduct, lateDeduct, advancesDeducted:advTotal,
          netSalary, presentDays:present, absentDays:absent, lateDays:late, vacationDays:vacation,
          paidAt:serverTimestamp(), createdAt:serverTimestamp()
        });
        for (const adv of pendingAdv) {
          await updateDoc(doc(db,'advances',adv.id), { status:'deducted', deductedMonth:monthVal });
        }
        showToast(`تم صرف راتب ${emp.name}: ${formatCurrency(netSalary)}`,'success',5000);
        resultEl.innerHTML = '';
        loadSalaries();
      } catch(err) { showToast(err.message||'خطأ في الصرف','error'); btn.disabled=false; btn.textContent='✅ تأكيد صرف الراتب'; }
    });

  } catch(err) { resultEl.innerHTML = `<div class="empty-state"><p class="text-danger">خطأ: ${escape(err.message||'')}</p></div>`; }
});

// ── Salaries list ─────────────────────────────────────────────────────────────
async function loadSalaries() {
  showLoadingRow('#salaries-tbody', 8);
  try {
    const snap = await getDocs(query(collection(db,'salaryPayments'), orderBy('paidAt','desc')));
    salaries = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderSalaries(salaries);
  } catch(err) { showError('#salaries-tbody', err, 8); }
}

function renderSalaries(list) {
  const tbody = document.getElementById('salaries-tbody');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">💵</div><p>لا توجد رواتب مصروفة</p></div></td></tr>'; return; }
  tbody.innerHTML = list.map((s,i) => `<tr>
    <td>${i+1}</td>
    <td><strong>${escape(s.employeeName||'—')}</strong></td>
    <td><span class="badge badge-blue">${escape(s.month||'—')}</span></td>
    <td>${formatCurrency(s.baseSalary)}</td>
    <td class="text-danger">${formatCurrency((s.absentDeduct||0)+(s.lateDeduct||0)+(s.advancesDeducted||0))}</td>
    <td><strong class="text-success">${formatCurrency(s.netSalary)}</strong></td>
    <td style="font-size:.8rem;color:var(--text-muted)">${formatDate(s.paidAt)}</td>
    <td><button class="btn-icon danger" onclick="deleteSalary('${s.id}')">🗑️</button></td>
  </tr>`).join('');
}

['sal-filter-emp','sal-filter-month'].forEach(id => document.getElementById(id).addEventListener('change', applyPayrollFilter));
document.getElementById('sal-filter-btn').addEventListener('click', applyPayrollFilter);
function applyPayrollFilter() {
  const emp   = document.getElementById('sal-filter-emp').value;
  const month = document.getElementById('sal-filter-month').value;
  renderSalaries(salaries.filter(s => (!emp||s.employeeId===emp) && (!month||s.month===month)));
}

window.deleteSalary = (id) => {
  showConfirm('حذف سجل الراتب هذا؟', async () => {
    await deleteDoc(doc(db,'salaryPayments',id));
    salaries = salaries.filter(s=>s.id!==id);
    showToast('تم الحذف','success'); renderSalaries(salaries);
  });
};

document.getElementById('print-payroll-btn').addEventListener('click', () => {
  const html = `<table>
    <thead><tr><th>#</th><th>الموظف</th><th>الشهر</th><th>الأساسي</th><th>الخصومات</th><th>المدفوع</th></tr></thead>
    <tbody>${salaries.map((s,i)=>`<tr><td>${i+1}</td><td>${escape(s.employeeName)}</td><td>${s.month}</td><td>${formatCurrency(s.baseSalary)}</td><td>${formatCurrency((s.absentDeduct||0)+(s.lateDeduct||0)+(s.advancesDeducted||0))}</td><td>${formatCurrency(s.netSalary)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5"><strong>الإجمالي</strong></td><td><strong>${formatCurrency(salaries.reduce((s,r)=>s+(r.netSalary||0),0))}</strong></td></tr></tfoot>
  </table>`;
  printReport(html, 'كشف الرواتب');
});

// ── Advances ──────────────────────────────────────────────────────────────────
async function loadAdvances() {
  showLoadingRow('#advances-tbody', 7);
  try {
    const snap = await getDocs(query(collection(db,'advances'), orderBy('createdAt','desc')));
    advances = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderAdvances(advances);
  } catch(err) { showError('#advances-tbody', err, 7); }
}

function renderAdvances(list) {
  const tbody = document.getElementById('advances-tbody');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💸</div><p>لا توجد سلف</p></div></td></tr>'; return; }
  tbody.innerHTML = list.map((a,i) => {
    const empName = employees.find(e=>e.id===a.employeeId)?.name || '—';
    const st = ADV_STATUS[a.status||'pending'] || ADV_STATUS.pending;
    return `<tr>
      <td>${i+1}</td>
      <td><strong>${escape(empName)}</strong></td>
      <td><strong>${formatCurrency(a.amount)}</strong></td>
      <td>${escape(a.description||'—')}</td>
      <td style="font-size:.82rem;color:var(--text-muted)">${formatDate(a.date)}</td>
      <td>
        <select class="form-control" style="width:auto;font-size:.8rem;padding:4px 8px"
          onchange="changeAdvStatus('${a.id}', this.value)">
          ${Object.entries(ADV_STATUS).map(([k,v])=>`<option value="${k}" ${(a.status||'pending')===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
      </td>
      <td>
        <button class="btn-icon danger" onclick="deleteAdvance('${a.id}')" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('adv-filter-btn').addEventListener('click', applyAdvFilter);
function applyAdvFilter() {
  const emp    = document.getElementById('adv-filter-emp').value;
  const status = document.getElementById('adv-filter-status').value;
  const from   = document.getElementById('adv-from').value;
  const to     = document.getElementById('adv-to').value;
  renderAdvances(advances.filter(a => {
    if (emp    && a.employeeId !== emp)                return false;
    if (status && (a.status||'pending') !== status)    return false;
    if (!isInDateRange(a.date, from, to))              return false;
    return true;
  }));
}

window.changeAdvStatus = async (id, status) => {
  try {
    await updateDoc(doc(db,'advances',id), { status });
    const adv = advances.find(a=>a.id===id);
    if (adv) adv.status = status;
    showToast('تم تحديث حالة السلفة','success');
  } catch { showToast('خطأ في التحديث','error'); }
};

document.getElementById('add-advance-btn').addEventListener('click', () => {
  const opts = employees.map(e=>`<option value="${e.id}">${escape(e.name)}</option>`).join('');
  showModal('إضافة سلفة جديدة', `
    <div class="form-group">
      <label>الموظف *</label>
      <select name="employeeId" class="form-control" required><option value="">اختر الموظف</option>${opts}</select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>المبلغ *</label><input type="number" name="amount" class="form-control" min="1" step="0.01" placeholder="0.00"></div>
      <div class="form-group"><label>التاريخ</label><input type="date" name="date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <div class="form-group"><label>الوصف / السبب</label><input name="description" class="form-control" placeholder="سبب السلفة..."></div>
    <div class="form-group">
      <label>الحالة</label>
      <select name="status" class="form-control">
        ${Object.entries(ADV_STATUS).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
      </select>
    </div>
  `, async (body) => {
    const empId = body.querySelector('[name=employeeId]').value;
    const amt   = parseFloat(body.querySelector('[name=amount]').value);
    if (!empId || isNaN(amt) || amt<=0) { showToast('البيانات غير مكتملة','warning'); return; }
    const dv = body.querySelector('[name=date]').value;
    try {
      await addDoc(collection(db,'advances'), {
        employeeId: empId, amount: amt,
        description: body.querySelector('[name=description]').value.trim(),
        status: body.querySelector('[name=status]').value,
        date: Timestamp.fromDate(new Date(dv+'T00:00:00')),
        createdAt: serverTimestamp()
      });
      closeModal(); showToast('تمت الإضافة','success'); loadAdvances();
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.deleteAdvance = (id) => {
  showConfirm('حذف هذه السلفة؟', async () => {
    await deleteDoc(doc(db,'advances',id));
    advances = advances.filter(a=>a.id!==id);
    showToast('تم الحذف','success'); renderAdvances(advances);
  });
};

await loadEmployees();
loadSalaries();
