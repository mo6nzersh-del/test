/**
 * employees.js — نظام الموظفين المعدّل
 *
 * التغييرات الرئيسية:
 * - حُذف نظام تسجيل الحضور بالساعات (دخول/خروج)
 * - تم استبداله بتقويم شهري يُحدَّد فيه كل يوم:
 *   حضور | غائب | إجازة براتب | إجازة بدون راتب
 * - يُحسب الراتب تلقائياً بناءً على أيام الحضور
 * - حُذفت حقول: ساعة عادية، ساعة إضافية، ساعات يومية
 *
 * الاستيراد من نفس الوحدات الأصلية — استبدل الكود المُجمَّع بهذا المصدر وأعد البناء.
 */

import {
  r as setupAuth,   // onAuthStateChanged / page guard
  u as updateDoc,   // updateDoc
  a as docRef,      // doc
  d as db,          // Firestore instance
  b as addDoc,      // addDoc
  c as collection,  // collection
  s as serverTimestamp, // serverTimestamp
  q as fsQuery,     // query
  e as onSnapshot,  // onSnapshot
  f as deleteDoc,   // deleteDoc
  w as where,       // where
} from "./auth-guard-DMMO1gWE.js";

import { r as renderNav, s as showToast } from "./nav-C4LmEyvm.js";
import { f as processImage } from "./image-utils-ix_Ztzsr.js";

// ─── الحالة العامة ────────────────────────────────────────────────────────────
let employees = [];          // كل الموظفين
let dailyAttendance = [];    // سجلات الحضور اليومي للموظف الحالي في الشهر الحالي (مصفاة بالتاريخ، بلا تكرار)
let currentEmployeeId = null;
let currentPhoto = null;     // ملف الصورة قبل الرفع
let editEmployeeId = null;   // معرف الموظف الذي يُعدَّل
let attendanceUnsubscribe = null; // إلغاء اشتراك Firestore

// الشهر/السنة المعروضان في التقويم
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

/**
 * مجموعة لحجب التكرار: يحمل قيم dateStr للأيام التي يجري حفظها حالياً.
 * عند الضغط على زر حالة يوم ما، يُضاف تاريخه هنا حتى يكتمل الطلب.
 */
const pendingDays = new Set();

// ─── التهيئة ──────────────────────────────────────────────────────────────────
setupAuth(user => {
  renderNav("employees.html", user);
  setupEmployeeModal();
  setupDetailNavigation();
  loadEmployees();
});

// ─── أدوات مساعدة ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function formatMoney(n) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n || 0) + " ج.م";
}

/** يُعيد سلسلة YYYY-MM-DD من كائن Date محلي (بدون UTC) */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** يُعيد اسم الشهر العربي */
function arabicMonthName(month, year) {
  return new Date(year, month, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

// ─── نافذة إضافة / تعديل الموظف ──────────────────────────────────────────────
function setupEmployeeModal() {
  const modal      = document.getElementById("employee-modal");
  const addBtn     = document.getElementById("add-employee-btn");
  const closeBtn   = document.getElementById("employee-modal-close");
  const form       = document.getElementById("employee-form");
  const photoInput = document.getElementById("employee-photo");
  const dropLabel  = document.getElementById("file-drop-label");
  const preview    = document.getElementById("image-preview");
  const dropText   = document.getElementById("file-drop-text");

  addBtn.addEventListener("click",  () => openEmployeeModal(null));
  closeBtn.addEventListener("click", closeEmployeeModal);
  modal.addEventListener("click",   e => { if (e.target === modal) closeEmployeeModal(); });

  dropLabel.addEventListener("click", e => { e.preventDefault(); photoInput.click(); });
  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;
    currentPhoto = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    dropText.textContent = file.name;
  });

  form.addEventListener("submit", saveEmployee);
}

