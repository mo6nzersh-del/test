import { requireAuth } from './auth-guard.js';
import { buildSidebar, escape, formatCurrency, formatDateTime, formatDate, getToday, getWeekStart, getMonthStart, showToast } from './utils.js';
import { auth, db, collection, query, orderBy, where, limit, getDocs, Timestamp } from './firebase.js';

await requireAuth();
buildSidebar('dashboard');

// ── Date display ──────────────────────────────────────────────────────────────
document.getElementById('dash-date').textContent =
  new Date().toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

// ── Period filter ─────────────────────────────────────────────────────────────
let dateFrom = getToday();
let dateTo   = getToday();

document.getElementById('date-from').value = getToday();
document.getElementById('date-to').value   = getToday();

document.querySelectorAll('#period-btns .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#period-btns .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = btn.dataset.period;
    const cd = document.getElementById('custom-dates');
    if (p === 'custom') { cd.style.display = 'flex'; return; }
    cd.style.display = 'none';
    const today = getToday();
    if (p === 'today') { dateFrom = today;          dateTo = today; }
    if (p === 'week')  { dateFrom = getWeekStart();  dateTo = today; }
    if (p === 'month') { dateFrom = getMonthStart(); dateTo = today; }
    if (p === 'all')   { dateFrom = '2000-01-01';    dateTo = '2099-12-31'; }
    load();
  });
});
document.getElementById('apply-dates')?.addEventListener('click', () => {
  dateFrom = document.getElementById('date-from').value;
  dateTo   = document.getElementById('date-to').value;
  if (dateFrom && dateTo) load();
});

// ── Movement type config ──────────────────────────────────────────────────────
const MOV_LABELS = {
  opening:    { label:'رصيد افتتاحي', icon:'📂', cls:'mov-opening'   },
  production: { label:'إنتاج',        icon:'⚙️',  cls:'mov-production' },
  transfer:   { label:'تحويل',        icon:'🔄', cls:'mov-transfer'  },
  sale:       { label:'تحميل/بيع',    icon:'🚚', cls:'mov-sale'      },
  return:     { label:'مردود',        icon:'↩️', cls:'mov-return'    },
};

