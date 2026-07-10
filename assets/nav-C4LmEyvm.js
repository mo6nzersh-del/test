import{l as n}from"./auth-guard-DMMO1gWE.js";const r="/",l=[{href:"dashboard.html",label:"الرئيسية"},{href:"products.html",label:"المنتجات"},{href:"merchants.html",label:"التجار"},{href:"employees.html",label:"الموظفين"},{href:"finance.html",label:"المالية"}];function i(a,e){const t=document.getElementById("topbar");if(!t)return;const o=l.map(s=>`<a href="${r}${s.href}" class="${`${r}${s.href}`===a?"active":""}">${s.label}</a>`).join("");t.innerHTML=`
    <div class="topbar-inner">
      <div class="brand">
        <span class="mark">أ</span>
        <span>أحمد وحمدي</span>
      </div>
      <nav class="nav-tabs">${o}</nav>
      <div class="user-chip">
        <span>${e?.email??""}</span>
        <button class="icon-btn" id="logout-btn">خروج</button>
      </div>
    </div>
  `,n("logout-btn")}function m(a,e=!1){let t=document.getElementById("toast");t||(t=document.createElement("div"),t.id="toast",t.className="toast",document.body.appendChild(t)),t.textContent=a,t.className=`toast show${e?" error-toast":""}`,clearTimeout(t._t),t._t=setTimeout(()=>{t.className="toast"},2600)}function d(a){return(a instanceof Date?a:a?.toDate?a.toDate():new Date(a)).toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"})}export{d as f,i as r,m as s};
