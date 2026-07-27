#!/usr/bin/env node
"use strict";
const fs = require("fs");

const NEW_SCRIPT = `
<script type="module">
/* ════════════════════════════════════════════════════════════════════
   تعديل مخزون المخازن + سجل حركات كل مخزن
   — REST API فقط (لا يتطلب Firebase SDK منفصلاً)
   — المنتجات تُقرأ من الـ DOM مباشرةً
════════════════════════════════════════════════════════════════════ */

const _PROJECT = "reta-and-hamd";
const _API_KEY = "AIzaSyDQsaNVskKiV2cwPVlJDixpTD1S-Dhp7gs";
const _BASE    = "https://firestore.googleapis.com/v1/projects/" + _PROJECT + "/databases/(default)/documents";

/* ── helpers ── */
function _esc(v){ const d=document.createElement("div"); d.textContent=v??""; return d.innerHTML; }
function _num(v){ return new Intl.NumberFormat("ar-EG",{maximumFractionDigits:3}).format(v||0); }
function _dt(ts){
  const d = ts instanceof Date ? ts : new Date(ts);
  if(isNaN(d)) return "\u2014";
  return d.toLocaleString("ar-EG",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function _txId(){ return "WA-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,7).toUpperCase(); }
function _toast(msg,err){
  const t=document.createElement("div");
  t.style.cssText="position:fixed;bottom:80px;right:50%;transform:translateX(50%);z-index:99999;"
    +"padding:10px 20px;border-radius:10px;font-family:Cairo,sans-serif;font-weight:700;font-size:14px;"
    +"background:"+(err?"#dc2626":"#1a6b3a")+";color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);"
    +"pointer-events:none;";
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200);
}

/* ════════════════════════════════════
   Firebase ID Token من IndexedDB
════════════════════════════════════ */
async function _getToken(){
  return new Promise(resolve=>{
    try{
      const req=indexedDB.open("firebaseLocalStorageDb");
      req.onerror=()=>resolve(null);
      req.onsuccess=e=>{
        try{
          const idb=e.target.result;
          if(!idb.objectStoreNames.contains("firebaseLocalStorage")){resolve(null);return;}
          const store=idb.transaction(["firebaseLocalStorage"],"readonly").objectStore("firebaseLocalStorage");
          const ga=store.getAll();
          ga.onerror=()=>resolve(null);
          ga.onsuccess=()=>{
            for(const item of ga.result||[]){
              const k=item.fbase_key||item.key||"";
              if(k.includes("authUser")&&item.value?.stsTokenManager?.accessToken){
                resolve(item.value.stsTokenManager.accessToken); return;
              }
            }
            resolve(null);
          };
        }catch(e){resolve(null);}
      };
    }catch(e){resolve(null);}
  });
}

async function _getUserEmail(){
  return new Promise(resolve=>{
    try{
      const req=indexedDB.open("firebaseLocalStorageDb");
      req.onerror=()=>resolve("\u2014");
      req.onsuccess=e=>{
        try{
          const idb=e.target.result;
          if(!idb.objectStoreNames.contains("firebaseLocalStorage")){resolve("\u2014");return;}
          const store=idb.transaction(["firebaseLocalStorage"],"readonly").objectStore("firebaseLocalStorage");
          const ga=store.getAll();
          ga.onerror=()=>resolve("\u2014");
          ga.onsuccess=()=>{
            for(const item of ga.result||[]){
              if((item.fbase_key||"").includes("authUser")&&item.value?.email){
                resolve(item.value.email); return;
              }
            }
            resolve("\u2014");
          };
        }catch(e){resolve("\u2014");}
      };
    }catch(e){resolve("\u2014");}
  });
}

/* ════════════════════════════════════
   Firestore REST Helpers
════════════════════════════════════ */
function _encVal(v){
  if(v===null||v===undefined) return{nullValue:null};
  if(typeof v==="boolean")    return{booleanValue:v};
  if(typeof v==="number")     return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==="string")     return{stringValue:v};
  if(v instanceof Date)       return{timestampValue:v.toISOString()};
  if(Array.isArray(v))        return{arrayValue:{values:v.map(_encVal)}};
  if(typeof v==="object")     return{mapValue:{fields:_encFields(v)}};
  return{nullValue:null};
}
function _encFields(obj){ const f={}; for(const[k,v] of Object.entries(obj||{})) f[k]=_encVal(v); return f; }

function _decVal(v){
  if(!v) return null;
  if("stringValue"    in v) return v.stringValue;
  if("integerValue"   in v) return parseInt(v.integerValue);
  if("doubleValue"    in v) return v.doubleValue;
  if("booleanValue"   in v) return v.booleanValue;
  if("nullValue"      in v) return null;
  if("timestampValue" in v) return new Date(v.timestampValue);
  if("mapValue"       in v) return _decFields(v.mapValue?.fields);
  if("arrayValue"     in v) return(v.arrayValue?.values||[]).map(_decVal);
  return null;
}
function _decFields(fields){ const o={}; for(const[k,v] of Object.entries(fields||{})) o[k]=_decVal(v); return o; }
function _docId(name){ return name?.split("/").pop()||""; }

async function _apiCall(url,opts={}){
  const token=await _getToken();
  const headers={"Content-Type":"application/json",...(opts.headers||{})};
  if(token) headers["Authorization"]="Bearer "+token;
  const resp=await fetch(url,{...opts,headers});
  if(!resp.ok){
    const t=await resp.text().catch(()=>resp.statusText);
    throw new Error("Firestore "+resp.status+": "+t);
  }
  return resp.json();
}

async function _restUpdate(col,docId,data){
  const now=new Date();
  const allData={...data,updatedAt:now};
  const mask=Object.keys(allData).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
  const url=_BASE+"/"+col+"/"+docId+"?"+mask+"&key="+_API_KEY;
  return _apiCall(url,{method:"PATCH",body:JSON.stringify({fields:_encFields(allData)})});
}

async function _restAdd(col,data){
  const allData={...data,createdAt:new Date()};
  const url=_BASE+"/"+col+"?key="+_API_KEY;
  return _apiCall(url,{method:"POST",body:JSON.stringify({fields:_encFields(allData)})});
}

async function _restQuery(col,filters,orderField){
  const url=_BASE+":runQuery?key="+_API_KEY;
  const where=filters.length===1?{fieldFilter:{field:{fieldPath:filters[0].field},op:"EQUAL",value:_encVal(filters[0].value)}}
    :filters.length>1?{compositeFilter:{op:"AND",filters:filters.map(f=>({fieldFilter:{field:{fieldPath:f.field},op:"EQUAL",value:_encVal(f.value)}}))}}
    :undefined;
  const sq={from:[{collectionId:col}],...(where?{where}:{}),...(orderField?{orderBy:[{field:{fieldPath:orderField},direction:"DESCENDING"}]}:{})};
  const res=await _apiCall(url,{method:"POST",body:JSON.stringify({structuredQuery:sq})});
  return(Array.isArray(res)?res:[]).filter(r=>r.document)
    .map(r=>({id:_docId(r.document.name),..._decFields(r.document.fields)}));
}

/* ════════════════════════════════════
   قراءة المنتجات من الـ DOM
   (مرسومة بالفعل — لا تحتاج Firestore)
════════════════════════════════════ */
function _loadWhProducts(warehouseId,cb){
  const section=document.querySelector('.warehouse-section[data-wh-id="'+warehouseId+'"]');
  if(!section){cb([]);return;}
  const prods=[];
  section.querySelectorAll(".wh-product-card").forEach(card=>{
    const btn=card.querySelector(".edit-prod-btn[data-prod-id]");
    if(!btn) return;
    const prodId=btn.dataset.prodId;
    // الاسم: نصوص مباشرة فقط (تجنب بادج "زائر")
    const nameEl=card.querySelector(".wpc-name");
    let name="";
    if(nameEl) nameEl.childNodes.forEach(n=>{if(n.nodeType===3) name+=n.textContent;});
    name=name.trim();
    // الكمية بأرقام لاتينية (بسبب الـ locale patch في الصفحة)
    const qtyText=(card.querySelector(".wpc-qty-num")?.textContent||"0").trim().replace(/,/g,"");
    const qty=parseFloat(qtyText)||0;
    const unit=card.querySelector(".wpc-qty-unit")?.textContent?.trim()||"";
    if(prodId) prods.push({id:prodId,name:name||"?",quantity:qty,quantityType:unit});
  });
  cb(prods);
}

/* ── state ── */
let _adjWhId=null,_adjType="add",_logWhId=null;

/* ════════════════════════════════════
   حقن أزرار التعديل والسجل في كل مخزن
════════════════════════════════════ */
function _whName(section){
  const el=section.querySelector(".warehouse-section-title");
  if(!el) return "\u0627\u0644\u0645\u062e\u0632\u0646";
  let name="";
  el.childNodes.forEach(n=>{if(n.nodeType===3) name+=n.textContent;});
  return name.replace("\uD83C\uDFEA","").trim()||"\u0627\u0644\u0645\u062e\u0632\u0646";
}

function _injectBtns(section){
  if(section.dataset.adjInjected) return;
  section.dataset.adjInjected="1";
  const whId=section.dataset.whId;
  if(!whId) return;
  const actDiv=section.querySelector(".warehouse-section-actions");
  if(!actDiv) return;

  const adjBtn=document.createElement("button");
  adjBtn.type="button"; adjBtn.className="wh-adj-btn";
  adjBtn.innerHTML="\u26A1 \u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646";
  adjBtn.title="\u0625\u0636\u0627\u0641\u0629 \u0623\u0648 \u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646";
  adjBtn.addEventListener("click",()=>_openAdj(whId,section));

  const logBtn=document.createElement("button");
  logBtn.type="button"; logBtn.className="wh-log-btn";
  logBtn.innerHTML="\uD83D\uDCCB \u0633\u062c\u0644 \u0627\u0644\u062d\u0631\u0643\u0627\u062a";
  logBtn.title="\u0633\u062c\u0644 \u062d\u0631\u0643\u0627\u062a \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646";
  logBtn.addEventListener("click",()=>_openLog(whId,section));

  actDiv.prepend(logBtn);
  actDiv.prepend(adjBtn);
}

function _watchContainer(){
  const c=document.getElementById("warehouses-container");
  if(!c){setTimeout(_watchContainer,400);return;}
  c.querySelectorAll(".warehouse-section").forEach(_injectBtns);
  new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1) return;
      if(n.classList?.contains("warehouse-section")) _injectBtns(n);
      n.querySelectorAll?.(".warehouse-section").forEach(_injectBtns);
    }));
  }).observe(c,{childList:true,subtree:true});
}

/* ════════════════════════════════════
   مودال تعديل المخزون
════════════════════════════════════ */
function _setAdjType(t){
  _adjType=t;
  document.getElementById("wh-adj-type").value=t;
  document.getElementById("adj-btn-add").classList.toggle("active",t==="add");
  document.getElementById("adj-btn-consume").classList.toggle("active",t==="consume");
}
function _closeAdj(){
  document.getElementById("wh-adjust-modal").classList.remove("open");
  _adjWhId=null;
}
function _openAdj(whId,section){
  _adjWhId=whId;
  document.getElementById("wh-adj-modal-title").textContent="\u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646 \u2014 "+_whName(section);
  document.getElementById("wh-adj-wh-id").value=whId;
  document.getElementById("wh-adj-form").reset();
  document.getElementById("wh-adj-qty").value="1";
  document.getElementById("wh-adj-current-wrap").style.display="none";
  _setAdjType("add");
  const prodSel=document.getElementById("wh-adj-product");
  prodSel.innerHTML='<option value="">\u062c\u0627\u0631\u0650 \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026</option>';
  document.getElementById("wh-adjust-modal").classList.add("open");
  _loadWhProducts(whId,prods=>{
    prodSel.innerHTML='<option value="">\u0627\u062e\u062a\u0631 \u0635\u0646\u0641\u0627\u064b</option>';
    if(prods.length===0){
      prodSel.innerHTML+='<option value="" disabled>\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646</option>';
    }else{
      prods.forEach(p=>{
        const o=document.createElement("option");
        o.value=p.id; o.dataset.qty=p.quantity; o.dataset.unit=p.quantityType; o.dataset.name=p.name;
        o.textContent=p.name+" ("+_num(p.quantity)+" "+(p.quantityType||"")+")";
        prodSel.appendChild(o);
      });
    }
  });
}
function _initAdjModal(){
  const modal=document.getElementById("wh-adjust-modal");
  document.getElementById("wh-adj-close").addEventListener("click",_closeAdj);
  modal.addEventListener("click",e=>{if(e.target===modal)_closeAdj();});
  document.querySelectorAll(".adj-type-btn").forEach(btn=>{
    btn.addEventListener("click",()=>_setAdjType(btn.dataset.type));
  });
  document.getElementById("wh-adj-product").addEventListener("change",()=>{
    const opt=document.getElementById("wh-adj-product").selectedOptions[0];
    const wrap=document.getElementById("wh-adj-current-wrap");
    if(opt?.value){
      document.getElementById("wh-adj-current-qty").textContent=_num(parseFloat(opt.dataset.qty)||0)+" "+(opt.dataset.unit||"");
      wrap.style.display="block";
    }else{ wrap.style.display="none"; }
  });
  document.getElementById("wh-adj-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const whId  =document.getElementById("wh-adj-wh-id").value;
    const prodId=document.getElementById("wh-adj-product").value;
    const qty   =Number(document.getElementById("wh-adj-qty").value)||0;
    const note  =document.getElementById("wh-adj-note").value.trim();
    const type  =_adjType;
    if(!prodId){_toast("\u0627\u062e\u062a\u0631 \u0635\u0646\u0641\u0627\u064b",true);return;}
    if(qty<=0) {_toast("\u0623\u062f\u062e\u0644 \u0643\u0645\u064a\u0629 \u0635\u062d\u064a\u062d\u0629",true);return;}
    const opt      =document.getElementById("wh-adj-product").selectedOptions[0];
    const qtyBefore=parseFloat(opt?.dataset.qty||0);
    const qtyAfter =type==="add"?qtyBefore+qty:Math.max(0,qtyBefore-qty);
    const prodName =opt?.dataset.name||"";
    const prodUnit =opt?.dataset.unit||"";
    if(type==="consume"&&qty>qtyBefore){
      _toast("\u0627\u0644\u0643\u0645\u064a\u0629 ("+_num(qty)+") \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u062a\u0648\u0641\u0631 ("+_num(qtyBefore)+")",true);
      return;
    }
    const btn=document.getElementById("wh-adj-submit-btn");
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
    try{
      const section=document.querySelector('.warehouse-section[data-wh-id="'+whId+'"]');
      const whName=section?_whName(section):whId;
      const email=await _getUserEmail();
      const tid=_txId();
      await _restUpdate("products",prodId,{quantity:qtyAfter});
      await _restAdd("warehouseAdjustments",{
        warehouseId:whId,warehouseName:whName,
        productId:prodId,productName:prodName,productUnit:prodUnit,
        type,qty,qtyBefore,qtyAfter,note,txId:tid,performedBy:email,
      });
      _restAdd("auditLog",{
        action:type==="add"?"\u0625\u0636\u0627\u0641\u0629":"\u0627\u0633\u062a\u0647\u0644\u0627\u0643",
        entity:"\u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646",page:"\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a",
        details:(type==="add"?"\u0625\u0636\u0627\u0641\u0629 ":"\u0627\u0633\u062a\u0647\u0644\u0627\u0643 ")+_num(qty)+" "+prodUnit
          +" \u0645\u0646 "+prodName+" \u0641\u064a "+whName
          +" | \u0642\u0628\u0644: "+_num(qtyBefore)+" | \u0628\u0639\u062f: "+_num(qtyAfter),
        userEmail:email,
      }).catch(()=>{});
      /* تحديث DOM فوراً دون إعادة تحميل */
      try{
        if(section){
          section.querySelectorAll('.wh-product-card').forEach(function(card){
            var marker=card.querySelector('[data-prod-id="'+prodId+'"]');
            if(marker){
              var qtyEl=card.querySelector('.wpc-qty-num');
              if(qtyEl) qtyEl.textContent=_num(qtyAfter);
            }
          });
        }
      }catch(_e){}
      try{
        var selOpt=document.getElementById('wh-adj-product').selectedOptions[0];
        if(selOpt) selOpt.dataset.qty=String(qtyAfter);
      }catch(_e){}
      _toast(type==="add"?"\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0628\u0646\u062c\u0627\u062d \u2713":"\u062a\u0645 \u0627\u0644\u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u0628\u0646\u062c\u0627\u062d \u2713");
      _closeAdj();
    }catch(err){
      console.error(err);
      _toast("\u062d\u062f\u062b \u062e\u0637\u0623: "+err.message,true);
    }finally{
      btn.disabled=false; btn.textContent="\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u062a\u0639\u062f\u064a\u0644";
    }
  });
}

/* ════════════════════════════════════
   مودال سجل حركات المخزن
════════════════════════════════════ */
function _closeLog(){
  document.getElementById("wh-log-modal").classList.remove("open");
  _logWhId=null;
}
async function _openLog(whId,section){
  _logWhId=whId;
  document.getElementById("wh-log-modal-title").textContent="\uD83D\uDCCB \u0633\u062c\u0644 \u062d\u0631\u0643\u0627\u062a \u2014 "+_whName(section);
  document.getElementById("wh-log-modal").classList.add("open");
  const body=document.getElementById("wh-log-body");
  body.innerHTML='<div class="wh-log-empty">\u062c\u0627\u0631\u0650 \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026</div>';
  try{
    const docs=await _restQuery("warehouseAdjustments",[{field:"warehouseId",value:whId}],"createdAt");
    if(docs.length===0){
      body.innerHTML='<div class="wh-log-empty">\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0631\u0643\u0627\u062a \u062a\u0639\u062f\u064a\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646 \u0628\u0639\u062f</div>';
      return;
    }
    let trows="",cards="",rowNum=docs.length;
    docs.forEach(d=>{
      const seq="WA-"+String(rowNum).padStart(4,"0"); rowNum--;
      const bcls=d.type==="add"?"whadj-add":"whadj-consume";
      const blbl=d.type==="add"?"\u2795 \u0625\u0636\u0627\u0641\u0629":"\u2796 \u0627\u0633\u062a\u0647\u0644\u0627\u0643";
      const ts=d.createdAt instanceof Date?_dt(d.createdAt):"\u2014";
      const qtyStr=_num(d.qty||0)+" "+_esc(d.productUnit||"");
      const bef=_num(d.qtyBefore||0)+" "+_esc(d.productUnit||"");
      const aft=_num(d.qtyAfter||0)+" "+_esc(d.productUnit||"");
      const afterColor=d.type==="add"?"#15803d":"#dc2626";
      const noteHtml=d.note?'<br><span style="font-size:11px;color:var(--muted)">\uD83D\uDCDD '+_esc(d.note)+'</span>':"";
      const txLabel=d.txId||seq;
      trows+='<tr>'
        +'<td><span class="whadj-txid">'+_esc(txLabel)+'</span></td>'
        +'<td><span class="whadj-badge '+bcls+'">'+blbl+'</span></td>'
        +'<td style="font-weight:700;color:var(--ink)">'+_esc(d.productName||"\u2014")+'</td>'
        +'<td style="font-weight:800">'+qtyStr+'</td>'
        +'<td><div class="whadj-bal">'
          +'<span class="whadj-bal-before">'+bef+'</span>'
          +'<span class="whadj-bal-arrow">&rarr;</span>'
          +'<span class="whadj-bal-after" style="color:'+afterColor+'">'+aft+'</span>'
        +'</div></td>'
        +'<td style="font-size:11.5px;color:var(--muted);font-family:monospace;white-space:nowrap">'+ts+'</td>'
        +'</tr>';
      cards+='<div class="wh-adj-card">'
        +'<div class="wh-adj-card-head"><span class="whadj-txid">'+_esc(txLabel)+'</span><span class="whadj-badge '+bcls+'">'+blbl+'</span></div>'
        +'<div class="wh-adj-card-body">'+_esc(d.productName||"\u2014")+': '+qtyStr+noteHtml+'</div>'
        +'<div class="wh-adj-card-bal"><span>\u0642\u0628\u0644:</span><strong>'+bef+'</strong>'
          +'<span style="margin:0 4px">&rarr;</span><span>\u0628\u0639\u062f:</span>'
          +'<strong style="color:'+afterColor+'">'+aft+'</strong></div>'
        +'<div class="wh-adj-card-foot">'
          +'<span>\uD83D\uDC64 '+_esc(d.performedBy||"\u2014")+'</span>'
          +'<span style="font-family:monospace">'+ts+'</span>'
        +'</div></div>';
    });
    body.innerHTML='<div class="wh-adj-table-wrap" style="overflow-x:auto">'
      +'<table class="wh-adj-table"><thead><tr>'
      +'<th>\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062d\u0631\u0643\u0629</th>'
      +'<th>\u0627\u0644\u0646\u0648\u0639</th>'
      +'<th>\u0627\u0644\u0645\u0646\u062a\u062c</th>'
      +'<th>\u0627\u0644\u0643\u0645\u064a\u0629</th>'
      +'<th>\u0627\u0644\u0631\u0635\u064a\u062f \u0642\u0628\u0644 &rarr; \u0628\u0639\u062f</th>'
      +'<th>\u0627\u0644\u0648\u0642\u062a</th>'
      +'</tr></thead><tbody>'+trows+'</tbody></table></div>'
      +'<div class="wh-adj-cards">'+cards+'</div>';
  }catch(err){
    console.error(err);
    body.innerHTML='<div class="wh-log-empty">\u062d\u062f\u062b \u062e\u0637\u0623: '+_esc(err.message)+'</div>';
  }
}
function _initLogModal(){
  const modal=document.getElementById("wh-log-modal");
  document.getElementById("wh-log-close").addEventListener("click",_closeLog);
  modal.addEventListener("click",e=>{if(e.target===modal)_closeLog();});
}

/* ════════════════════════════════════
   Bootstrap
════════════════════════════════════ */
document.addEventListener("DOMContentLoaded",()=>{
  _initAdjModal();
  _initLogModal();
  _watchContainer();
});
<\/script>
`;