function openEmployeeModal(employee) {
  const modal    = document.getElementById("employee-modal");
  const title    = document.getElementById("employee-modal-title");
  const form     = document.getElementById("employee-form");
  const preview  = document.getElementById("image-preview");
  const dropText = document.getElementById("file-drop-text");

  form.reset();
  currentPhoto = null;
  preview.style.display = "none";
  dropText.textContent = "اضغط لاختيار صورة";

  if (employee) {
    editEmployeeId = employee.id;
    title.textContent = "تعديل الموظف";
    document.getElementById("employee-name").value   = employee.name   ?? "";
    document.getElementById("employee-phone").value  = employee.phone  ?? "";
    document.getElementById("employee-idcard").value = employee.idCardNumber ?? "";
    document.getElementById("employee-salary").value = employee.monthlySalary ?? "";
    if (employee.photoUrl) {
      preview.src = employee.photoUrl;
      preview.style.display = "block";
      dropText.textContent = "الصورة الحالية";
    }
  } else {
    editEmployeeId = null;
    title.textContent = "إضافة موظف";
  }

  modal.classList.add("open");
}

function closeEmployeeModal() {
  document.getElementById("employee-modal").classList.remove("open");
  editEmployeeId = null;
  currentPhoto   = null;
}

async function saveEmployee(e) {
  e.preventDefault();

  const name   = document.getElementById("employee-name").value.trim();
  if (!name) return;

  const phone   = document.getElementById("employee-phone").value.trim();
  const idcard  = document.getElementById("employee-idcard").value.trim();
  const salary  = Number(document.getElementById("employee-salary").value) || 0;
  const saveBtn = document.getElementById("employee-submit-btn");

  saveBtn.disabled   = true;
  saveBtn.innerHTML  = '<span class="spinner"></span>';

  try {
    let photoUrl = null;
    if (editEmployeeId) {
      photoUrl = employees.find(emp => emp.id === editEmployeeId)?.photoUrl ?? null;
    }
    if (currentPhoto) {
      photoUrl = await processImage(currentPhoto);
    }

    const data = { name, phone, idCardNumber: idcard, monthlySalary: salary, photoUrl };

    if (editEmployeeId) {
      await updateDoc(docRef(db, "employees", editEmployeeId), data);
      showToast("تم تحديث بيانات الموظف");
    } else {
      await addDoc(collection(db, "employees"), { ...data, createdAt: serverTimestamp() });
      showToast("تمت إضافة الموظف بنجاح");
    }

    closeEmployeeModal();
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحفظ", true);
  } finally {
    saveBtn.disabled   = false;
    saveBtn.textContent = "حفظ الموظف";
  }
}

// ─── تحميل الموظفين من Firestore ──────────────────────────────────────────────
function loadEmployees() {
  const q = fsQuery(collection(db, "employees"));
  onSnapshot(q, snap => {
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEmployeeList();
    if (currentEmployeeId) fillDetailHeader();
  }, err => {
    console.error(err);
    document.getElementById("employees-table-body").innerHTML =
      '<tr><td colspan="5"><div class="empty-state">حدث خطأ في تحميل الموظفين</div></td></tr>';
  });
}

function renderEmployeeList() {
  const tbody = document.getElementById("employees-table-body");
  if (!employees.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">لا يوجد موظفون مسجلون بعد</div></td></tr>';
    return;
  }

  tbody.innerHTML = "";
  employees.forEach(emp => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${emp.photoUrl
        ? `<img class="row-thumb" src="${emp.photoUrl}" alt="${escapeHtml(emp.name)}" />`
        : '<div class="row-thumb"></div>'}</td>
      <td><span class="link-cell" data-id="${emp.id}">${escapeHtml(emp.name)}</span></td>
      <td>${escapeHtml(emp.phone) || "—"}</td>
      <td>${emp.monthlySalary ? formatMoney(emp.monthlySalary) : "—"}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="edit" data-id="${emp.id}">تعديل</button>
          <button type="button" class="del"  data-id="${emp.id}">حذف</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".link-cell").forEach(el =>
    el.addEventListener("click", () => openEmployeeDetail(el.dataset.id)));
  tbody.querySelectorAll(".edit").forEach(el =>
    el.addEventListener("click", () => {
      const emp = employees.find(e => e.id === el.dataset.id);
      if (emp) openEmployeeModal(emp);
    }));
  tbody.querySelectorAll(".del").forEach(el =>
    el.addEventListener("click", () => deleteEmployee(el.dataset.id)));
}

async function deleteEmployee(id) {
  if (!confirm("هل تريد حذف هذا الموظف؟")) return;
  try {
    await deleteDoc(docRef(db, "employees", id));
    showToast("تم حذف الموظف");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحذف", true);
  }
}

