import{r as R,g as s,c as u,d,e as O}from"./auth-guard-DMMO1gWE.js";import{r as H}from"./nav-C4LmEyvm.js";const L="/";let m="today",p=null,f=null;function b(e){return new Intl.NumberFormat("ar-EG",{maximumFractionDigits:2}).format(e||0)+" ج.م"}function v(e){return e?e.toDate?e.toDate():new Date(e):null}function N(e){switch(e){case"today":return"اليوم";case"week":return"آخر أسبوع";case"2weeks":return"آخر أسبوعين";case"month":return"آخر شهر";case"custom":return"الفترة المحددة";default:return""}}function A(e){const n=new Date,c=n;let o;if(e==="today")o=new Date(n),o.setHours(0,0,0,0);else if(e==="week")o=new Date(n.getTime()-10080*60*1e3);else if(e==="2weeks")o=new Date(n.getTime()-336*60*60*1e3);else if(e==="month")o=new Date(n.getTime()-720*60*60*1e3);else{if(e==="custom")return o=p?new Date(p+"T00:00:00"):new Date(0),{from:o,to:f?new Date(f+"T23:59:59"):c};o=new Date(0)}return{from:o,to:c}}R(async e=>{H(`${L}dashboard.html`,e),F(),h()});function F(){const e=document.getElementById("period-toggle"),n=document.getElementById("custom-range"),c=document.getElementById("range-apply-btn");e.querySelectorAll("button").forEach(o=>{o.addEventListener("click",()=>{e.querySelectorAll("button").forEach(l=>l.classList.remove("active")),o.classList.add("active"),m=o.dataset.period,n.style.display=m==="custom"?"flex":"none",m!=="custom"&&h()})}),c.addEventListener("click",()=>{p=document.getElementById("range-from").value,f=document.getElementById("range-to").value,!(!p&&!f)&&h()})}function M(e,n){const c=n?.dailyHours||8,o=n?.hourlyRate||0,l=n?.overtimeRate||o,g=Math.min(e,c),i=Math.max(0,e-c);return g*o+i*l}async function h(){document.getElementById("stat-payroll-label").textContent=`الرواتب المستحقة (${N(m)})`;try{const[e,n,c,o,l,g,J,K,U]=await Promise.all([s(u(d,"products")),s(u(d,"productMovements")),s(u(d,"productionMovements")),s(u(d,"merchants")),s(u(d,"employees")),s(u(d,"attendance")),s(u(d,"activityLog")),s(u(d,"finance_transactions")),s(u(d,"daily_attendance"))]),i=e.docs.map(t=>({id:t.id,...t.data()})),k=n.docs.map(t=>t.data()),x=c.docs.map(t=>t.data()),r={};k.forEach(t=>{const a=Number(t.quantity)||0;r[t.productId]=(r[t.productId]||0)+(t.type==="out"?-a:a)}),x.forEach(t=>{const a=Number(t.quantity)||0;t.toWarehouseId&&(r[t.productId]=(r[t.productId]||0)+a),t.fromWarehouseId&&(r[t.productId]=(r[t.productId]||0)-a)});let E=0,I=0;i.forEach(t=>{const a=r[t.id]||0;E+=a,I+=a*(Number(t.price)||0)}),document.getElementById("stat-products-count").textContent=i.length,document.getElementById("stat-products-qty").textContent=new Intl.NumberFormat("ar-EG").format(E),document.getElementById("stat-products-value").textContent=b(I),document.getElementById("stat-merchants-count").textContent=o.size;const w=l.docs.map(t=>({id:t.id,...t.data()}));document.getElementById("stat-employees-count").textContent=w.length;const{from:q,to:S}=A(m),C=Object.fromEntries(w.map(t=>[t.id,t]));let B=0;g.forEach(t=>{const a=t.data(),y=v(a.checkIn),D=v(a.checkOut);if(!y||!D||y<q||y>S)return;const T=C[a.employeeId],P=(D-y)/36e5;B+=M(P,T)}),document.getElementById("stat-payroll").textContent=b(B),renderRecentActivity(buildActivity(J,K,U,q,S))}catch(e){console.error(e),["stat-products-count","stat-products-qty","stat-products-value","stat-merchants-count","stat-employees-count","stat-payroll"].forEach(n=>document.getElementById(n).textContent="خطأ");const ae=document.getElementById("recent-activity-list");if(ae)ae.innerHTML='<div class="empty-state">تعذر تحميل العمليات</div>'}}

