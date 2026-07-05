import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showError, showLoadingRow, formatDate, formatDateTime, formatCurrency,
  isInDateRange, generateSerial, adjustInventoryTx, printReport, initTabs
} from './utils.js';
import {
  db, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, Timestamp, serverTimestamp, runTransaction
} from './firebase.js';

await requireAuth();
buildSidebar('warehouses');

let warehouses = [];
let products   = [];
let merchants  = [];
let history    = [];

const MOV_META = {
  opening:    { label:'رصيد افتتاحي', icon:'📂', cls:'mov-opening'   },
  production: { label:'إنتاج',        icon:'⚙️',  cls:'mov-production' },
  transfer:   { label:'تحويل',        icon:'🔄', cls:'mov-transfer'  },
  sale:       { label:'سند تحميل',    icon:'🚚', cls:'mov-sale'      },
  return:     { label:'مردود',        icon:'↩️', cls:'mov-return'    },
};

const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0,5);

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadWarehouses(), loadProducts(), loadMerchants()]);
  populateForms();
  loadHistory();
}

async function loadWarehouses() {
  try {
    const snap = await getDocs(query(collection(db,'warehouses'), orderBy('createdAt','asc')));
    warehouses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}
async function loadProducts() {
  try {
    const snap = await getDocs(query(collection(db,'products'), orderBy('name','asc')));
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}
async function loadMerchants() {
  try {
    const snap = await getDocs(query(collection(db,'merchants'), orderBy('name','asc')));
    merchants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}

function whOpts(selected = '') {
  return '<option value="">اختر المخزن</option>' +
    warehouses.map(w => `<option value="${w.id}" ${w.id===selected?'selected':''}>${escape(w.name)}</option>`).join('');
}
function prodOpts(selected = '') {
  return '<option value="">اختر المنتج</option>' +
    products.map(p => `<option value="${p.id}" ${p.id===selected?'selected':''}>${escape(p.name)}</option>`).join('');
}
function merOpts(selected = '') {
  return '<option value="">اختر التاجر</option>' +
    merchants.map(m => `<option value="${m.id}" ${m.id===selected?'selected':''}>${escape(m.name)}</option>`).join('');
}

function populateForms() {
  // Opening
  document.getElementById('opening-wh').innerHTML    = whOpts();
  document.getElementById('opening-date').value      = today();
  // Transfer
  document.getElementById('transfer-from').innerHTML = whOpts();
  document.getElementById('transfer-to').innerHTML   = whOpts();
  document.getElementById('transfer-product').innerHTML = prodOpts();
  document.getElementById('transfer-date').value     = today();
  document.getElementById('transfer-time').value     = nowTime();
  // Sale
  document.getElementById('sale-from-wh').innerHTML  = whOpts();
  document.getElementById('sale-merchant').innerHTML  = merOpts();
  document.getElementById('sale-date').value         = today();
  document.getElementById('sale-time').value         = nowTime();
  // Return
  document.getElementById('return-to-wh').innerHTML  = whOpts();
  document.getElementById('return-merchant').innerHTML = merOpts();
  document.getElementById('return-date').value       = today();
  document.getElementById('return-time').value       = nowTime();
  // Production
  document.getElementById('prod-date').value         = today();
  document.getElementById('prod-time').value         = nowTime();
  // Seed first rows
  addOpeningItem();
  addProdInput(); addProdOutput();
  addSaleItem();  addReturnItem();
  // History warehouse filter
  document.getElementById('hist-wh').innerHTML = '<option value="">كل المخازن</option>' +
    warehouses.map(w=>`<option value="${w.id}">${escape(w.name)}</option>`).join('');
}

// ── Tab switching ─────────────────────────────────────────────────────────────
initTabs((tab) => { if (tab === 'tab-history') loadHistory(); });

// ── Manage warehouses dialog ──────────────────────────────────────────────────
document.getElementById('manage-warehouses-btn').addEventListener('click', () => {
  const rows = warehouses.map(w => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <strong>${escape(w.name)}</strong>
      <div class="flex gap-1">
        <button class="btn-icon" onclick="editWh('${w.id}')">✏️</button>
        <button class="btn-icon danger" onclick="deleteWh('${w.id}')">🗑️</button>
      </div>
    </div>`).join('') || '<p class="text-muted text-center">لا توجد مخازن</p>';
  showModal('إدارة المخازن', `
    ${rows}
    <div class="mt-2">
      <h4 style="margin-bottom:10px;font-size:.9rem">إضافة مخزن جديد</h4>
      <div class="form-group"><label>الاسم *</label><input name="new-wh-name" class="form-control" placeholder="اسم المخزن"></div>
      <div class="form-group"><label>الوصف</label><textarea name="new-wh-desc" class="form-control" placeholder="وصف اختياري"></textarea></div>
    </div>
  `, async (body) => {
    const name = body.querySelector('[name=new-wh-name]').value.trim();
    if (!name) { showToast('أدخل اسم المخزن','warning'); return; }
    await addDoc(collection(db,'warehouses'), { name, description: body.querySelector('[name=new-wh-desc]').value.trim(), createdAt: serverTimestamp() });
    closeModal(); showToast('تم إضافة المخزن','success');
    await loadWarehouses(); populateForms();
  }, 'إضافة المخزن');
});

window.editWh = (id) => {
  const w = warehouses.find(x=>x.id===id); if (!w) return;
  showModal('تعديل المخزن', `
    <div class="form-group"><label>الاسم</label><input name="name" class="form-control" value="${escape(w.name)}"></div>
    <div class="form-group"><label>الوصف</label><textarea name="desc" class="form-control">${escape(w.description||'')}</textarea></div>
  `, async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    await updateDoc(doc(db,'warehouses',id), { name, description: body.querySelector('[name=desc]').value.trim() });
    closeModal(); showToast('تم التعديل','success'); await loadWarehouses(); populateForms();
  }, 'حفظ');
};
window.deleteWh = (id) => {
  showConfirm('حذف هذا المخزن؟', async () => {
    await deleteDoc(doc(db,'warehouses',id));
    showToast('تم الحذف','success'); await loadWarehouses(); populateForms();
  });
};

// ═══════════════════════════════════════════════════════════════════
// OPENING BALANCE
// ═══════════════════════════════════════════════════════════════════
let openingItemIdx = 0;
function addOpeningItem() {
  const idx = openingItemIdx++;
  const div = document.createElement('div');
  div.className = 'item-row'; div.dataset.idx = idx;
  div.style.gridTemplateColumns = '1fr 120px 36px';
  div.innerHTML = `
    <select name="op-prod-${idx}" class="form-control">${prodOpts()}</select>
    <input type="number" name="op-qty-${idx}" class="form-control" min="1" placeholder="الكمية">
    <button type="button" class="btn-icon danger" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('opening-items').insertBefore(div, document.querySelector('#opening-items .repeater-actions'));
}
document.getElementById('add-opening-item').addEventListener('click', addOpeningItem);

document.getElementById('form-opening').addEventListener('submit', async (e) => {
  e.preventDefault();
  const whId = document.getElementById('opening-wh').value;
  const wh   = warehouses.find(w=>w.id===whId);
  if (!whId) { showToast('اختر المخزن','warning'); return; }
  const dateVal = document.getElementById('opening-date').value;
  const notes   = e.target.querySelector('[name=notes]').value.trim();

  const rows = document.querySelectorAll('#opening-items .item-row');
  const items = [];
  for (const row of rows) {
    const idx    = row.dataset.idx;
    const prodId = row.querySelector(`[name=op-prod-${idx}]`).value;
    const qty    = parseInt(row.querySelector(`[name=op-qty-${idx}]`).value)||0;
    if (prodId && qty > 0) {
      const prod = products.find(p=>p.id===prodId);
      items.push({ productId: prodId, productName: prod?.name||'', quantity: qty });
    }
  }
  if (!items.length) { showToast('أضف منتجاً واحداً على الأقل','warning'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
    const serial = await generateSerial('movements');
    const ts     = Timestamp.fromDate(new Date(dateVal+'T00:00:00'));
    await runTransaction(db, async (tx) => {
      for (const item of items) {
        await adjustInventoryTx(tx, whId, item.productId, item.productName, item.quantity);
      }
      const movRef = doc(collection(db,'movements'));
      tx.set(movRef, {
        type: 'opening', serialNumber: serial, warehouseId: whId, warehouseName: wh?.name||'',
        items, date: ts, notes, status: 'active', createdAt: serverTimestamp()
      });
    });
    showToast(`تم تسجيل الرصيد الافتتاحي #${serial} بنجاح`,'success');
    e.target.reset();
    document.getElementById('opening-date').value = today();
    document.querySelectorAll('#opening-items .item-row').forEach(r=>r.remove());
    addOpeningItem();
  } catch(err) { showToast(err.message||'خطأ في الحفظ','error'); console.error(err); }
  finally { btn.disabled = false; btn.textContent = '✅ تسجيل الرصيد الافتتاحي'; }
});

// ═══════════════════════════════════════════════════════════════════
// PRODUCTION
// ═══════════════════════════════════════════════════════════════════
let prodInputIdx = 0, prodOutputIdx = 0;

function addProdInput() {
  const idx = prodInputIdx++;
  const div = document.createElement('div');
  div.className = 'item-row inputs'; div.dataset.idx = idx;
  div.style.gridTemplateColumns = '1fr 1fr 120px 36px';
  div.innerHTML = `
    <select name="pi-wh-${idx}" class="form-control">${whOpts()}</select>
    <select name="pi-prod-${idx}" class="form-control">${prodOpts()}</select>
    <input type="number" name="pi-qty-${idx}" class="form-control" min="1" placeholder="الكمية">
    <button type="button" class="btn-icon danger" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('prod-inputs-rows').appendChild(div);
}
function addProdOutput() {
  const idx = prodOutputIdx++;
  const div = document.createElement('div');
  div.className = 'item-row outputs'; div.dataset.idx = idx;
  div.style.gridTemplateColumns = '1fr 1fr 120px 36px';
  div.innerHTML = `
    <select name="po-wh-${idx}" class="form-control">${whOpts()}</select>
    <select name="po-prod-${idx}" class="form-control">${prodOpts()}</select>
    <input type="number" name="po-qty-${idx}" class="form-control" min="1" placeholder="الكمية">
    <button type="button" class="btn-icon danger" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('prod-outputs-rows').appendChild(div);
}
document.getElementById('add-prod-input').addEventListener('click', addProdInput);
document.getElementById('add-prod-output').addEventListener('click', addProdOutput);

document.getElementById('form-production').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateVal = document.getElementById('prod-date').value;
  const timeVal = document.getElementById('prod-time').value||'00:00';
  const notes   = e.target.querySelector('[name=notes]').value.trim();
  const inputs  = [], outputs = [];

  for (const row of document.querySelectorAll('#prod-inputs-rows .item-row')) {
    const i = row.dataset.idx;
    const whId = row.querySelector(`[name=pi-wh-${i}]`).value;
    const prId = row.querySelector(`[name=pi-prod-${i}]`).value;
    const qty  = parseInt(row.querySelector(`[name=pi-qty-${i}]`).value)||0;
    if (whId && prId && qty>0) {
      const wh=warehouses.find(w=>w.id===whId), pr=products.find(p=>p.id===prId);
      inputs.push({ warehouseId:whId, warehouseName:wh?.name||'', productId:prId, productName:pr?.name||'', quantity:qty });
    }
  }
  for (const row of document.querySelectorAll('#prod-outputs-rows .item-row')) {
    const i = row.dataset.idx;
    const whId = row.querySelector(`[name=po-wh-${i}]`).value;
    const prId = row.querySelector(`[name=po-prod-${i}]`).value;
    const qty  = parseInt(row.querySelector(`[name=po-qty-${i}]`).value)||0;
    if (whId && prId && qty>0) {
      const wh=warehouses.find(w=>w.id===whId), pr=products.find(p=>p.id===prId);
      outputs.push({ warehouseId:whId, warehouseName:wh?.name||'', productId:prId, productName:pr?.name||'', quantity:qty });
    }
  }
  if (!inputs.length && !outputs.length) { showToast('أضف بنوداً على الأقل','warning'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'جاري التسجيل...';
  try {
    const serial = await generateSerial('movements');
    const ts = Timestamp.fromDate(new Date(`${dateVal}T${timeVal}:00`));
    await runTransaction(db, async (tx) => {
      for (const inp of inputs)  await adjustInventoryTx(tx, inp.warehouseId, inp.productId, inp.productName, -inp.quantity);
      for (const out of outputs) await adjustInventoryTx(tx, out.warehouseId, out.productId, out.productName, +out.quantity);
      const movRef = doc(collection(db,'movements'));
      tx.set(movRef, { type:'production', serialNumber:serial, inputs, outputs, date:ts, notes, status:'active', createdAt:serverTimestamp() });
    });
    showToast(`تم تسجيل عملية الإنتاج #${serial}`,'success');
    e.target.reset();
    document.getElementById('prod-date').value = today();
    document.getElementById('prod-time').value = nowTime();
    document.querySelectorAll('#prod-inputs-rows .item-row, #prod-outputs-rows .item-row').forEach(r=>r.remove());
    addProdInput(); addProdOutput();
  } catch(err) { showToast(err.message||'خطأ في التسجيل','error'); console.error(err); }
  finally { btn.disabled=false; btn.textContent='✅ تسجيل عملية الإنتاج'; }
});

// ═══════════════════════════════════════════════════════════════════
// TRANSFER
// ═══════════════════════════════════════════════════════════════════
// Live availability check
async function checkTransferAvail() {
  const fromId = document.getElementById('transfer-from').value;
  const prodId = document.getElementById('transfer-product').value;
  const availEl = document.getElementById('transfer-avail');
  const warnEl  = document.getElementById('transfer-avail-warn');
  if (!fromId || !prodId) { availEl.textContent=''; return; }
  try {
    const snap = await getDoc(doc(db,'warehouseInventory',`${fromId}_${prodId}`));
    const avail = snap.exists() ? (snap.data().quantity||0) : 0;
    availEl.textContent = `متاح: ${avail} وحدة`;
    warnEl.style.display = avail === 0 ? 'block' : 'none';
    if (avail === 0) warnEl.textContent = '⚠️ لا يوجد رصيد لهذا المنتج في المخزن المحدد';
  } catch { availEl.textContent=''; }
}
['transfer-from','transfer-product'].forEach(id => document.getElementById(id).addEventListener('change', checkTransferAvail));

document.getElementById('form-transfer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromId = document.getElementById('transfer-from').value;
  const toId   = document.getElementById('transfer-to').value;
  const prodId = document.getElementById('transfer-product').value;
  const qty    = parseInt(document.getElementById('transfer-qty').value)||0;
  const dateVal = document.getElementById('transfer-date').value;
  const timeVal = document.getElementById('transfer-time').value||'00:00';
  const notes   = e.target.querySelector('[name=notes]').value.trim();
  if (!fromId||!toId||!prodId||qty<=0) { showToast('أكمل جميع الحقول المطلوبة','warning'); return; }
  if (fromId===toId) { showToast('المخزن المصدر والوجهة متطابقان','warning'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled=true; btn.textContent='جاري التحويل...';
  try {
    const serial = await generateSerial('movements');
    const fromWh = warehouses.find(w=>w.id===fromId);
    const toWh   = warehouses.find(w=>w.id===toId);
    const prod   = products.find(p=>p.id===prodId);
    const ts     = Timestamp.fromDate(new Date(`${dateVal}T${timeVal}:00`));
    await runTransaction(db, async (tx) => {
      await adjustInventoryTx(tx, fromId, prodId, prod?.name||'', -qty);
      await adjustInventoryTx(tx, toId,   prodId, prod?.name||'', +qty);
      const movRef = doc(collection(db,'movements'));
      tx.set(movRef, {
        type:'transfer', serialNumber:serial,
        fromWarehouseId:fromId, fromWarehouseName:fromWh?.name||'',
        toWarehouseId:toId,   toWarehouseName:toWh?.name||'',
        productId:prodId, productName:prod?.name||'', quantity:qty,
        date:ts, notes, status:'active', createdAt:serverTimestamp()
      });
    });
    showToast(`تم التحويل #${serial} بنجاح`,'success');
    e.target.reset();
    document.getElementById('transfer-date').value = today();
    document.getElementById('transfer-time').value = nowTime();
    document.getElementById('transfer-avail').textContent='';
  } catch(err) { showToast(err.message||'خطأ في التحويل','error'); }
  finally { btn.disabled=false; btn.textContent='✅ تنفيذ التحويل'; }
});

// ═══════════════════════════════════════════════════════════════════
// SALE (سند تحميل)
// ═══════════════════════════════════════════════════════════════════
let saleItemIdx = 0;
function addSaleItem() {
  const idx = saleItemIdx++;
  const div = document.createElement('div');
  div.className = 'item-row'; div.dataset.idx = idx;
  div.style.gridTemplateColumns = '1fr 110px 130px 36px';
  div.innerHTML = `
    <select name="si-prod-${idx}" class="form-control" onchange="updateSaleTotal()">${prodOpts()}</select>
    <input type="number" name="si-qty-${idx}" class="form-control" min="1" placeholder="الكمية" onchange="updateSaleTotal()">
    <input type="number" name="si-price-${idx}" class="form-control" min="0" step="0.01" placeholder="السعر (ج.م)" onchange="updateSaleTotal()">
    <button type="button" class="btn-icon danger" onclick="this.closest('.item-row').remove();updateSaleTotal()">✕</button>`;
  document.getElementById('sale-items-rows').appendChild(div);
}
document.getElementById('add-sale-item').addEventListener('click', addSaleItem);

window.updateSaleTotal = () => {
  let total = 0;
  document.querySelectorAll('#sale-items-rows .item-row').forEach(row => {
    const i = row.dataset.idx;
    const qty   = parseFloat(row.querySelector(`[name=si-qty-${i}]`)?.value)||0;
    const price = parseFloat(row.querySelector(`[name=si-price-${i}]`)?.value)||0;
    total += qty * price;
  });
  document.getElementById('sale-total').textContent = total.toLocaleString('ar-EG',{minimumFractionDigits:2}) + ' ج.م';
};

document.getElementById('form-sale').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromWhId  = document.getElementById('sale-from-wh').value;
  const merchantId= document.getElementById('sale-merchant').value;
  const dateVal   = document.getElementById('sale-date').value;
  const timeVal   = document.getElementById('sale-time').value||'00:00';
  const notes     = e.target.querySelector('[name=notes]').value.trim();
  if (!fromWhId||!merchantId) { showToast('اختر المخزن والتاجر','warning'); return; }
  const items = [];
  for (const row of document.querySelectorAll('#sale-items-rows .item-row')) {
    const i    = row.dataset.idx;
    const prodId= row.querySelector(`[name=si-prod-${i}]`).value;
    const qty  = parseInt(row.querySelector(`[name=si-qty-${i}]`).value)||0;
    const price= parseFloat(row.querySelector(`[name=si-price-${i}]`).value)||0;
    if (prodId&&qty>0) {
      const prod=products.find(p=>p.id===prodId);
      items.push({ productId:prodId, productName:prod?.name||'', quantity:qty, price });
    }
  }
  if (!items.length) { showToast('أضف صنفاً واحداً على الأقل','warning'); return; }
  const totalAmt = items.reduce((s,i)=>s+(i.quantity*i.price),0);
  const fromWh   = warehouses.find(w=>w.id===fromWhId);
  const merchant = merchants.find(m=>m.id===merchantId);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled=true; btn.textContent='جاري الإصدار...';
  try {
    const serial = await generateSerial('movements');
    const ts     = Timestamp.fromDate(new Date(`${dateVal}T${timeVal}:00`));
    await runTransaction(db, async (tx) => {
      for (const item of items)
        await adjustInventoryTx(tx, fromWhId, item.productId, item.productName, -item.quantity);
      const movRef = doc(collection(db,'movements'));
      tx.set(movRef, {
        type:'sale', serialNumber:serial,
        fromWarehouseId:fromWhId, fromWarehouseName:fromWh?.name||'',
        merchantId, merchantName:merchant?.name||'',
        items, totalAmount:totalAmt, date:ts, notes, status:'active', createdAt:serverTimestamp()
      });
      // Merchant debit transaction
      const txRef = doc(collection(db,'merchantTransactions'));
      tx.set(txRef, {
        merchantId, type:'debit', amount:totalAmt,
        description:`سند تحميل #${serial}`,
        movementSerial:serial, date:ts, createdAt:serverTimestamp()
      });
    });
    showToast(`تم إصدار سند التحميل #${serial} بقيمة ${totalAmt.toLocaleString('ar-EG',{minimumFractionDigits:0})} ج.م`,'success',5000);
    e.target.reset();
    document.getElementById('sale-date').value = today();
    document.getElementById('sale-time').value = nowTime();
    document.querySelectorAll('#sale-items-rows .item-row').forEach(r=>r.remove());
    addSaleItem(); updateSaleTotal();
  } catch(err) { showToast(err.message||'خطأ في الإصدار','error'); console.error(err); }
  finally { btn.disabled=false; btn.textContent='✅ إصدار سند التحميل'; }
});

// ═══════════════════════════════════════════════════════════════════
// RETURN (مردود)
// ═══════════════════════════════════════════════════════════════════
let returnItemIdx = 0;
function addReturnItem() {
  const idx = returnItemIdx++;
  const div = document.createElement('div');
  div.className = 'item-row'; div.dataset.idx = idx;
  div.style.gridTemplateColumns = '1fr 110px 130px 36px';
  div.innerHTML = `
    <select name="ri-prod-${idx}" class="form-control">${prodOpts()}</select>
    <input type="number" name="ri-qty-${idx}" class="form-control" min="1" placeholder="الكمية">
    <input type="number" name="ri-price-${idx}" class="form-control" min="0" step="0.01" placeholder="سعر الإرجاع">
    <button type="button" class="btn-icon danger" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('return-items-rows').appendChild(div);
}
document.getElementById('add-return-item').addEventListener('click', addReturnItem);

document.getElementById('form-return').addEventListener('submit', async (e) => {
  e.preventDefault();
  const toWhId    = document.getElementById('return-to-wh').value;
  const merchantId= document.getElementById('return-merchant').value;
  const dateVal   = document.getElementById('return-date').value;
  const timeVal   = document.getElementById('return-time').value||'00:00';
  const notes     = e.target.querySelector('[name=notes]').value.trim();
  if (!toWhId||!merchantId) { showToast('اختر المخزن والتاجر','warning'); return; }
  const items = [];
  for (const row of document.querySelectorAll('#return-items-rows .item-row')) {
    const i     = row.dataset.idx;
    const prodId= row.querySelector(`[name=ri-prod-${i}]`).value;
    const qty   = parseInt(row.querySelector(`[name=ri-qty-${i}]`).value)||0;
    const price = parseFloat(row.querySelector(`[name=ri-price-${i}]`).value)||0;
    if (prodId&&qty>0) {
      const prod=products.find(p=>p.id===prodId);
      items.push({ productId:prodId, productName:prod?.name||'', quantity:qty, price });
    }
  }
  if (!items.length) { showToast('أضف صنفاً واحداً على الأقل','warning'); return; }
  const totalAmt  = items.reduce((s,i)=>s+(i.quantity*i.price),0);
  const toWh      = warehouses.find(w=>w.id===toWhId);
  const merchant  = merchants.find(m=>m.id===merchantId);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled=true; btn.textContent='جاري التسجيل...';
  try {
    const serial = await generateSerial('movements');
    const ts     = Timestamp.fromDate(new Date(`${dateVal}T${timeVal}:00`));
    await runTransaction(db, async (tx) => {
      for (const item of items)
        await adjustInventoryTx(tx, toWhId, item.productId, item.productName, +item.quantity);
      const movRef = doc(collection(db,'movements'));
      tx.set(movRef, {
        type:'return', serialNumber:serial,
        toWarehouseId:toWhId, toWarehouseName:toWh?.name||'',
        merchantId, merchantName:merchant?.name||'',
        items, totalAmount:totalAmt, date:ts, notes, status:'active', createdAt:serverTimestamp()
      });
      const txRef = doc(collection(db,'merchantTransactions'));
      tx.set(txRef, {
        merchantId, type:'credit', amount:totalAmt,
        description:`مردود #${serial}`,
        movementSerial:serial, date:ts, createdAt:serverTimestamp()
      });
    });
    showToast(`تم تسجيل المردود #${serial}`,'success');
    e.target.reset();
    document.getElementById('return-date').value = today();
    document.getElementById('return-time').value = nowTime();
    document.querySelectorAll('#return-items-rows .item-row').forEach(r=>r.remove());
    addReturnItem();
  } catch(err) { showToast(err.message||'خطأ في التسجيل','error'); }
  finally { btn.disabled=false; btn.textContent='✅ تسجيل المردود'; }
});