// ── Main loader ───────────────────────────────────────────────────────────────
async function load() {
  const statsGrid = document.getElementById('stats-grid');
  const recentMov = document.getElementById('recent-movements');
  const recentFin = document.getElementById('recent-finances');
  const invSnap   = document.getElementById('inventory-snap');

  statsGrid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const from = Timestamp.fromDate(new Date(dateFrom + 'T00:00:00'));
    const to   = Timestamp.fromDate(new Date(dateTo   + 'T23:59:59'));

    // Parallel data fetches — movements & finances filtered by business date field
    const [finSnap, movSnap, empSnap, merSnap, advSnap, invDocSnap] = await Promise.all([
      getDocs(query(collection(db,'finances'),  where('date','>=',from), where('date','<=',to))),
      getDocs(query(collection(db,'movements'), where('date','>=',from), where('date','<=',to))),
      getDocs(collection(db,'employees')),
      getDocs(collection(db,'merchants')),
      getDocs(query(collection(db,'advances'),  where('date','>=',from), where('date','<=',to))),
      getDocs(collection(db,'warehouseInventory')),
    ]);

    const finances = finSnap.docs.map(d => d.data());
    const income   = finances.filter(f => f.type==='income' ).reduce((s,f) => s+(f.amount||0), 0);
    const expense  = finances.filter(f => f.type==='expense').reduce((s,f) => s+(f.amount||0), 0);
    const advances = advSnap.docs.map(d=>d.data()).reduce((s,a)=>s+(a.amount||0),0);

    const movs     = movSnap.docs.map(d => d.data());
    const movByType = {};
    movs.forEach(m => { movByType[m.type] = (movByType[m.type]||0) + 1; });

    const activeEmp = empSnap.docs.filter(d => (d.data().status||'active')==='active').length;

    // Inventory totals across all warehouses
    const invItems = invDocSnap.docs.map(d => d.data());
    const totalInvQty = invItems.reduce((s,i) => s+(i.quantity||0), 0);
    const uniqueProds = new Set(invItems.map(i=>i.productId)).size;

    // Build stats
    statsGrid.innerHTML = `
      <div class="stat-card green">
        <div class="stat-icon">💚</div>
        <div class="stat-label">إجمالي الوارد</div>
        <div class="stat-value">${formatCurrency(income)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon">❤️</div>
        <div class="stat-label">إجمالي الصادر</div>
        <div class="stat-value">${formatCurrency(expense)}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">💙</div>
        <div class="stat-label">صافي الرصيد</div>
        <div class="stat-value">${formatCurrency(income - expense)}</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon">💸</div>
        <div class="stat-label">السلف المصروفة</div>
        <div class="stat-value">${formatCurrency(advances)}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">👥</div>
        <div class="stat-label">الموظفون النشطون</div>
        <div class="stat-value">${activeEmp}</div>
        <div class="stat-sub">من أصل ${empSnap.size}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">🤝</div>
        <div class="stat-label">التجار</div>
        <div class="stat-value">${merSnap.size}</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon">📦</div>
        <div class="stat-label">إجمالي المخزون</div>
        <div class="stat-value">${totalInvQty.toLocaleString('ar-EG')}</div>
        <div class="stat-sub">${uniqueProds} منتج</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">🔄</div>
        <div class="stat-label">حركات المخزن</div>
        <div class="stat-value">${movs.length}</div>
        <div class="stat-sub">${Object.entries(movByType).map(([k,v])=>`${MOV_LABELS[k]?.label||k}: ${v}`).join(' | ')}</div>
      </div>
    `;

    // ── Recent movements ──
    const latestMov = await getDocs(query(collection(db,'movements'), orderBy('createdAt','desc'), limit(8)));
    if (latestMov.empty) {
      recentMov.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>لا توجد حركات</p></div>';
    } else {
      recentMov.innerHTML = `<div class="table-wrapper"><table><tbody>
        ${latestMov.docs.map(d => {
          const r = d.data();
          const m = MOV_LABELS[r.type] || { label: r.type, icon: '📋', cls: 'badge-gray' };
          const desc = r.type === 'production'
            ? `إنتاج: ${(r.outputs||[]).map(o=>escape(o.productName)).join('، ')}`
            : r.type === 'opening'
            ? `افتتاح: ${escape(r.warehouseName||'—')}`
            : r.type === 'transfer'
            ? `${escape(r.productName||'—')} (${r.quantity||0})`
            : (r.items||[]).map(i=>escape(i.productName)).join('، ') || '—';
          return `<tr>
            <td><span class="serial">#${escape(String(r.serialNumber||'—'))}</span></td>
            <td><span class="badge ${m.cls}">${m.icon} ${m.label}</span></td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${desc}</td>
            <td style="white-space:nowrap;color:var(--text-muted);font-size:.78rem">${formatDateTime(r.createdAt)}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
    }

    // ── Recent finances ──
    const latestFin = await getDocs(query(collection(db,'finances'), orderBy('createdAt','desc'), limit(8)));
    if (latestFin.empty) {
      recentFin.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><p>لا توجد معاملات</p></div>';
    } else {
      recentFin.innerHTML = `<div class="table-wrapper"><table><tbody>
        ${latestFin.docs.map(d => {
          const r = d.data();
          return `<tr>
            <td><span class="badge ${r.type==='income'?'badge-green':'badge-red'}">${r.type==='income'?'📥 وارد':'📤 صادر'}</span></td>
            <td><strong class="${r.type==='income'?'text-success':'text-danger'}">${formatCurrency(r.amount)}</strong></td>
            <td>${escape(r.clientName||r.description||'—')}</td>
            <td style="color:var(--text-muted);font-size:.78rem;white-space:nowrap">${formatDate(r.date)}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
    }

    // ── Inventory snapshot ──
    if (!invItems.length) {
      invSnap.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>لا يوجد مخزون مسجل بعد</p></div>';
    } else {
      // Group by product across warehouses
      const byProd = {};
      invItems.forEach(i => {
        if (!byProd[i.productId]) byProd[i.productId] = { name: i.productName, total: 0, warehouses: [] };
        byProd[i.productId].total += (i.quantity||0);
        if (i.quantity > 0) byProd[i.productId].warehouses.push({ wh: i.warehouseId, qty: i.quantity });
      });
      invSnap.innerHTML = `<div class="table-wrapper"><table>
        <thead><tr><th>المنتج</th><th>إجمالي الكمية</th></tr></thead>
        <tbody>
          ${Object.values(byProd).filter(p=>p.total>0).sort((a,b)=>b.total-a.total).map(p=>`
            <tr>
              <td><strong>${escape(p.name)}</strong></td>
              <td><span class="badge badge-green fw-black">${p.total.toLocaleString('ar-EG')} وحدة</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;
    }

  } catch (err) {
    console.error(err);
    statsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">❌</div>
      <p style="color:var(--danger)">خطأ في تحميل البيانات: ${escape(err.message||'')}</p>
    </div>`;
  }
}

load();