// Read current file
const filePath = "attached_assets/products_1784907068814.html";
let html = fs.readFileSync(filePath, "utf8");

// Find and replace the old script module we added
// It starts with the comment about "وادج" and ends with </script>
const OLD_START = '<script type="module">\n/* ════════════════════════════════════════════════════════════════════\n   تعديل مخزون المخازن + سجل حركات كل مخزن\n   — Firebase CDN';
const OLD_END   = '<\/script>\n</body>';

const startIdx = html.indexOf(OLD_START);
if (startIdx === -1) {
  console.error("ERROR: Could not find old script start marker!");
  console.log("Trying alternative search...");
  // Try to find it differently
  const alt = html.indexOf('<script type="module">\n/* ════');
  console.log("Alt search result:", alt);
  process.exit(1);
}

// Find the </script> after the start
const endIdx = html.indexOf("</script>", startIdx);
if (endIdx === -1) {
  console.error("ERROR: Could not find script end!");
  process.exit(1);
}

// Replace old script with new one
const newHtml = html.slice(0, startIdx) + NEW_SCRIPT + "\n" + html.slice(endIdx + "</script>".length);

fs.writeFileSync(filePath, newHtml, "utf8");
console.log("Done! Lines:", newHtml.split("\n").length);
console.log("Script start found at char:", startIdx);
console.log("Script end found at char:", endIdx);
