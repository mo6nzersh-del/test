import{r as initPage,u as updateDoc,a as docRef,d as db,s as serverTimestamp,b as addDoc,c as collection,q as query,o as orderBy,e as onSnapshot,f as deleteDoc,k as writeBatch}from"./auth-guard-DMMO1gWE.js";
import{r as renderNav,s as showToast,f as formatDate}from"./nav-C4LmEyvm.js";
import{f as compressImage}from"./image-utils-ix_Ztzsr.js";

const BASE = "/";

/* ─── state ─── */
let movementType = "out";
let pendingProductFile = null;
let editingProductId = null;

let warehouses = [];
let products = [];     // all products across all warehouses (has warehouseId field)
let merchants = [];
let movements = [];

let warehousesLoaded = false;
let productsLoaded = false;

let lineCounter = 0;
let movementLines = [{ lineId: ++lineCounter, productId: "", quantity: 1 }];

/* ─── helpers ─── */
function esc(v) {
  const d = document.createElement("div");
  d.textContent = v ?? "";
  return d.innerHTML;
}

function formatMoney(v) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(v || 0) + " ج.م";
}

function formatQty(qty, type) {
  const n = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(qty || 0);
  return type ? `${n} ${type}` : n;
}

/* ─── init ─── */
initPage(user => {
  renderNav(`${BASE}products.html`, user);
  initTabs();
  initWarehouseContainerDelegation();
  initWarehouseModal();
  initProductModal();
  initReceiptModal();
  initMovementForm();
  loadMerchants();
  loadMovements();
  loadWarehouses();
  loadProducts();
});

/* ─── TABS ─── */
function initTabs() {
  const tabs = {
    movements: {
      btn: document.getElementById("tab-movements"),
      view: document.getElementById("view-movements"),
    },
    warehouses: {
      btn: document.getElementById("tab-warehouses"),
      view: document.getElementById("view-warehouses"),
    },
  };

  Object.entries(tabs).forEach(([key, { btn }]) => {
    btn.addEventListener("click", () => {
      Object.values(tabs).forEach(({ btn: b, view: v }) => {
        b.classList.remove("active");
        v.classList.remove("active");
      });
      tabs[key].btn.classList.add("active");
      tabs[key].view.classList.add("active");
    });
  });
}

/* ═══════════════════════════════════════
   WAREHOUSES  &  PRODUCTS
═══════════════════════════════════════ */

/* ── load warehouses (realtime) ── */
function loadWarehouses() {
  const q = query(collection(db, "warehouses"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    warehouses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    warehousesLoaded = true;
    if (productsLoaded) renderWarehousesContainer();
  }, err => {
    console.error(err);
    document.getElementById("warehouses-container").innerHTML =
      '<div class="empty-state">حدث خطأ في تحميل المخازن</div>';
  });
}

/* ── load ALL products (realtime) ── */
function loadProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    productsLoaded = true;
    if (warehousesLoaded) renderWarehousesContainer();
    refreshProductSelectsInMovements();
  }, err => {
    console.error(err);
  });
}

/* ── render warehouses container ── */
function renderWarehousesContainer() {
  const container = document.getElementById("warehouses-container");
  if (!container) return;

  if (warehouses.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد مخازن بعد. أضف مخزنًا أولاً.</div>';
    return;
  }

  container.innerHTML = "";
  warehouses.forEach(wh => {
    const whProducts = products.filter(p => p.warehouseId === wh.id);
    container.appendChild(buildWarehouseSection(wh, whProducts));
  });
}

