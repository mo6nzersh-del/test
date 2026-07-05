import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showError, formatCurrency, resizeImage, initTabs, localDateStr
} from './utils.js';
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, Timestamp, serverTimestamp
} from './firebase.js';

await requireAuth();
buildSidebar('employees');

let employees = [];
let attData   = {};   // { 'YYYY-MM-DD': { status, docId } }
let attEmpId  = '';
let attYear   = 0;
let attMonth  = 0;
let pickerOpen = null;  // date string of open picker

initTabs((tab) => {
  if (tab === 'att-tab') populateAttSelect();
});

const EMP_STATUS = {
  active:   { label: 'يعمل',   icon: '✅', cls: 'badge-green'  },
  inactive: { label: 'متوقف',  icon: '⏸️', cls: 'badge-orange' },
  fired:    { label: 'مفصول',  icon: '❌', cls: 'badge-red'    },
};

const ATT_STATUS = ['present','absent','late','vacation'];
const ATT_ICON   = { present:'✅', absent:'❌', late:'⏰', vacation:'🏖️' };
const ATT_LABEL  = { present:'حاضر', absent:'غائب', late:'متأخر', vacation:'إجازة' };
const ATT_CLS    = { present:'present', absent:'absent', late:'late', vacation:'vacation' };

// ── Load employees ────────────────────────────────────────────────────────────
async function loadEmployees() {
  const tbody = document.getElementById('employees-tbody');
  try {
    const snap = await getDocs(query(collection(db,'employees'), orderBy('createdAt','desc')));
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEmployees();
  } catch(err) { showError(tbody, err, 7); }
}

