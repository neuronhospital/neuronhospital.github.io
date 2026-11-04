/* Administrator Notification Card editor. Uses the existing Apps Script actions and contract. */
(() => {
  "use strict";
  const MAX_CARD_CHARS = 3900;
  const MAX_CARDS = 100;
  const MAX_PROPERTY_BYTES = 8000;
  const $ = (id) => document.getElementById(id);
  let initialized = false;
  let busy = false;
  let verified = false;
  let cards = [];
  let selectedId = null;
  let editorHtml = "";
  let expiryEpoch = 0;
  let dirty = false;
  let requestCounter = 0;
  let sessionKey = "";

  function reqId() { requestCounter += 1; return `NCARD_${makeRequestId()}_${requestCounter}`; }
  function status(message, state = "") { const el = $("notificationCardAdminStatus"); if (el) { el.textContent = message; el.dataset.state = state; } }
  function visibleContent(html) {
    return String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/&amp;|&#38;/gi, "&").replace(/&lt;|&#60;/gi, "<").replace(/&gt;|&#62;/gi, ">") .replace(/[\s\u200B\uFEFF]+/g, "").length > 0;
  }
  function safeColor(v) { return /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]{3,20}|rgba?\([0-9 ,.%]+\))$/i.test(String(v || "").trim()); }
  function safeStyle(raw) {
    const out=[];
    String(raw || "").split(";").forEach((d)=>{const p=d.split(":");if(p.length<2)return;const prop=p.shift().trim().toLowerCase(),v=p.join(":").trim().toLowerCase();if(!v||/url\(|expression|javascript|@import|var\(/i.test(v))return;let ok=false;
      if(prop==="color"||prop==="background-color")ok=safeColor(v);
      else if(prop==="text-align")ok=["left","right","center","justify"].includes(v);
      else if(prop==="font-weight")ok=/^(normal|bold|bolder|lighter|[1-9]00)$/.test(v);
      else if(prop==="font-style")ok=["normal","italic","oblique"].includes(v);
      else if(prop==="text-decoration")ok=["none","underline","line-through","overline"].includes(v);
      else if(prop==="font-size")ok=/^(?:[6-9]|[1-4][0-9])(?:px|pt|%)$|^(?:0\.[7-9]|[1-3](?:\.[0-9])?)em$/.test(v);
      else if(["margin","margin-top","margin-bottom","padding","padding-top","padding-bottom"].includes(prop))ok=/^(?:0|[0-9]{1,2}(?:px|pt|em|%))(?:\s+(?:0|[0-9]{1,2}(?:px|pt|em|%))){0,3}$/.test(v);
      else if(prop==="border-collapse")ok=["collapse","separate"].includes(v);
      else if(prop==="border")ok=/^(?:0|[0-9]{1,2}px)(?:\s+(?:solid|dashed|dotted|double))?(?:\s+(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]{3,20}))?$/i.test(v);
      else if(prop==="width")ok=/^(?:[1-9][0-9]?%|100%|[1-9][0-9]{0,2}px)$/.test(v);
      if(ok)out.push(prop+":"+v);
    });return out.join(";");
  }
  function sanitizeHtml(input, enforceLimit = false) {
    let html=String(input==null?"":input);
    if(html.length>12000)throw new Error("Notification Card content is too long.");
    if(enforceLimit&&html.length>MAX_CARD_CHARS)throw new Error("Each card is limited to 3,900 HTML-source characters.");
    html=html.replace(/<!--[\s\S]*?-->/g,"").replace(/<!\s*(?:doctype|\[CDATA\])[^>]*>/gi,"");
    const dangerous="script|style|iframe|frame|frameset|object|embed|svg|math|form|input|button|textarea|select|option|video|audio|source|img|picture|canvas|link|meta|base|applet|template";
    html=html.replace(new RegExp("<\\s*("+dangerous+")\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>","gi"),"");
    const containers="script|style|iframe|frame|frameset|object|svg|math|form|button|textarea|select|option|video|audio|picture|canvas|applet|template";
    html=html.replace(new RegExp("<\\s*("+containers+")\\b[^>]*>[\\s\\S]*$","gi"),"");
    html=html.replace(new RegExp("<\\/?\\s*("+dangerous+")\\b[^>]*>","gi"),"");
    const allowed=new Set("a b strong i em u s strike del ins p br hr ul ol li blockquote div span font h1 h2 h3 h4 h5 h6 small big sub sup code pre table thead tbody tfoot tr td th center".split(" "));
    html=html.replace(/<\s*\/?\s*([a-zA-Z0-9]+)\b([^>]*)>/g,(tag,raw,attrs)=>{
      const name=String(raw||"").toLowerCase();if(!allowed.has(name))return "";const closing=/^<\s*\//.test(tag);if(name==="br"||name==="hr")return `<${name}>`;if(closing)return `</${name}>`;
      const get=(attr)=>{const e=attr.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const m=String(attrs||"").match(new RegExp("\\b"+e+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i"));return m?String(m[1]!=null?m[1]:m[2]!=null?m[2]:m[3]):null;};
      const esc=(v)=>String(v).replace(/&(?!(?:amp|quot|#\d+|#x[0-9a-f]+);)/gi,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");const safe=[];
      if(name==="a"){const href=String(get("href")||"").trim();if((/^https?:\/\/[^\s"'<>]+$/i.test(href)&&!/[\\\u0000-\u0020]/.test(href))||/^tel:\+?[0-9]{7,15}$/i.test(href))safe.push(`href="${esc(href)}"`,`rel="noopener noreferrer"`);}
      if(name==="font"){const color=get("color");if(color&&safeColor(color))safe.push(`color="${esc(color)}"`);}
      const align=String(get("align")||"").toLowerCase();if(["p","div","table","td","th","h1","h2","h3","h4","h5","h6","center"].includes(name)&&["left","right","center","justify"].includes(align))safe.push(`align="${align}"`);
      if(name==="td"||name==="th")["colspan","rowspan"].forEach((at)=>{const n=Number(get(at));if(Number.isInteger(n)&&n>=1&&n<=12)safe.push(`${at}="${n}"`);});const style=safeStyle(get("style"));if(style)safe.push(`style="${esc(style)}"`);return `<${name}${safe.length?" "+safe.join(" "):""}>`;
    });
    if(enforceLimit&&html.length>MAX_CARD_CHARS)throw new Error("Sanitized Notification Card content exceeds 3,900 characters.");
    return visibleContent(html)?html.trim():"";
  }
  function bytes(value){return new TextEncoder().encode(value).length;}
  function propertyBytes(items){const obj={};items.forEach((c,i)=>obj[`card${i+1}`]={content:c.content,expiry:Math.max(0,Math.floor(Number(c.expiry)||0))});return bytes(JSON.stringify(obj));}
  async function call(action,payload={}){
    if(!activeUser||activeUser.admin!==true)throw new Error("Administrator access is required.");
    const id=reqId();const response=await fetchWithTimeout(BACKEND_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8","Cache-Control":"no-cache"},body:JSON.stringify({action,requestId:id,...payload,username:activeUser.username,password:activeUser.password,installationId:getInstallationId(),sessionId:activeUser.sessionId||""}),cache:"no-store",redirect:"follow"});
    if(!response.ok)throw new Error(`Request failed (HTTP ${response.status}).`);const data=await response.json();if(data.ok!==true||data.requestId!==id||data.action!==action)throw new Error(data.error||"The response could not be verified.");return data;
  }
  function normalizeCards(data){if(Array.isArray(data.cards))return data.cards.map((c,i)=>({id:String(c.id||`card${i+1}`),content:String(c.content||""),expiry:Math.max(0,Math.floor(Number(c.expiry)||0))}));const legacy=String(data.html||"");return legacy.trim()?[{id:"card1",content:legacy,expiry:0}]:[];}
  function setEditor(card){selectedId=card?card.id:null;editorHtml=card?card.content:"";expiryEpoch=card?card.expiry:0;dirty=false;render();}
  function expiryInputValue(epoch){if(!epoch)return "";const date=new Date(epoch*1000);const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);return parts.replace(" ","T");}
  function inputToEpoch(value){if(!value)return 0;const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!m)return 0;return Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-5,+m[5]-30)/1000);}
  function setBusy(value){busy=value;["notificationCardRefreshButton","notificationCardNewButton","notificationCardDeleteButton","notificationCardHtml","notificationCardExpiry","notificationCardNeverExpires","notificationCardPublishButton"].forEach(id=>{const e=$(id);if(e)e.disabled=value||!verified;});render();}
  function render(){const panel=$("notificationCardAdminPanel");if(!panel)return;panel.hidden=!(activeUser&&activeUser.admin===true);const list=$("notificationCardList");if(list){list.replaceChildren();cards.forEach((card)=>{const b=document.createElement("button");b.type="button";b.className="notification-card-list-item"+(card.id===selectedId?" is-selected":"");b.textContent=card.id+(card.expiry&&card.expiry<=Math.floor(Date.now()/1000)?" · Expired":"");b.setAttribute("aria-pressed",String(card.id===selectedId));b.disabled=busy||!verified;b.addEventListener("click",()=>setEditor(card));list.append(b);});if(!cards.length){const empty=document.createElement("p");empty.className="notification-card-list-empty";empty.textContent="No published cards. Add a new card to begin.";list.append(empty);}}
    const count=$("notificationCardCount");if(count)count.textContent=`${cards.length} / ${MAX_CARDS} cards`;
    const html=$("notificationCardHtml");if(html&&html.value!==editorHtml)html.value=editorHtml;
    const exp=$("notificationCardExpiry");if(exp&&exp.value!==expiryInputValue(expiryEpoch))exp.value=expiryInputValue(expiryEpoch);
    const chars=$("notificationCardCharacterCount");if(chars){chars.textContent=`${editorHtml.length} / ${MAX_CARD_CHARS} characters`;chars.dataset.state=editorHtml.length>MAX_CARD_CHARS?"error":"";}
    const title=$("notificationCardEditorTitle");if(title)title.textContent=selectedId?`Edit ${selectedId}`:"New card draft";
    const pub=$("notificationCardPublishButton");if(pub)pub.textContent=selectedId?"Update published card":"Publish new card";
    const preview=$("notificationCardPreview");if(preview){try{const safe=sanitizeHtml(editorHtml);preview.replaceChildren();if(safe){preview.innerHTML=safe;}else preview.textContent="This card has no visible content.";}catch(_){preview.textContent="Preview unavailable until the HTML is corrected.";}}
    const canEdit=verified&&!busy;["notificationCardHtml","notificationCardExpiry","notificationCardNeverExpires","notificationCardNewButton"].forEach(id=>{const e=$(id);if(e)e.disabled=!canEdit;});if($("notificationCardDeleteButton"))$("notificationCardDeleteButton").disabled=!canEdit||!selectedId;if(pub)pub.disabled=!canEdit||editorHtml.length>MAX_CARD_CHARS||!visibleContent(sanitizeHtml(editorHtml));
    document.querySelectorAll("[data-card-wrap],[data-card-link]").forEach(b=>b.disabled=!canEdit);
  }
  async function refresh(){if(busy||!(activeUser&&activeUser.admin===true))return;setBusy(true);verified=false;status("Loading published Notification Cards…");try{const data=await call("getAdminNotificationCard");if(!Array.isArray(data.cards)&&typeof data.html!=="string")throw new Error("The response did not include the published card set.");cards=normalizeCards(data);selectedId=cards[0]?.id||null;const first=cards[0];editorHtml=first?first.content:"";expiryEpoch=first?first.expiry:0;dirty=false;verified=true;status(`Loaded and verified ${cards.length} published card(s).`,"success");}catch(e){verified=false;status(e?.message||"Unable to load cards. Retry before editing to avoid replacing unseen content.","error");}finally{setBusy(false);}}
  async function publish(){if(busy||!verified)return;let safe;try{safe=sanitizeHtml(editorHtml,true);}catch(e){status(e.message,"error");return;}if(!safe){status("Enter visible announcement content before publishing.","error");return;}if(cards.length>=MAX_CARDS&&!selectedId){status("A maximum of 100 published cards is supported.","error");return;}const next=cards.map(c=>({...c}));const existing=next.findIndex(c=>c.id===selectedId);const item={id:selectedId||`card${next.length+1}`,content:safe,expiry:expiryEpoch};if(existing>=0)next[existing]=item;else next.push(item);if(next.length>MAX_CARDS){status("A maximum of 100 published cards is supported.","error");return;}if(propertyBytes(next)>MAX_PROPERTY_BYTES){status("Combined cards exceed the safe storage limit. Shorten content or remove a card.","error");return;}setBusy(true);status("Saving and verifying the complete published card set…");try{const data=await call("saveNotificationCard",{cards:next.map(c=>({content:c.content,expiry:c.expiry}))});const saved=normalizeCards(data);if(!Array.isArray(data.cards))throw new Error("Save response did not contain the saved card list.");if(saved.length!==next.length||saved.some((c,i)=>c.content!==next[i].content||c.expiry!==next[i].expiry))throw new Error("The saved cards differ from the requested set. Refresh to verify.");cards=saved;selectedId=saved[existing>=0?existing:saved.length-1]?.id||null;const current=saved.find(c=>c.id===selectedId);editorHtml=current?.content||"";expiryEpoch=current?.expiry||0;dirty=false;verified=true;status(`Published card set saved and verified (${cards.length} card(s)).`,"success");}catch(e){verified=false;status(e?.message||"Save could not be confirmed. Refresh before retrying.","error");}finally{setBusy(false);}}
  async function deleteSelected(){if(!selectedId||busy||!verified)return;const card=cards.find(c=>c.id===selectedId);if(!card)return;if(!await NeuronCore.confirmAction(`Delete ${selectedId}?`,{detail:"This removes it from the published notification set. This cannot be undone."}))return;const next=cards.filter(c=>c.id!==selectedId);setBusy(true);status("Saving the updated published card set…");try{const data=await call("saveNotificationCard",{cards:next.map(c=>({content:c.content,expiry:c.expiry}))});const saved=normalizeCards(data);if(!Array.isArray(data.cards)||saved.length!==next.length||saved.some((c,i)=>c.content!==next[i].content||c.expiry!==next[i].expiry))throw new Error("Deletion could not be verified against the returned card list.");cards=saved;const nextCard=saved[Math.max(0,cards.length-1)]||null;selectedId=nextCard?.id||null;editorHtml=nextCard?.content||"";expiryEpoch=nextCard?.expiry||0;verified=true;status(saved.length?`${card.id} deleted and verified.`:"All published notification cards deleted.","success");}catch(e){verified=false;status(e?.message||"Delete could not be confirmed. Refresh before retrying.","error");}finally{setBusy(false);}}
  function wrap(open,close){const field=$("notificationCardHtml");const start=field.selectionStart,end=field.selectionEnd,selected=editorHtml.slice(start,end);editorHtml=editorHtml.slice(0,start)+open+selected+close+editorHtml.slice(end);dirty=true;render();field.focus();field.setSelectionRange(start+open.length,start+open.length+selected.length);}
  function initialize(){const admin=!!(activeUser&&activeUser.admin===true);render();if(!admin)return;const sk=`${activeUser.username||""}|${activeUser.sessionId||""}`;if(sessionKey&&sessionKey!==sk){verified=false;cards=[];selectedId=null;editorHtml="";expiryEpoch=0;dirty=false;}sessionKey=sk;if(!initialized){initialized=true;$("notificationCardRefreshButton")?.addEventListener("click",refresh);$("notificationCardNewButton")?.addEventListener("click",()=>{selectedId=null;editorHtml="";expiryEpoch=0;dirty=false;status("New card draft. Publish it when ready.");render();});$("notificationCardDeleteButton")?.addEventListener("click",deleteSelected);$("notificationCardPublishButton")?.addEventListener("click",publish);$("notificationCardHtml")?.addEventListener("input",e=>{editorHtml=e.target.value;dirty=true;render();});$("notificationCardExpiry")?.addEventListener("change",e=>{expiryEpoch=inputToEpoch(e.target.value);dirty=true;render();});$("notificationCardNeverExpires")?.addEventListener("click",()=>{expiryEpoch=0;dirty=true;render();});document.querySelectorAll("[data-card-wrap]").forEach(b=>b.addEventListener("click",()=>{const tag=b.dataset.cardWrap;const tags={b:["<b>","</b>"],i:["<i>","</i>"],u:["<u>","</u>"],p:["<p>","</p>"],ul:["<ul><li>","</li></ul>"]};wrap(...tags[tag]);}));document.querySelectorAll("[data-card-link]").forEach(b=>b.addEventListener("click",()=>{const type=b.dataset.cardLink;wrap(type==="tel"?'<a href="tel:+919730036376">':'<a href="https://example.com">',"</a>");}));}
    if(!verified)refresh();}
  window.NeuronNotificationCardAdmin=Object.freeze({initialize,refresh});
})();