/* ── build warehouse section DOM (no direct event bindings — delegated below) ── */
function buildWarehouseSection(wh, whProducts) {
  const section = document.createElement("div");
  section.className = "warehouse-section";
  section.dataset.whId = wh.id;

  const countBadge = whProducts.length > 0 ? `<span class="wh-count">${whProducts.length} منتج</span>` : "";

  section.innerHTML = `
    <div class="warehouse-section-header">
      <div class="warehouse-section-title">
        🏪 ${esc(wh.name)} ${countBadge}
      </div>
      <div class="warehouse-section-actions">
        <button type="button" class="btn small" data-wh-add="${wh.id}">+ إضافة منتج</button>
        <button type="button" class="btn small ghost" data-wh-del="${wh.id}" title="حذف المخزن">🗑</button>
      </div>
    </div>
    <div class="warehouse-section-body">
      <div class="wh-products-grid" id="wh-grid-${wh.id}">
        ${whProducts.length === 0
          ? '<div class="wh-empty-products">لا توجد منتجات في هذا المخزن بعد</div>'
          : whProducts.map(p => buildProductCardHTML(p)).join("")}
      </div>
    </div>
  `;

  return section;
}

/* ── delegated click handler on stable container ── */
function initWarehouseContainerDelegation() {
  const container = document.getElementById("warehouses-container");
  if (!container) return;

  container.addEventListener("click", e => {
    const btn = e.target.closest("button[data-wh-add], button[data-wh-del], button[data-prod-id]");
    if (!btn) return;

    if (btn.dataset.whAdd) {
      openProductModal(null, btn.dataset.whAdd);
      return;
    }
    if (btn.dataset.whDel) {
      const wh = warehouses.find(w => w.id === btn.dataset.whDel);
      if (wh) deleteWarehouse(wh.id, wh.name);
      return;
    }
    if (btn.dataset.prodId) {
      if (btn.classList.contains("edit-prod-btn")) {
        const prod = products.find(p => p.id === btn.dataset.prodId);
        if (prod) openProductModal(prod, prod.warehouseId);
      } else if (btn.classList.contains("del-prod-btn")) {
        deleteProduct(btn.dataset.prodId);
      }
    }
  });
}

/* ── build product card HTML ── */
function buildProductCardHTML(p) {
  const imgHtml = p.imageUrl
    ? `<img class="wh-product-img" src="${p.imageUrl}" alt="${esc(p.name)}" />`
    : `<div class="wh-product-img-placeholder">📦</div>`;

  return `
    <div class="wh-product-card">
      ${imgHtml}
      <div class="wh-product-info">
        <div class="wh-product-name" title="${esc(p.name)}">${esc(p.name)}</div>
        ${p.serialId ? `<div class="wh-product-serial"># ${esc(p.serialId)}</div>` : ""}
        ${p.description ? `<div class="wh-product-desc">${esc(p.description)}</div>` : ""}
        <div class="wh-product-meta">
          <div class="wh-product-qty">
            ${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(p.quantity || 0)}
            <span>${esc(p.quantityType || "")}</span>
          </div>
          <div class="wh-product-price">${p.price ? formatMoney(p.price) : "—"}</div>
        </div>
        <div class="wh-product-actions">
          <button type="button" class="edit-btn edit-prod-btn" data-prod-id="${p.id}">تعديل</button>
          <button type="button" class="del-btn del-prod-btn" data-prod-id="${p.id}">حذف</button>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════
   WAREHOUSE MODAL (add warehouse)
═══════════════════════════════════════ */
function initWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  const openBtn = document.getElementById("add-warehouse-btn");
  const closeBtn = document.getElementById("warehouse-modal-close");
  const form = document.getElementById("warehouse-form");
  const submitBtn = document.getElementById("warehouse-submit-btn");

  openBtn.addEventListener("click", () => {
    form.reset();
    modal.classList.add("open");
  });
  closeBtn.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("warehouse-name").value.trim();
    if (!name) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      await addDoc(collection(db, "warehouses"), { name, createdAt: serverTimestamp() });
      showToast("تمت إضافة المخزن بنجاح");
      modal.classList.remove("open");
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء الحفظ", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "حفظ المخزن";
    }
  });
}