// ─── صفحة التفاصيل ────────────────────────────────────────────────────────────
function setupDetailNavigation() {
  document.getElementById("back-to-list").addEventListener("click", backToList);
  document.getElementById("tab-attendance").addEventListener("click", () => switchTab("attendance"));
  document.getElementById("tab-idcard").addEventListener("click",    () => switchTab("idcard"));
  document.getElementById("prev-month-btn").addEventListener("click", () => changeMonth(-1));
  document.getElementById("next-month-btn").addEventListener("click", () => changeMonth(+1));
}

function switchTab(tab) {
  document.getElementById("tab-attendance").classList.toggle("active", tab === "attendance");
  document.getElementById("tab-idcard").classList.toggle("active",    tab === "idcard");
  document.getElementById("view-attendance").classList.toggle("active", tab === "attendance");
  document.getElementById("view-idcard").classList.toggle("active",    tab === "idcard");
}

function openEmployeeDetail(id) {
  currentEmployeeId = id;
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();

  document.getElementById("list-section").style.display   = "none";
  document.getElementById("detail-section").style.display = "block";
  switchTab("attendance");

  fillDetailHeader();
  fillIdCard();
  loadMonthAttendance();
}

function backToList() {
  currentEmployeeId = null;
  if (attendanceUnsubscribe) { attendanceUnsubscribe(); attendanceUnsubscribe = null; }
  document.getElementById("list-section").style.display   = "block";
  document.getElementById("detail-section").style.display = "none";
}

function fillDetailHeader() {
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (!emp) return;

  document.getElementById("detail-name").textContent   = emp.name ?? "";
  document.getElementById("detail-idcard").textContent = emp.idCardNumber
    ? `رقم البطاقة: ${emp.idCardNumber}` : "لا يوجد رقم بطاقة";
  document.getElementById("detail-phone").textContent  = emp.phone || "—";
  document.getElementById("detail-salary").textContent = emp.monthlySalary ? formatMoney(emp.monthlySalary) : "—";

  const avatar = document.getElementById("detail-avatar");
  if (emp.photoUrl) { avatar.src = emp.photoUrl; avatar.style.display = "block"; }
  else { avatar.style.display = "none"; }
}

function fillIdCard() {
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (!emp) return;

  document.getElementById("idcard-name").textContent  = emp.name ?? "";
  document.getElementById("idcard-id").textContent    = `رقم البطاقة: ${emp.idCardNumber || "—"}`;
  document.getElementById("idcard-phone").textContent = `الهاتف: ${emp.phone || "—"}`;

  const photo = document.getElementById("idcard-photo");
  if (emp.photoUrl) { photo.src = emp.photoUrl; photo.style.display = "block"; }
  else { photo.style.display = "none"; }
}

// ─── تغيير الشهر ──────────────────────────────────────────────────────────────
function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  loadMonthAttendance();
}

// ─── تحميل الحضور الشهري من Firestore ────────────────────────────────────────
function loadMonthAttendance() {
  if (!currentEmployeeId) return;

  // تحديث التسمية
  const label = document.getElementById("month-label");
  if (label) label.textContent = arabicMonthName(calMonth, calYear);

  // تحديث عنوان لوحة التقويم
  const panelTitle = document.getElementById("calendar-panel-title");
  if (panelTitle) panelTitle.textContent = `تقويم الحضور — ${arabicMonthName(calMonth, calYear)}`;

  // إلغاء الاشتراك السابق
  if (attendanceUnsubscribe) { attendanceUnsubscribe(); attendanceUnsubscribe = null; }

  // نطاق الشهر كسلاسل YYYY-MM-DD
  const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
  const lastDay  = toLocalDateStr(new Date(calYear, calMonth + 1, 0)); // آخر يوم في الشهر

  // الاستعلام بـ employeeId + نطاق التاريخ
  const q = fsQuery(
    collection(db, "daily_attendance"),
    where("employeeId", "==", currentEmployeeId),
    where("date", ">=", firstDay),
    where("date", "<=", lastDay)
  );

  document.getElementById("calendar-container").innerHTML =
    '<div class="empty-state">جارِ التحميل...</div>';

  attendanceUnsubscribe = onSnapshot(q, snap => {
    dailyAttendance = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    renderSalarySummary();
  }, err => {
    console.error(err);
    document.getElementById("calendar-container").innerHTML =
      '<div class="empty-state">حدث خطأ في تحميل السجل</div>';
  });
}

