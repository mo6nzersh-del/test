import{l as n}from"./auth-guard-DMMO1gWE.js";const r="/",l=[{href:"dashboard.html",label:"الرئيسية"},{href:"products.html",label:"المنتجات"},{href:"merchants.html",label:"التجار"},{href:"employees.html",label:"الموظفين"},{href:"finance.html",label:"المالية"}];function i(a,e){const t=document.getElementById("topbar");if(!t)return;const o=l.map(s=>`<a href="${r}${s.href}" class="${`${r}${s.href}`===a?"active":""}">${s.label}</a>`).join("");const mobileLinks=l.map(s=>`<a href="${r}${s.href}" class="mobile-nav-link${`${r}${s.href}`===a?" active":""}">${s.label}</a>`).join("");t.innerHTML=`
    <div class="topbar-inner">
      <div class="brand">
        <img src="https://i.imgur.com/NsN1HgC.png" alt="logo" style="height:30px;object-fit:contain;border-radius:5px;background:#fff;padding:2px 4px" onerror="this.style.display='none'" />
        <span>Ahmed And hamdy</span>
      </div>
      <nav class="nav-tabs">${o}</nav>
      <div class="user-chip">
        <span>${e?.email??""}</span>
        <button class="hamburger-btn" id="hamburger-btn" aria-label="القائمة" aria-expanded="false">
          <span class="ham-line"></span><span class="ham-line"></span><span class="ham-line"></span>
        </button>
        <button class="icon-btn" id="logout-btn">خروج</button>
      </div>
    </div>
    <div class="mobile-nav-overlay" id="mobile-nav-overlay">
      <nav class="mobile-nav-menu">${mobileLinks}</nav>
    </div>
  `;n("logout-btn");
  // Hamburger toggle
  const hBtn=document.getElementById("hamburger-btn");
  const overlay=document.getElementById("mobile-nav-overlay");
  if(hBtn&&overlay){
    hBtn.addEventListener("click",()=>{
      const open=overlay.classList.toggle("open");
      hBtn.setAttribute("aria-expanded",open?"true":"false");
      hBtn.classList.toggle("active",open);
    });
    // Close when clicking a link
    overlay.querySelectorAll(".mobile-nav-link").forEach(lnk=>{
      lnk.addEventListener("click",()=>{overlay.classList.remove("open");hBtn.classList.remove("active");hBtn.setAttribute("aria-expanded","false")});
    });
    // Close on outside click
    document.addEventListener("click",(ev)=>{
      if(!t.contains(ev.target)){overlay.classList.remove("open");hBtn.classList.remove("active");hBtn.setAttribute("aria-expanded","false")}
    });
  }
}
function m(a,e=!1){let t=document.getElementById("toast");t||(t=document.createElement("div"),t.id="toast",t.className="toast",document.body.appendChild(t)),t.textContent=a,t.className=`toast show${e?" error-toast":""}`,clearTimeout(t._t),t._t=setTimeout(()=>{t.className="toast"},2600)}function d(a){return(a instanceof Date?a:a?.toDate?a.toDate():new Date(a)).toLocaleDateString("ar-EG-u-nu-latn",{year:"numeric",month:"short",day:"numeric"})}export{d as f,i as r,m as s};