async function deleteWarehouse(whId, whName) {
  const whProducts = products.filter(p => p.warehouseId === whId);
  const msg = whProducts.length > 0
    ? `سيتم حذف المخزن "${whName}" وجميع منتجاته (${whProducts.length} منتج). هل أنت متأكد؟`
    : `هل تريد حذف المخزن "${whName}"؟`;
  if (!confirm(msg)) return;
  try {
    const batch = writeBatch(db);
    /* delete all products in this warehouse */
    whProducts.forEach(p => batch.delete(docRef(db, "products", p.id)));
    batch.delete(docRef(db, "warehouses", whId));
    await batch.commit();
    showToast("تم حذف المخزن ومنتجاته");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحذف", true);
  }
}

/* ═══════════════════════════════════════
   PRODUCT MODAL (add / edit product)
═══════════════════════════════════════ */
function initProductModal() {
  const modal = document.getElementById("product-modal");
  const closeBtn = document.getElementById("product-modal-close");
  const form = document.getElementById("product-form");
  const fileInput = document.getElementById("product-image");
  const dropLabel = document.getElementById("file-drop-label");
  const preview = document.getElementById("image-preview");
  const dropText = document.getElementById("file-drop-text");
  const submitBtn = document.getElementById("product-submit-btn");

  closeBtn.addEventListener("click", closeProductModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeProductModal(); });

  dropLabel.addEventListener("click", e => { e.preventDefault(); fileInput.click(); });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    pendingProductFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    dropText.textContent = file.name;
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await saveProduct();
  });
}

function openProductModal(product, warehouseId) {
  editingProductId = product ? product.id : null;
  pendingProductFile = null;

  const modal = document.getElementById("product-modal");
  const title = document.getElementById("product-modal-title");
  const form = document.getElementById("product-form");
  const preview = document.getElementById("image-preview");
  const dropText = document.getElementById("file-drop-text");

  form.reset();
  preview.style.display = "none";
  dropText.textContent = "اضغط لاختيار صورة";

  document.getElementById("product-warehouse-id").value = warehouseId || "";

  if (product) {
    title.textContent = "تعديل المنتج";
    document.getElementById("product-id").value = product.id;
    document.getElementById("product-name").value = product.name || "";
    document.getElementById("product-serial").value = product.serialId || "";
    document.getElementById("product-desc").value = product.description || "";
    document.getElementById("product-quantity").value = product.quantity ?? "";
    document.getElementById("product-qty-type").value = product.quantityType || "قطعة";
    document.getElementById("product-price").value = product.price ?? "";
    if (product.imageUrl) {
      preview.src = product.imageUrl;
      preview.style.display = "block";
      dropText.textContent = "الصورة الحالية";
    }
  } else {
    title.textContent = "إضافة منتج";
    document.getElementById("product-id").value = "";
    /* auto-suggest serial ID */
    const wh = warehouses.find(w => w.id === warehouseId);
    if (wh) {
      const prefix = wh.name.substring(0, 3).toUpperCase().replace(/\s/g, "");
      const count = products.filter(p => p.warehouseId === warehouseId).length + 1;
      document.getElementById("product-serial").value = `${prefix}-${String(count).padStart(4, "0")}`;
    }
  }

  modal.classList.add("open");
}

function closeProductModal() {
  document.getElementById("product-modal").classList.remove("open");
  editingProductId = null;
  pendingProductFile = null;
}

