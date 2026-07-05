import { requireAuth } from './auth-guard.js';
import {
  buildSidebar, escape, showToast, showModal, closeModal, showConfirm,
  showEmpty, formatDate, resizeImage, initTabs
} from './utils.js';
import { db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, where, serverTimestamp } from './firebase.js';

await requireAuth();
buildSidebar('products');

let products   = [];
let warehouses = [];
let inventory  = [];  // all warehouseInventory docs

initTabs((tab) => {
  if (tab === 'products-tab') loadProducts();
});

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [prodSnap, whSnap, invSnap] = await Promise.all([
    getDocs(query(collection(db,'products'), orderBy('name','asc'))),
    getDocs(query(collection(db,'warehouses'), orderBy('name','asc'))),
    getDocs(collection(db,'warehouseInventory')),
  ]);
  products   = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  warehouses = whSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  inventory  = invSnap.docs.map(d => d.data());

  // Populate warehouse selector
  const sel = document.getElementById('inv-warehouse');
  sel.innerHTML = '<option value="">📊 كل المخازن (ملخص)</option>' +
    warehouses.map(w => `<option value="${w.id}">${escape(w.name)}</option>`).join('');

  renderInventory();
  loadProducts();
}

// ── Inventory display ─────────────────────────────────────────────────────────
function renderInventory() {
  const whId    = document.getElementById('inv-warehouse').value;
  const search  = document.getElementById('inv-search').value.toLowerCase();
  const display = document.getElementById('inventory-display');

  let items = inventory.filter(i => i.quantity > 0);
  if (whId)   items = items.filter(i => i.warehouseId === whId);
  if (search) items = items.filter(i => (i.productName||'').toLowerCase().includes(search));

  if (!items.length) {
    showEmpty(display, whId ? 'لا يوجد مخزون في هذا المخزن' : 'لا يوجد مخزون مسجل بعد', '📦');
    return;
  }

  if (!whId) {
    // All warehouses summary: group by product
    const byProd = {};
    items.forEach(i => {
      if (!byProd[i.productId]) {
        byProd[i.productId] = { name: i.productName, total: 0, breakdown: [] };
      }
      byProd[i.productId].total += i.quantity;
      byProd[i.productId].breakdown.push({ wh: warehouses.find(w=>w.id===i.warehouseId)?.name||'—', qty: i.quantity });
    });

    const rows = Object.values(byProd).sort((a,b)=>b.total-a.total);
    const prod  = products; // for photo
    display.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>المنتج</th><th>إجمالي الكمية</th><th>التوزيع على المخازن</th></tr></thead>
      <tbody>${rows.map(p => {
        const photo = prod.find(x=>x.name===p.name)?.photoURL;
        const breakdown = p.breakdown.map(b=>`<span class="badge badge-gray">${escape(b.wh)}: ${b.qty}</span>`).join(' ');
        return `<tr>
          <td>
            <div class="flex items-center gap-2">
              ${photo ? `<img src="${photo}" style="width:32px;height:32px;border-radius:6px;object-fit:cover">` : '<span style="font-size:1.2rem">📦</span>'}
              <strong>${escape(p.name)}</strong>
            </div>
          </td>
          <td><span class="badge badge-green fw-black" style="font-size:.9rem">${p.total.toLocaleString('ar-EG')} وحدة</span></td>
          <td style="font-size:.82rem">${breakdown}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } else {
    // Single warehouse: show products with quantities as cards
    const wh = warehouses.find(w=>w.id===whId);
    const total = items.reduce((s,i)=>s+i.quantity,0);
    display.innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card blue"><div class="stat-icon">🏭</div><div class="stat-label">${escape(wh?.name||'المخزن')}</div><div class="stat-value">${items.length} منتج</div></div>
        <div class="stat-card green"><div class="stat-icon">📦</div><div class="stat-label">إجمالي الكمية</div><div class="stat-value">${total.toLocaleString('ar-EG')}</div></div>
      </div>
      <div class="products-grid">
        ${items.sort((a,b)=>b.quantity-a.quantity).map(item => {
          const prod = products.find(p=>p.id===item.productId);
          return `<div class="product-card">
            <div class="product-img">
              ${prod?.photoURL ? `<img src="${prod.photoURL}" alt="${escape(item.productName)}" loading="lazy">` : '📦'}
            </div>
            <div class="product-info">
              <div class="product-name">${escape(item.productName)}</div>
              <div class="mt-1"><span class="product-qty">📦 ${item.quantity.toLocaleString('ar-EG')} وحدة</span></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }
}

document.getElementById('inv-warehouse').addEventListener('change', renderInventory);
document.getElementById('inv-search').addEventListener('input', renderInventory);

// ── Products management ───────────────────────────────────────────────────────
function loadProducts() {
  const search = document.getElementById('product-search').value.toLowerCase();
  const list = products.filter(p => p.name.toLowerCase().includes(search));
  renderProducts(list);
}

function renderProducts(list) {
  const grid = document.getElementById('products-grid');
  if (!list.length) { showEmpty(grid, 'لا توجد منتجات', '📦'); return; }
  grid.innerHTML = list.map(p => {
    // Total quantity across all warehouses
    const totalQty = inventory.filter(i=>i.productId===p.id).reduce((s,i)=>s+i.quantity,0);
    return `<div class="product-card">
      <div class="product-img">
        ${p.photoURL ? `<img src="${p.photoURL}" alt="${escape(p.name)}" loading="lazy">` : '📦'}
      </div>
      <div class="product-info">
        <div class="product-name">${escape(p.name)}</div>
        <div class="mt-1"><span class="product-qty">📦 ${totalQty} وحدة</span></div>
        <div class="product-actions">
          <button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('product-search').addEventListener('input', loadProducts);

document.getElementById('add-product-btn').addEventListener('click', () => {
  showModal('إضافة منتج جديد', `
    <div class="form-group"><label>اسم المنتج *</label><input name="name" class="form-control" required placeholder="اسم المنتج"></div>
    <div class="form-group"><label>صورة المنتج</label><input type="file" name="image" accept="image/*" class="form-control"></div>
  `, async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    const imgFile = body.querySelector('[name=image]').files[0];
    let photoURL = null;
    try {
      if (imgFile) photoURL = await resizeImage(imgFile);
      await addDoc(collection(db,'products'), { name, photoURL, createdAt: serverTimestamp() });
      closeModal(); showToast('تمت الإضافة','success');
      const snap = await getDocs(query(collection(db,'products'), orderBy('name','asc')));
      products = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      loadProducts();
    } catch { showToast('خطأ في الحفظ','error'); }
  });
});

window.editProduct = (id) => {
  const p = products.find(x=>x.id===id); if (!p) return;
  showModal('تعديل المنتج', `
    <div class="form-group"><label>الاسم *</label><input name="name" class="form-control" value="${escape(p.name)}" required></div>
    <div class="form-group">
      <label>صورة جديدة</label>
      ${p.photoURL?`<img src="${p.photoURL}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;margin-bottom:6px;display:block">`:''}
      <input type="file" name="image" accept="image/*" class="form-control">
    </div>
  `, async (body) => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) { showToast('الاسم مطلوب','warning'); return; }
    const imgFile = body.querySelector('[name=image]').files[0];
    let photoURL = p.photoURL||null;
    try {
      if (imgFile) photoURL = await resizeImage(imgFile);
      await updateDoc(doc(db,'products',id), { name, photoURL });
      closeModal(); showToast('تم التعديل','success');
      const snap = await getDocs(query(collection(db,'products'), orderBy('name','asc')));
      products = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      loadProducts();
    } catch { showToast('خطأ في التعديل','error'); }
  }, 'حفظ التعديل');
};

window.deleteProduct = (id) => {
  showConfirm('حذف هذا المنتج؟', async () => {
    await deleteDoc(doc(db,'products',id));
    products = products.filter(p=>p.id!==id);
    showToast('تم الحذف','success');
    loadProducts();
  });
};

await loadAll();