/* ── آخر العمليات (من صفحات المنتجات، التجار، الموظفين) ── */
function escHtml(e){return String(e??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

/* ── الأسماء المستعارة: email → alias ── */
let emailToAlias={};
O(u(d,"appUsers"),snap=>{emailToAlias={};snap.forEach(dc=>{const{email,alias}=dc.data();if(email&&alias)emailToAlias[email]=alias;});});
function resolveAlias(e){return(!e||e==="—")?e:(emailToAlias[e]||e);}

const ACTIVITY_ICON={
  production:["🏭","act-prod"],
  transfer:["🔁","act-transfer"],
  loading:["🚚","act-loading"],
  in:["💰","act-in"],
  out:["💸","act-out"],
  att:["🕒","act-att"],
};

function buildActivity(logSnap,finSnap,attSnap,from,to){
  const rows=[];
  logSnap.docs.forEach(doc=>{
    const d2=doc.data(),ts=v(d2.createdAt);
    if(!ts||ts<from||ts>to)return;
    rows.push({ts,kind:"log",type:d2.type,summary:d2.summary,details:d2.details,performedBy:d2.performedBy});
  });
  finSnap.docs.forEach(doc=>{
    const d2=doc.data();
    if(d2._active===false)return;
    const ts=v(d2.createdAt);
    if(!ts||ts<from||ts>to)return;
    rows.push({ts,kind:"fin",dir:d2.dir,amount:d2.amount,description:d2.description,partyName:d2.partyName,employeeName:d2.employeeName});
  });
  attSnap.docs.forEach(doc=>{
    const d2=doc.data(),ts=d2.date?new Date(d2.date+"T12:00:00"):v(d2.createdAt);
    if(!ts||ts<from||ts>to)return;
    rows.push({ts,kind:"att",employeeName:d2.employeeName,status:d2.status});
  });
  rows.sort((a,b2)=>b2.ts-a.ts);
  return rows.slice(0,12);
}

function renderRecentActivity(rows){
  const el=document.getElementById("recent-activity-list");
  if(!el)return;
  if(!rows.length){
    el.innerHTML='<div class="empty-state">لا توجد عمليات في هذه الفترة</div>';
    return;
  }
  el.innerHTML=rows.map(r=>{
    let icon,cls,title,sub;
    if(r.kind==="log"){
      const m2=ACTIVITY_ICON[r.type]||["📋","act-log"];
      icon=m2[0];cls=m2[1];
      title=escHtml(r.summary||"");
      sub=escHtml([r.details,resolveAlias(r.performedBy)].filter(Boolean).join(" — "));
    }else if(r.kind==="fin"){
      const m2=ACTIVITY_ICON[r.dir]||["💳","act-fin"];
      icon=m2[0];cls=m2[1];
      title=escHtml(r.description||(r.dir==="in"?"عملية تحصيل":"عملية صرف"));
      sub=escHtml([b(r.amount),r.partyName||r.employeeName].filter(Boolean).join(" — "));
    }else{
      icon=ACTIVITY_ICON.att[0];cls=ACTIVITY_ICON.att[1];
      title=`تسجيل حضور: ${escHtml(r.employeeName||"—")}`;
      sub=r.status==="present"?"حاضر":"غائب";
    }
    const timeStr=r.ts?r.ts.toLocaleString("ar-EG",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
    return `<div class="activity-item"><div class="activity-icon ${cls}">${icon}</div><div class="activity-body"><div class="activity-title">${title}</div>${sub?`<div class="activity-sub">${sub}</div>`:""}</div><div class="activity-time">${timeStr}</div></div>`;
  }).join("");
}