async function saveProduct() {
  const name = document.getElementById("product-name").value.trim();
  if (!name) return;

  const warehouseId = document.getElementById("product-warehouse-id").value;
  const serialId = document.getElementById("product-serial").value.trim();
  const description = document.getElementById("product-desc").value.trim();
  const quantity = Number(document.getElementById("product-quantity").value) || 0;
  const quantityType = document.getElementById("product-qty-type").value;
  const price = Number(document.getElementById("product-price").value) || 0;

  const submitBtn = document.getElementById("product-submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>';

  try {
    /* handle image */
    let imageUrl = null;
    if (editingProductId) {
      imageUrl = products.find(p => p.id === editingProductId)?.imageUrl ?? null;
    }
    if (pendingProductFile) {
      imageUrl = await compressImage(pendingProductFile);
    }

    const wh = warehouses.find(w => w.id === warehouseId);
    const warehouseName = wh?.name ?? "";

    const data = {
      name,
      serialId,
      description,
      quantity,
      quantityType,
      price,
      imageUrl,
      warehouseId,
      warehouseName,
      updatedAt: serverTimestamp(),
    };

    if (editingProductId) {
      await updateDoc(docRef(db, "products", editingProductId), data);
      showToast("تم تحديث المنتج بنجاح");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
      showToast("تمت إضافة المنتج بنجاح");
    }

    closeProductModal();
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحفظ", true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ المنتج";
  }
}

async function deleteProduct(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;
  if (!confirm(`هل تريد حذف المنتج "${prod.name}"؟`)) return;
  try {
    await deleteDoc(docRef(db, "products", productId));
    showToast("تم حذف المنتج");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء الحذف", true);
  }
}

/* ═══════════════════════════════════════
   MERCHANT MOVEMENTS  (TAB 1)
═══════════════════════════════════════ */
function loadMerchants() {
  const q = query(collection(db, "merchants"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    merchants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshMerchantSelect();
  });
}

function refreshMerchantSelect() {
  const sel = document.getElementById("movement-merchant");
  const prev = sel.value;
  sel.innerHTML = '<option value="">اختر تاجرًا</option>';
  merchants.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  sel.value = prev;
}

function refreshProductSelectsInMovements() {
  renderMovementLines();
}

function refreshWarehouseSelectsInMovements() {
  /* not needed for movements but kept for completeness */
}

/* ── movement lines ── */
function renderMovementLines() {
  const container = document.getElementById("movement-lines");
  if (!container) return;
  container.innerHTML = "";

  movementLines.forEach(line => {
    const row = document.createElement("div");
    row.className = "movement-line-row";
    row.dataset.lineId = line.lineId;

    const opts = products.map(p => {
      const whName = p.warehouseName ? ` (${p.warehouseName})` : "";
      return `<option value="${p.id}" ${p.id === line.productId ? "selected" : ""}>${esc(p.name)}${esc(whName)}</option>`;
    }).join("");

    row.innerHTML = `
      <select class="line-product">
        <option value="">اختر منتجًا</option>
        ${opts}
      </select>
      <input type="number" class="line-qty" min="1" step="1" value="${line.quantity}" />
      <button type="button" class="remove-line" ${movementLines.length === 1 ? "disabled" : ""}>حذف</button>
      <div class="line-hint"></div>
    `;

    const selProd = row.querySelector(".line-product");
    const inpQty = row.querySelector(".line-qty");
    const btnRem = row.querySelector(".remove-line");
    const hint = row.querySelector(".line-hint");

    function updateHint() {
      const prod = products.find(p => p.id === selProd.value);
      if (!prod) { hint.textContent = ""; return; }
      hint.textContent = `الكمية المتوفرة: ${formatQty(prod.quantity, prod.quantityType)} · السعر: ${prod.price ? formatMoney(prod.price) : "—"}`;
    }

    selProd.addEventListener("change", () => { line.productId = selProd.value; updateHint(); });
    inpQty.addEventListener("input", () => { line.quantity = Number(inpQty.value) || 1; });
    btnRem.addEventListener("click", () => {
      movementLines = movementLines.filter(l => l.lineId !== line.lineId);
      renderMovementLines();
    });

    updateHint();
    container.appendChild(row);
  });
}

function initMovementForm() {
  const btnIn = document.getElementById("type-in");
  const btnOut = document.getElementById("type-out");

  btnIn.addEventListener("click", () => setMovementType("in"));
  btnOut.addEventListener("click", () => setMovementType("out"));

  function setMovementType(type) {
    movementType = type;
    btnIn.classList.toggle("active", type === "in");
    btnOut.classList.toggle("active", type === "out");
  }

  document.getElementById("add-line-btn").addEventListener("click", () => {
    movementLines.push({ lineId: ++lineCounter, productId: "", quantity: 1 });
    renderMovementLines();
  });

  const form = document.getElementById("movement-form");
  const submitBtn = document.getElementById("movement-submit-btn");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const merchantId = document.getElementById("movement-merchant").value;
    const validLines = movementLines.filter(l => l.productId && Number(l.quantity) > 0);

    if (!merchantId) { showToast("اختر التاجر", true); return; }
    if (validLines.length === 0) { showToast("اختر منتجًا واحدًا على الأقل مع الكمية", true); return; }

    const merchant = merchants.find(m => m.id === merchantId);
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const batch = writeBatch(db);
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const receiptItems = [];

      validLines.forEach(line => {
        const prod = products.find(p => p.id === line.productId);
        const mvRef = docRef(collection(db, "productMovements"));
        batch.set(mvRef, {
          productId: line.productId,
          productName: prod?.name ?? "",
          merchantId,
          merchantName: merchant?.name ?? "",
          type: movementType,
          quantity: Number(line.quantity),
          price: prod?.price ?? 0,
          batchId,
          createdAt: serverTimestamp(),
        });
        receiptItems.push({
          productName: prod?.name ?? "",
          quantity: Number(line.quantity),
          price: prod?.price ?? 0,
          quantityType: prod?.quantityType ?? "",
        });
      });

      await batch.commit();

      showReceipt({ id: batchId, type: movementType, merchantName: merchant?.name ?? "", items: receiptItems });
      movementLines = [{ lineId: ++lineCounter, productId: "", quantity: 1 }];
      renderMovementLines();
      document.getElementById("movement-merchant").value = "";
      showToast("تمت إضافة الحركة بنجاح");
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء الإضافة", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "إضافة الحركة";
    }
  });

  renderMovementLines();
}