// ═══════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════
async function loadHistory() {
  showLoadingRow('#hist-tbody', 6);
  try {
    const snap = await getDocs(query(collection(db,'movements'), orderBy('createdAt','desc')));
    history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistory(history);
  } catch(err) { showError('#hist-tbody', err, 6); }
}

function movDesc(r) {
  switch(r.type) {
    case 'opening':    return `${escape(r.warehouseName||'—')}: ${(r.items||[]).map(i=>`${escape(i.productName)} (${i.quantity})`).join('، ')}`;
    case 'production': return `مدخلات: ${(r.inputs||[]).map(i=>escape(i.productName)).join('، ')} → مخرجات: ${(r.outputs||[]).map(o=>escape(o.productName)).join('، ')}`;
    case 'transfer':   return `${escape(r.productName||'—')} (${r.quantity||0}) من ${escape(r.fromWarehouseName||'—')} → ${escape(r.toWarehouseName||'—')}`;
    case 'sale':
    case 'return':     return (r.items||[]).map(i=>`${escape(i.productName)} ×${i.quantity}`).join('، ');
    default: return '—';
  }
}

function renderHistory(rows) {
  const tbody = document.getElementById('hist-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📭</div><p>لا توجد حركات</p></div></td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const m = MOV_META[r.type]||{label:r.type,icon:'📋',cls:'badge-gray'};
    const cancelled = r.status==='cancelled';
    return `<tr ${cancelled?'style="opacity:.5"':''}>
      <td><span class="serial">#${escape(String(r.serialNumber||'—'))}</span></td>
      <td><span class="badge ${m.cls}">${m.icon} ${m.label}</span></td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem">${movDesc(r)}</td>
      <td>${r.merchantName ? `<span class="badge badge-gray">${escape(r.merchantName)}</span>` : '—'}</td>
      <td style="font-size:.78rem;white-space:nowrap;color:var(--text-muted)">${formatDateTime(r.createdAt)}</td>
      <td>
        ${cancelled
          ? '<span class="badge badge-red">ملغى</span>'
          : `<button class="btn-icon danger" onclick="cancelMov('${r.id}')" title="إلغاء الحركة">🚫</button>`
        }
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('hist-search-btn').addEventListener('click', applyHistFilter);
document.getElementById('hist-search').addEventListener('keydown', e => { if(e.key==='Enter') applyHistFilter(); });

function applyHistFilter() {
  const q    = document.getElementById('hist-search').value.toLowerCase();
  const type = document.getElementById('hist-type').value;
  const whId = document.getElementById('hist-wh').value;
  const from = document.getElementById('hist-from').value;
  const to   = document.getElementById('hist-to').value;
  const filtered = history.filter(r => {
    if (type && r.type !== type) return false;
    if (from || to) {
      const ts = r.createdAt || r.date;
      if (!isInDateRange(ts, from, to)) return false;
    }
    if (whId) {
      const hasWh = r.warehouseId===whId || r.fromWarehouseId===whId || r.toWarehouseId===whId ||
        (r.inputs||[]).some(i=>i.warehouseId===whId) || (r.outputs||[]).some(o=>o.warehouseId===whId);
      if (!hasWh) return false;
    }
    if (q) {
      const text = `${r.serialNumber||''} ${r.productName||''} ${r.merchantName||''} ${movDesc(r)}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
  renderHistory(filtered);
}

window.cancelMov = (id) => {
  showConfirm('إلغاء هذه الحركة؟ لن يتم عكس تأثيرها على المخزون تلقائياً.', async () => {
    try {
      await updateDoc(doc(db,'movements',id), { status:'cancelled' });
      showToast('تم إلغاء الحركة','success');
      loadHistory();
    } catch { showToast('خطأ في الإلغاء','error'); }
  });
};

document.getElementById('print-hist-btn').addEventListener('click', () => {
  const rows = history.filter(r=>r.status!=='cancelled');
  const html = `<table>
    <thead><tr><th>#</th><th>النوع</th><th>التفاصيل</th><th>التاجر</th><th>التاريخ</th></tr></thead>
    <tbody>${rows.map(r=>{ const m=MOV_META[r.type]||{}; return `<tr><td>#${r.serialNumber||'—'}</td><td>${m.label||r.type}</td><td>${movDesc(r)}</td><td>${escape(r.merchantName||'—')}</td><td>${formatDateTime(r.createdAt)}</td></tr>`; }).join('')}</tbody>
  </table>`;
  printReport(html,'سجل حركات المخزن');
});

await init();