function renderEmployees() {
  const tbody    = document.getElementById('employees-tbody');
  const search   = document.getElementById('emp-search').value.toLowerCase();
  const statusF  = document.getElementById('emp-status-filter').value;
  let list = employees;
  if (statusF) list = list.filter(e => (e.status||'active') === statusF);
  if (search)  list = list.filter(e => `${e.name||''} ${e.position||''}`.toLowerCase().includes(search));

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد موظفون</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map((e, i) => {
    const st = EMP_STATUS[e.status||'active'] || EMP_STATUS.active;
    return `<tr>
      <td>${i+1}</td>
      <td>
        <div class="flex items-center gap-2">
          <div class="avatar">
            ${e.photoURL ? `<img src="${e.photoURL}" alt="${escape(e.name)}">` : escape((e.name||'?')[0]).toUpperCase()}
          </div>
          <strong>${escape(e.name)}</strong>
        </div>
      </td>
      <td>${escape(e.position||'—')}</td>
      <td><span class="text-success fw-bold">${formatCurrency(e.salary||0)}</span></td>
      <td>${escape(e.phone||'—')}</td>
      <td>
        <select class="form-control" style="width:auto;font-size:.8rem;padding:4px 8px"
          onchange="changeEmpStatus('${e.id}', this.value)">
          ${Object.entries(EMP_STATUS).map(([k,v])=>`<option value="${k}" ${(e.status||'active')===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="flex gap-1">
          <button class="btn-icon primary" onclick="editEmployee('${e.id}')" title="تعديل">✏️</button>
          <button class="btn-icon danger"  onclick="deleteEmployee('${e.id}')" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('emp-search').addEventListener('input', renderEmployees);
document.getElementById('emp-status-filter').addEventListener('change', renderEmployees);

window.changeEmpStatus = async (id, status) => {
  try {
    await updateDoc(doc(db,'employees',id), { status });
    const emp = employees.find(e=>e.id===id);
    if (emp) emp.status = status;
    showToast('تم تحديث الحالة','success');
  } catch { showToast('خطأ في التحديث','error'); }
};

function empFormHTML(e = null) {
  const statOpts = Object.entries(EMP_STATUS).map(([k,v])=>`<option value="${k}" ${(e?.status||'active')===k?'selected':''}>${v.icon} ${v.label}</option>`).join('');
  return `
    <div class="form-row">
      <div class="form-group"><label>الاسم *</label><input name="name" class="form-control" value="${escape(e?.name||'')}" required></div>
      <div class="form-group"><label>الحالة</label><select name="status" class="form-control">${statOpts}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الوظيفة</label><input name="position" class="form-control" value="${escape(e?.position||'')}"></div>
      <div class="form-group"><label>الراتب الأساسي (ج.م)</label><input type="number" name="salary" class="form-control" value="${e?.salary||''}" min="0" step="0.01"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الهاتف</label><input name="phone" class="form-control" type="tel" value="${escape(e?.phone||'')}"></div>
      <div class="form-group"><label>العنوان</label><input name="address" class="form-control" value="${escape(e?.address||'')}"></div>
    </div>
    <div class="form-group">
      <label>الصورة الشخصية</label>
      ${e?.photoURL?`<img src="${e.photoURL}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin-bottom:6px;display:block">`:''}
      <input type="file" name="image" accept="image/*" class="form-control">
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea name="notes" class="form-control">${escape(e?.notes||'')}</textarea></div>
  `;
}

document.getElementById('add-employee-btn').addEventListener('click', () => {
  showModal('إضافة موظف جديد', empFormHTML(), async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    const imgFile = body.querySelector('[name=image]').files[0];
    let photoURL = null;
    try {
      if (imgFile) photoURL = await resizeImage(imgFile);
      await addDoc(collection(db,'employees'), {
        name, status: body.querySelector('[name=status]').value,
        position: body.querySelector('[name=position]').value.trim(),
        salary: parseFloat(body.querySelector('[name=salary]').value)||0,
        phone: body.querySelector('[name=phone]').value.trim(),
        address: body.querySelector('[name=address]').value.trim(),
        notes: body.querySelector('[name=notes]').value.trim(),
        photoURL, createdAt: serverTimestamp()
      });
      closeModal(); showToast('تم إضافة الموظف','success'); loadEmployees();
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.editEmployee = (id) => {
  const e = employees.find(x=>x.id===id); if (!e) return;
  showModal('تعديل بيانات الموظف', empFormHTML(e), async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    const imgFile = body.querySelector('[name=image]').files[0];
    let photoURL = e.photoURL||null;
    try {
      if (imgFile) photoURL = await resizeImage(imgFile);
      await updateDoc(doc(db,'employees',id), {
        name, status: body.querySelector('[name=status]').value,
        position: body.querySelector('[name=position]').value.trim(),
        salary: parseFloat(body.querySelector('[name=salary]').value)||0,
        phone: body.querySelector('[name=phone]').value.trim(),
        address: body.querySelector('[name=address]').value.trim(),
        notes: body.querySelector('[name=notes]').value.trim(),
        photoURL
      });
      const emp = employees.find(x=>x.id===id);
      if (emp) Object.assign(emp, { name, position: body.querySelector('[name=position]').value.trim(), salary: parseFloat(body.querySelector('[name=salary]').value)||0, phone: body.querySelector('[name=phone]').value.trim(), status: body.querySelector('[name=status]').value, photoURL });
      closeModal(); showToast('تم التعديل','success'); renderEmployees();
    } catch { showToast('خطأ في التعديل','error'); }
  }, 'حفظ التعديل');
};

window.deleteEmployee = (id) => {
  showConfirm('حذف هذا الموظف؟', async () => {
    await deleteDoc(doc(db,'employees',id));
    employees = employees.filter(e=>e.id!==id);
    showToast('تم الحذف','success'); renderEmployees();
  });
};

// ── Attendance ────────────────────────────────────────────────────────────────
function populateAttSelect() {
  const sel = document.getElementById('att-employee');
  sel.innerHTML = '<option value="">اختر الموظف</option>' +
    employees.filter(e=>(e.status||'active')==='active').map(e=>`<option value="${e.id}">${escape(e.name)}</option>`).join('');
  if (!document.getElementById('att-month').value) {
    const d = new Date();
    document.getElementById('att-month').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
}

document.getElementById('att-load-btn').addEventListener('click', async () => {
  const empId    = document.getElementById('att-employee').value;
  const monthVal = document.getElementById('att-month').value;
  if (!empId || !monthVal) { showToast('اختر الموظف والشهر','warning'); return; }
  const [y, m] = monthVal.split('-').map(Number);
  attEmpId = empId; attYear = y; attMonth = m;
  await loadAttendance(empId, y, m);
  renderCalendar(y, m);
});

async function loadAttendance(empId, year, month) {
  try {
    const snap = await getDocs(query(collection(db,'attendance'), where('employeeId','==',empId)));
    attData = {};
    snap.docs.forEach(d => {
      const r  = d.data();
      const dt = r.date?.toDate ? r.date.toDate() : new Date(r.date);
      if (dt.getFullYear() !== year || dt.getMonth()+1 !== month) return;
      attData[localDateStr(dt)] = { status: r.status, docId: d.id };
    });
  } catch(err) { console.error(err); }
}

function renderCalendar(year, month) {
  closePicker();
  const grid   = document.getElementById('att-grid');
  const first  = new Date(year, month-1, 1).getDay();
  const days   = new Date(year, month, 0).getDate();
  const today  = localDateStr();
  let html = '';
  for (let i=0; i<first; i++) html += '<div class="att-day other-month"></div>';
  for (let d=1; d<=days; d++) {
    const ds  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = attData[ds];
    const cls = rec ? ATT_CLS[rec.status] || '' : '';
    const ic  = rec ? ATT_ICON[rec.status] || '' : '';
    const tod = ds === today ? 'today' : '';
    html += `<div class="att-day ${cls} ${tod}" data-date="${ds}" onclick="openPicker('${ds}', this)">
      <span class="day-num">${d}</span>
      <span class="day-icon">${ic}</span>
    </div>`;
  }
  grid.innerHTML = html;

  // Summary
  const counts = {present:0,absent:0,late:0,vacation:0};
  Object.values(attData).forEach(r => { if(counts[r.status]!=null) counts[r.status]++; });
  document.getElementById('att-summary').innerHTML = `
    <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-label">حاضر</div><div class="stat-value">${counts.present}</div></div>
    <div class="stat-card red"><div class="stat-icon">❌</div><div class="stat-label">غائب</div><div class="stat-value">${counts.absent}</div></div>
    <div class="stat-card orange"><div class="stat-icon">⏰</div><div class="stat-label">متأخر</div><div class="stat-value">${counts.late}</div></div>
    <div class="stat-card blue"><div class="stat-icon">🏖️</div><div class="stat-label">إجازة</div><div class="stat-value">${counts.vacation}</div></div>
  `;
}

window.openPicker = (dateStr, el) => {
  closePicker();
  if (!attEmpId) return;
  pickerOpen = dateStr;
  const picker = document.createElement('div');
  picker.className = 'att-status-picker';
  picker.id = 'att-picker';
  picker.innerHTML = ATT_STATUS.map(s =>
    `<div class="att-status-opt ${s}" onclick="setAttStatus('${dateStr}','${s}')">${ATT_ICON[s]} ${ATT_LABEL[s]}</div>`
  ).join('') + `<div class="att-status-opt clear" onclick="clearAttStatus('${dateStr}')">✕ مسح</div>`;
  el.style.position = 'relative';
  el.appendChild(picker);
  setTimeout(() => document.addEventListener('click', outsidePickerClick), 100);
};

function outsidePickerClick(e) {
  if (!e.target.closest('#att-picker') && !e.target.closest('.att-day')) closePicker();
}
function closePicker() {
  const p = document.getElementById('att-picker');
  if (p) p.remove();
  document.removeEventListener('click', outsidePickerClick);
  pickerOpen = null;
}

window.setAttStatus = async (dateStr, status) => {
  closePicker();
  if (!attEmpId) return;
  const rec = attData[dateStr];
  // Build timestamp using local midnight to avoid UTC date shift in UTC+ timezones
  const [sy, sm, sd] = dateStr.split('-').map(Number);
  const ts  = Timestamp.fromDate(new Date(sy, sm - 1, sd, 0, 0, 0));
  try {
    if (rec?.docId) {
      await updateDoc(doc(db,'attendance',rec.docId), { status });
      attData[dateStr] = { ...rec, status };
    } else {
      const ref = await addDoc(collection(db,'attendance'), { employeeId:attEmpId, status, date:ts, createdAt:serverTimestamp() });
      attData[dateStr] = { status, docId:ref.id };
    }
    renderCalendar(attYear, attMonth);
  } catch(err) { console.error(err); showToast('خطأ في تسجيل الحضور','error'); }
};
window.clearAttStatus = async (dateStr) => {
  closePicker();
  const rec = attData[dateStr];
  if (!rec?.docId) { renderCalendar(attYear, attMonth); return; }
  try {
    await deleteDoc(doc(db,'attendance',rec.docId));
    delete attData[dateStr];
    renderCalendar(attYear, attMonth);
  } catch { showToast('خطأ في المسح','error'); }
};

await loadEmployees();