/* ── load & display movements ── */
function loadMovements() {
  const container = document.getElementById("movements-list");
  const q = query(collection(db, "productMovements"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">لا توجد حركات مسجلة بعد</div>';
      return;
    }
    container.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const row = document.createElement("div");
      row.className = "record-row";
      row.innerHTML = `
        <span class="record-badge ${d.type}">${d.type === "in" ? "داخل" : "خارج"}</span>
        <div class="record-main">
          <div class="title">${esc(d.productName)} × ${d.quantity ?? 1}</div>
          <div class="meta">#${docSnap.id.slice(0, 6)} · ${esc(d.merchantName)} · ${d.createdAt ? formatDate(d.createdAt) : "الآن"}</div>
        </div>
        <button class="delete-btn" data-id="${docSnap.id}">حذف</button>
      `;
      container.appendChild(row);
    });
    container.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await deleteDoc(docRef(db, "productMovements", btn.dataset.id));
          showToast("تم الحذف");
        } catch (err) {
          console.error(err);
          showToast("حدث خطأ", true);
        }
      });
    });
  }, err => {
    console.error(err);
    container.innerHTML = '<div class="empty-state">حدث خطأ في تحميل السجل</div>';
  });
}

/* ═══════════════════════════════════════
   RECEIPT MODAL
═══════════════════════════════════════ */
function initReceiptModal() {
  const modal = document.getElementById("receipt-modal");
  document.getElementById("receipt-modal-close").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  document.getElementById("receipt-print-btn").addEventListener("click", () => window.print());
}

function showReceipt({ id, type, merchantName, items }) {
  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  document.getElementById("receipt-meta").textContent =
    `وصل رقم #${id.slice(0, 6)} · ${new Date().toLocaleString("ar-EG")}`;

  const header = `
    <div class="line"><span>نوع الحركة</span><strong>${type === "in" ? "الداخل من التاجر" : "الخارج للتاجر"}</strong></div>
    <div class="line"><span>التاجر</span><strong>${esc(merchantName)}</strong></div>
  `;
  const lines = items.map(i => `
    <div class="line">
      <span>${esc(i.productName)} × ${i.quantity} ${esc(i.quantityType || "")}</span>
      <strong>${formatMoney((i.price || 0) * i.quantity)}</strong>
    </div>
  `).join("");

  document.getElementById("receipt-lines").innerHTML = header + lines;
  document.getElementById("receipt-total").innerHTML = `<span>الإجمالي</span><span>${formatMoney(total)}</span>`;
  document.getElementById("receipt-modal").classList.add("open");
}
