import{l as n}from"./auth-guard-DMMO1gWE.js";
const r="/";
const ICONS={
  "dashboard.html":`<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`,
  "merchants.html":`<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`,
  "products.html":`<svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.9 18 9 18h12v-2H9.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.47 5H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
  "employees.html":`<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  "finance.html":`<svg viewBox="0 0 24 24"><path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/></svg>`,
};
const l=[
  {href:"dashboard.html",label:"الرئيسية"},
  {href:"merchants.html",label:"التجار"},
  {href:"products.html",label:"المنتجات"},
  {href:"employees.html",label:"الموظفين"},
  {href:"finance.html",label:"المالية"},
];
function i(a,e){
  const t=document.getElementById("topbar");
  if(!t)return;
  const o=l.map(s=>`<a href="${r}${s.href}" class="${`${r}${s.href}`===a?"active":""}">${s.label}</a>`).join("");
  t.innerHTML=`
    <div class="topbar-inner">
      <div class="brand">
        <img src="https://i.imgur.com/NsN1HgC.png" alt="logo" style="height:30px;object-fit:contain;border-radius:5px;background:#fff;padding:2px 4px" onerror="this.style.display='none'" />
        <span>Ahmed And hamdy</span>
      </div>
      <nav class="nav-tabs">${o}</nav>
      <div class="user-chip">
        <span>${e?.email??""}</span>
        <button class="icon-btn" id="logout-btn">خروج</button>
      </div>
    </div>`;
  n("logout-btn");
  // شريط التنقل السفلي
  let bn=document.getElementById("bottom-nav");
  if(!bn){bn=document.createElement("nav");bn.id="bottom-nav";document.body.appendChild(bn);}
  bn.innerHTML=`<div class="bot-nav-inner">${l.map(s=>`
    <a href="${r}${s.href}" class="bot-nav-item${`${r}${s.href}`===a?" active":""}">
      <span class="bot-nav-icon">${ICONS[s.href]}</span>
      <span>${s.label}</span>
    </a>`).join("")}</div>`;
}
function m(a,e=!1){let t=document.getElementById("toast");t||(t=document.createElement("div"),t.id="toast",t.className="toast",document.body.appendChild(t)),t.textContent=a,t.className=`toast show${e?" error-toast":""}`,clearTimeout(t._t),t._t=setTimeout(()=>{t.className="toast"},2600)}function d(a){return(a instanceof Date?a:a?.toDate?a.toDate():new Date(a)).toLocaleDateString("ar-EG-u-nu-latn",{year:"numeric",month:"short",day:"numeric"})}export{d as f,i as r,m as s};