// ─── رسم التقويم الشهري ───────────────────────────────────────────────────────
function renderCalendar() {
  const container = document.getElementById("calendar-container");
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  const STATUSES = [
    { key: "present",      label: "حضور",           cls: "s-present"  },
    { key: "absent",       label: "غائب",            cls: "s-absent"   },
    { key: "paid_leave",   label: "إجازة براتب",      cls: "s-paid"     },
    { key: "unpaid_leave", label: "إجازة بدون راتب", cls: "s-unpaid"   },
  ];

  let rows = "";
  for (let day = 1; day <= daysInMonth; day++) {
    const date       = new Date(calYear, calMonth, day);
    const dateStr    = toLocalDateStr(date);
    const dayName    = dayNames[date.getDay()];
    const isWeekend  = date.getDay() === 5 || date.getDay() === 6;
    const record     = dailyAttendance.find(r => r.date === dateStr);
    const status     = record?.status ?? "";
    const recordId   = record?.id ?? "";

    // أزرار الحالة
    const btns = STATUSES.map(s => `
      <button type="button"
        class="status-btn ${s.cls}${status === s.key ? " active" : ""}"
        data-date="${dateStr}"
        data-status="${s.key}"
        data-record-id="${recordId}">
        ${s.label}
      </button>`).join("");

    // صف الطباعة (نص الحالة عوضاً عن الأزرار)
    const statusText = STATUSES.find(s => s.key === status)?.label ?? "—";

    rows += `
      <tr class="cal-row${isWeekend ? " weekend" : ""}${status ? " has-status" : ""}" data-date="${dateStr}">
        <td class="cal-day-cell">
          <span class="cal-day-num">${day}</span>
          <span class="cal-day-name">${dayName}</span>
        </td>
        <td class="cal-status-cell screen-only">${btns}</td>
        <td class="cal-status-print print-only status-text ${status ? "st-" + status : ""}">${statusText}</td>
      </tr>`;
  }

  container.innerHTML = `
    <table class="attendance-calendar">
      <thead>
        <tr>
          <th>اليوم</th>
          <th class="screen-only">الحالة</th>
          <th class="print-only">الحالة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // ربط أحداث الأزرار
  container.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => setDayStatus(
      btn.dataset.date,
      btn.dataset.status,
      btn.dataset.recordId
    ));
  });
}

// ─── تعيين حالة اليوم ─────────────────────────────────────────────────────────
/**
 * يُحدّد حالة يوم معين في سجل الحضور.
 *
 * الاستراتيجية:
 * 1. يحجب أي ضغطة ثانية على نفس اليوم حتى يكتمل الطلب (pendingDays).
 * 2. يبحث عن سجل موجود في الذاكرة (dailyAttendance) بدلاً من الاعتماد فقط
 *    على recordId المُمرَّر من الـ DOM — لأن snapshot قد يتأخر.
 * 3. إذا ضُغط على الحالة ذاتها مرتين، يُحذف السجل (إلغاء التحديد).
 * 4. يُحدِّث dailyAttendance محلياً فوراً (optimistic update) قبل انتظار
 *    snapshot جديد، مما يمنع التكرار في الضغطات السريعة.
 */
async function setDayStatus(dateStr, newStatus, _recordIdFromDom) {
  if (!currentEmployeeId) return;

  // حجب التكرار: إذا كان اليوم قيد المعالجة، تجاهل الضغطة
  if (pendingDays.has(dateStr)) return;
  pendingDays.add(dateStr);

  // تعطيل أزرار هذا اليوم فوراً في الـ UI
  document.querySelectorAll(`.status-btn[data-date="${dateStr}"]`)
    .forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });

  const emp = employees.find(e => e.id === currentEmployeeId);

  // البحث في الذاكرة (أحدث من DOM)
  const existing = dailyAttendance.find(r => r.date === dateStr);

  try {
    if (existing) {
      if (existing.status === newStatus) {
        // نفس الحالة → إلغاء التحديد
        await deleteDoc(docRef(db, "daily_attendance", existing.id));
        // تحديث محلي فوري
        dailyAttendance = dailyAttendance.filter(r => r.date !== dateStr);
      } else {
        await updateDoc(docRef(db, "daily_attendance", existing.id), {
          status:    newStatus,
          updatedAt: serverTimestamp(),
        });
        // تحديث محلي فوري
        existing.status = newStatus;
      }
    } else {
      // إضافة سجل جديد
      const docSnap = await addDoc(collection(db, "daily_attendance"), {
        employeeId:   currentEmployeeId,
        employeeName: emp?.name ?? "",
        date:         dateStr,
        status:       newStatus,
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
      });
      // تحديث محلي فوري
      dailyAttendance.push({ id: docSnap.id, date: dateStr, status: newStatus,
                              employeeId: currentEmployeeId });
    }

    // إعادة رسم التقويم والملخص بناءً على البيانات المحلية المحدَّثة
    renderCalendar();
    renderSalarySummary();

  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحفظ", true);
  } finally {
    // رفع الحجب وإعادة تفعيل الأزرار
    pendingDays.delete(dateStr);
    document.querySelectorAll(`.status-btn[data-date="${dateStr}"]`)
      .forEach(b => { b.disabled = false; b.style.opacity = ""; });
  }
}

// ─── ملخص الراتب ──────────────────────────────────────────────────────────────
function renderSalarySummary() {
  const emp = employees.find(e => e.id === currentEmployeeId);
  const summaryEl = document.getElementById("attendance-summary");
  if (!summaryEl) return;

  const monthlySalary = emp?.monthlySalary ?? 0;
  const daysInMonth   = new Date(calYear, calMonth + 1, 0).getDate();
  const dailyRate     = monthlySalary > 0 ? monthlySalary / daysInMonth : 0;

  // إزالة التكرار: الاحتفاظ بآخر سجل لكل تاريخ فقط (حماية من بيانات قديمة مكررة)
  const dedupedMap = new Map();
  dailyAttendance.forEach(r => dedupedMap.set(r.date, r));
  const deduped = Array.from(dedupedMap.values());

  const presentDays     = deduped.filter(r => r.status === "present").length;
  const absentDays      = deduped.filter(r => r.status === "absent").length;
  const paidLeaveDays   = deduped.filter(r => r.status === "paid_leave").length;
  const unpaidLeaveDays = deduped.filter(r => r.status === "unpaid_leave").length;
  const markedDays      = presentDays + absentDays + paidLeaveDays + unpaidLeaveDays;
  const unmarkedDays    = daysInMonth - markedDays;

  // الأيام المدفوعة = حضور + إجازة براتب
  const paidDays   = presentDays + paidLeaveDays;
  const netSalary  = paidDays * dailyRate;
  const deductions = (absentDays + unpaidLeaveDays) * dailyRate;

  const emp_name = emp?.name ?? "الموظف";

  summaryEl.innerHTML = `
    <div class="info-chip chip-present">
      <div class="k">✅ أيام الحضور</div>
      <div class="v">${presentDays} يوم</div>
    </div>
    <div class="info-chip chip-absent">
      <div class="k">❌ أيام الغياب</div>
      <div class="v">${absentDays} يوم</div>
    </div>
    <div class="info-chip chip-paid">
      <div class="k">🏖️ إجازة براتب</div>
      <div class="v">${paidLeaveDays} يوم</div>
    </div>
    <div class="info-chip chip-unpaid">
      <div class="k">🚫 إجازة بدون راتب</div>
      <div class="v">${unpaidLeaveDays} يوم</div>
    </div>
    <div class="info-chip">
      <div class="k">⬜ أيام غير مسجلة</div>
      <div class="v">${unmarkedDays} يوم</div>
    </div>
    <div class="info-chip chip-total">
      <div class="k">إجمالي أيام الشهر</div>
      <div class="v">${daysInMonth} يوم</div>
    </div>
    <div class="info-chip chip-rate">
      <div class="k">أجر اليوم الواحد</div>
      <div class="v">${formatMoney(dailyRate)}</div>
    </div>
    <div class="info-chip chip-deduct">
      <div class="k">إجمالي الخصومات</div>
      <div class="v">${formatMoney(deductions)}</div>
    </div>
    <div class="info-chip chip-net" style="grid-column: 1 / -1;">
      <div class="k">💰 الراتب المستحق — ${emp_name} — ${arabicMonthName(calMonth, calYear)}</div>
      <div class="v salary-big">${formatMoney(netSalary)}</div>
    </div>
  `;
}
