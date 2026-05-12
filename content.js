function e(e,t){let n=e.split(`
`),r=0,i=t,a={};for(;r<n.length;){let e=n[r].trim();if(!e){r++;continue}let t=e.match(/^#\s*@name\s+(.+)$/i);if(t){i=t[1].trim(),r++;continue}let o=e.match(/^@(\w+)\s*:?=\s*(.*)$/);if(o){a[o[1]]=o[2].trim(),r++;continue}if(e.startsWith(`#`)||e.startsWith(`//`)){r++;continue}break}if(r>=n.length)return null;let o=n[r].trim().match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(https?:\/\/\S+|\/.*|\{\{[^}]+\}\}\S*)(?:\s+HTTP\/[\d.]+)?$/i);if(!o)return null;let s=o[1].toUpperCase(),c=o[2];r++;let l={};for(;r<n.length&&n[r].trim()!==``;){let e=n[r].match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);e&&(l[e[1].trim()]=e[2].trim()),r++}r++;let u=[],d=[];for(;r<n.length;){let e=n[r].trim();e.startsWith(`??`)?d.push(e.slice(2).trim()):u.push(n[r]),r++}return{name:i,method:s,url:c,headers:l,body:u.join(`
`).trim()||null,assertions:d,localVars:a}}function t(t){let n=[],r=t.split(/(^###[^\n]*$)/m),i={};if(r[0]){for(let e of r[0].split(`
`)){let t=e.trim().match(/^@(\w+)\s*:?=\s*(.*)$/);t&&(i[t[1]]=t[2].trim())}let t=e(r[0],null);t&&(t.localVars={...i,...t.localVars},n.push(t))}for(let t=1;t<r.length;t+=2){let a=r[t].match(/^###\s+(.+)$/),o=e(r[t+1]||``,a?a[1].trim():null);o&&(o.localVars={...i,...o.localVars},n.push(o))}return n}function n(e,t,n){let r=0,i=0;for(;;){let a=e.indexOf(t,r);if(a===-1)return-1;r=a+1;let o=e[a+t.length];if(!(o!==void 0&&!/[\s\r\n]/.test(o))){if(i===n)return a;i++}}}function r(e,t,r=0){let i=e.value,a=n(i,t,r);if(a===-1)return 0;let o=getComputedStyle(e),s=document.createElement(`div`);s.style.cssText=[`position:fixed`,`visibility:hidden`,`top:0`,`left:-99999px`,`white-space:pre-wrap`,`word-wrap:break-word`,`box-sizing:border-box`,`overflow:hidden`].join(`;`),s.style.width=e.offsetWidth+`px`;for(let e of[`fontFamily`,`fontSize`,`fontWeight`,`fontStyle`,`letterSpacing`,`lineHeight`,`paddingTop`,`paddingRight`,`paddingBottom`,`paddingLeft`]){let t=o.getPropertyValue(e);t&&s.style.setProperty(e,t)}let c=document.createElement(`span`);c.textContent=i.slice(0,a);let l=document.createElement(`span`);l.textContent=t[0]||` `,s.appendChild(c),s.appendChild(l),document.body.appendChild(s);let u=s.getBoundingClientRect(),d=l.getBoundingClientRect();return document.body.removeChild(s),Math.max(0,d.top-u.top)}function i(e,t,i=0){let a=t.method+` `+t.url;if(e.tagName===`TEXTAREA`)return r(e,a,i);try{let t=e.textContent,r=n(t,a,i);if(r===-1)return 0;let o=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),s=0,c;for(;c=o.nextNode();){let t=c.textContent.length;if(s<=r&&r<s+t){let n=r-s,i=document.createRange();i.setStart(c,n),i.setEnd(c,Math.min(n+1,t));let a=i.getBoundingClientRect(),o=e.getBoundingClientRect();return Math.max(0,a.top-o.top)}s+=t}}catch{}return 0}function a(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function o(e){try{let t=new URL(e);return t.pathname+(t.search||``)}catch{return e.length>50?e.slice(0,50)+`…`:e}}function s(e,t){if(!e)return`(empty)`;if(t?.includes(`json`))try{return JSON.stringify(JSON.parse(e),null,2)}catch{}return e.length>5e3?e.slice(0,5e3)+`
…(truncated)`:e}function c(e){let t=`curl -X ${e.method} '${e.url}'`;for(let[n,r]of Object.entries(e.headers||{}))t+=` \\\n  -H '${n}: ${r}'`;return e.body&&(t+=` \\\n  -d '${e.body.replace(/'/g,`'\\''`)}'`),t}var l=class{constructor(e){this.src=e,this.pos=0}peek(){return this.src[this.pos]??`\0`}advance(){return this.src[this.pos++]??`\0`}skipWs(){for(;this.pos<this.src.length&&/\s/.test(this.src[this.pos]);)this.pos++}next(){if(this.skipWs(),this.pos>=this.src.length)return{type:`eof`};let e=this.peek();if(/[0-9]/.test(e)||e===`-`&&/[0-9]/.test(this.src[this.pos+1])){let t=``;for(e===`-`&&(t=`-`,this.pos++);this.pos<this.src.length&&/[0-9.]/.test(this.src[this.pos]);)t+=this.advance();return{type:`num`,value:parseFloat(t)}}if(e===`'`||e===`"`){let t=e;this.pos++;let n=``;for(;this.pos<this.src.length&&this.src[this.pos]!==t;){let e=this.advance();e===`\\`?n+=this.advance():n+=e}return this.pos++,{type:`str`,value:n}}if(/[a-zA-Z_$]/.test(e)){let e=``;for(;this.pos<this.src.length&&/[a-zA-Z_$0-9]/.test(this.src[this.pos]);)e+=this.advance();switch(e){case`true`:return{type:`bool`,value:!0};case`false`:return{type:`bool`,value:!1};case`null`:return{type:`null`};case`undefined`:return{type:`undefined`};default:throw Error(`Unknown identifier: ${e}`)}}let t=e+this.src[this.pos+1];if([`==`,`!=`,`<=`,`>=`].includes(t))return this.pos+=2,{type:`op`,value:t};if([`+`,`-`,`*`,`/`,`%`,`<`,`>`].includes(e))return this.pos++,{type:`op`,value:e};if(e===`(`||e===`)`)return this.pos++,{type:`paren`,value:e};if(e===`?`)return this.pos++,{type:`q`};if(e===`:`)return this.pos++,{type:`colon`};throw Error(`Unexpected character: ${e}`)}},u=class{constructor(e){this.tokenizer=e,this.tok={type:`eof`},this.advance()}advance(){this.tok=this.tokenizer.next()}expect(e){if(this.tok.type!==e)throw Error(`Expected ${e}, got ${this.tok.type}`);this.advance()}parse(){let e=this.ternary();if(this.tok.type!==`eof`)throw Error(`Unexpected trailing tokens`);return e}ternary(){let e=this.or();if(this.tok.type===`q`){this.advance();let t=this.ternary();this.expect(`colon`);let n=this.ternary();return e?t:n}return e}or(){let e=this.compare();for(;this.tok.type===`op`&&(this.tok.value===`==`||this.tok.value===`!=`);){let t=this.tok.value;this.advance();let n=this.compare();e=t===`==`?e==n:e!=n}return e}compare(){let e=this.add();for(;this.tok.type===`op`&&[`<`,`>`,`<=`,`>=`].includes(this.tok.value);){let t=this.tok.value;this.advance();let n=this.add();switch(t){case`<`:e=Number(e)<Number(n);break;case`>`:e=Number(e)>Number(n);break;case`<=`:e=Number(e)<=Number(n);break;case`>=`:e=Number(e)>=Number(n);break}}return e}add(){let e=this.mul();for(;this.tok.type===`op`&&(this.tok.value===`+`||this.tok.value===`-`);){let t=this.tok.value;this.advance();let n=this.mul();e=t===`+`?typeof e==`string`||typeof n==`string`?String(e)+String(n):Number(e)+Number(n):Number(e)-Number(n)}return e}mul(){let e=this.unary();for(;this.tok.type===`op`&&[`*`,`/`,`%`].includes(this.tok.value);){let t=this.tok.value;this.advance();let n=this.unary(),r=Number(e),i=Number(n);switch(t){case`*`:e=r*i;break;case`/`:e=i===0?NaN:r/i;break;case`%`:e=i===0?NaN:r%i;break}}return e}unary(){if(this.tok.type===`op`&&this.tok.value===`-`){this.advance();let e=this.primary();return-Number(e)}return this.primary()}primary(){let e=this.tok;switch(e.type){case`num`:return this.advance(),e.value;case`str`:return this.advance(),e.value;case`bool`:return this.advance(),e.value;case`null`:return this.advance(),null;case`undefined`:this.advance();return;case`paren`:if(e.value===`(`){this.advance();let e=this.ternary();return this.expect(`paren`),e}throw Error(`Unexpected )`);default:throw Error(`Unexpected token: ${e.type}`)}}};function d(e){let t=e.trim();if(!t)return``;try{return new u(new l(t)).parse()}catch{return}}function f(e){switch(e){case`$uuid`:case`$guid`:return crypto.randomUUID();case`$timestamp`:return String(Date.now());case`$randomInt`:return String(Math.floor(Math.random()*1e3));case`$datetime`:return new Date().toISOString();case`$localDatetime`:return new Date().toLocaleString();default:return null}}var p={},m=0,h=new WeakMap,g=[];function ee(){chrome.storage.local.get(`variables`,({variables:e})=>{p=e??{}}),chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.variables&&(p=e.variables.newValue??{},m++,g.forEach(e=>e()))})}function te(e){g.push(e)}function ne(e){let t=h.get(e);if(t&&t.v===m)return t.r;let n={...p,...e.localVars??{}},r=e=>{if(!e)return!1;let t=/\{\{(=?)([\s\S]*?)\}\}/g,r;for(;(r=t.exec(e))!==null;){let e=r[1],t=r[2].trim();if(e!==`=`&&f(t)===null&&n[t]===void 0)return!0}return!1},i=r(e.url)||Object.values(e.headers??{}).some(r)||r(e.body);return h.set(e,{v:m,r:i}),i}function _(e,t){let n={...t,...e.localVars??{}},r=e=>String(e??``).replace(/\{\{(=?)([\s\S]*?)\}\}/g,(e,t,r)=>{let i=r.trim();if(t===`=`){let t=d(i);return t===void 0?e:String(t)}let a=f(i);return a===null?n[i]??e:a}),i=r(e.url);return i.startsWith(`/`)&&n.host&&(i=n.host.replace(/\/$/,``)+i),{...e,url:i,headers:Object.fromEntries(Object.entries(e.headers).map(([e,t])=>[e,r(t)])),body:e.body?r(e.body):null}}function re(e,t,n){if(e.startsWith(`=`))return`computed`;let r=e.trim();if(r.length===0||f(r)!==null||(n??p)[r]!==void 0)return`resolved`;for(let e of t)if(e.localVars?.[r]!==void 0)return`resolved`;return`unresolved`}var ie={resolved:`background:rgba(34,197,94,0.12);outline:1px solid rgba(34,197,94,0.35);border-radius:2px;padding:0 1px;`,unresolved:`background:rgba(239,68,68,0.12);outline:1px solid rgba(239,68,68,0.35);border-radius:2px;padding:0 1px;`,computed:`background:rgba(59,130,246,0.12);outline:1px solid rgba(59,130,246,0.35);border-radius:2px;padding:0 1px;`};function ae(e,t){if(e.tagName===`TEXTAREA`||!e.isConnected)return;let n=e.querySelectorAll(`[data-http-owl-v]`);for(let e=n.length-1;e>=0;e--){let t=n[e],r=document.createTextNode(t.textContent??``);t.parentNode.replaceChild(r,t)}let r=[],i=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),a;for(;a=i.nextNode();){let e=a.textContent.split(/(\{\{[\s\S]*?\}\})/);if(e.length<=1)continue;let n=[];for(let r of e){if(r.startsWith(`{{`)&&r.endsWith(`}}`)){let e=re(r.slice(2,-2),t);if(e){let t=document.createElement(`span`);t.setAttribute(`data-http-owl-v`,e),t.style.cssText=ie[e],t.textContent=r,n.push(t);continue}}n.push(r)}n.length>0&&r.push({node:a,parts:n})}for(let{node:e,parts:t}of r){let n=e.parentNode,r=document.createDocumentFragment();for(let e of t)r.appendChild(typeof e==`string`?document.createTextNode(e):e);n.replaceChild(r,e)}}var oe=`* { box-sizing: border-box; margin: 0; padding: 0; }

:host { display: block; width: 100%; height: 100%; }

.pills {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.pill-wrap {
  position: absolute;
  display: inline-flex;
  align-items: stretch;
  gap: 6px;
  pointer-events: auto;
  user-select: none;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  white-space: nowrap;
  letter-spacing: 0.02em;
  background: rgba(13, 17, 23, 0.88);
  border: 1px solid rgba(48, 54, 61, 0.75);
  border-radius: 20px;
  color: rgba(139, 148, 158, 0.9);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.pill-wrap:hover .pill {
  background: #21262d;
  border-color: #8b949e;
  color: #e6edf3;
}

.pill-wrap.running .pill {
  background: rgba(13, 17, 23, 0.88);
  border-color: #388bfd;
  color: #58a6ff;
  animation: pulse-border 1.8s ease-in-out infinite;
}
.pill-wrap.success .pill {
  background: rgba(13, 17, 23, 0.88);
  border-color: #2ea043;
  color: #3fb950;
}
.pill-wrap.success:hover .pill { background: #161b22; }
.pill-wrap.error .pill {
  background: rgba(13, 17, 23, 0.88);
  border-color: #da3633;
  color: #f85149;
}
.pill-wrap.error:hover .pill { background: #161b22; }
.pill-wrap.warn .pill {
  background: rgba(13, 17, 23, 0.88);
  border-color: #9e6a03;
  color: #d29922;
}
.pill-wrap.warn:hover .pill { background: #161b22; }

@keyframes pulse-border {
  0%, 100% { border-color: #388bfd; }
  50%       { border-color: #58a6ff; }
}

.dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  opacity: 0.7;
}

.icon { display: inline-block; }
.spin { animation: spin 0.65s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.assert-badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 8px;
  margin-left: 2px;
  font-weight: 600;
  background: #21262d;
  letter-spacing: 0;
}
.pill-wrap.success .assert-badge.fail { background: #7f1d1d22; color: #f85149; }

/* permanent details button on the right of the pill */
.details-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 20px;
  min-width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(13, 17, 23, 0.88);
  border: 1px solid rgba(48, 54, 61, 0.75);
  border-radius: 50%;
  color: #6b7280;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  line-height: 1;
}
.details-btn:hover {
  background: #21262d;
  border-color: #8b949e;
  color: #e6edf3;
}
`;function se(e,t,n,r,i=8){e.innerHTML=`<style>${oe}</style>
    <div class="pills" role="toolbar" aria-label="HTTP request actions">
      ${t.map((e,t)=>{let i=n[t],s=(r?.[t]??0)+6,c=``,l=``,u=``;if(!i)c=``,l=`<span class="icon">▶</span>`,u=a(e.method);else if(i.state===`running`)c=`running`,l=`<span class="icon spin">↻</span>`,u=a(e.method);else{let e=i.assertResults??[],t=e.filter(e=>!e.pass).length,n=e.length?`<span class="assert-badge ${t?`fail`:``}">${t?`\u2717${t}/${e.length}`:`\u2713${e.length}`}</span>`:``;i.ok?(c=`success`,l=`<span class="icon">✓</span>`,u=`${i.status}${n}`):(c=`error`,l=`<span class="icon">✗</span>`,u=`${i.status>0?i.status:`ERR`}${n}`)}let d=!i&&ne(e)?`warn`:``,f=d?` title="Unresolved variables"`:``,p=a(e.method),m=e.name?`${p} ${a(e.name)}`:`${p} ${a(o(e.url))}`;return`<div class="pill-wrap ${c} ${d}" data-idx="${t}" style="top:${s}px;left:4px">
          <div class="pill" data-action="run" data-idx="${t}"${f}>
            <span class="dot"></span>
            ${l}
            ${u}
          </div>
          <button class="details-btn" data-action="details" data-idx="${t}" aria-label="Details for ${m}" title="Details">\u2197</button>
        </div>`}).join(``)}
    </div>`}function v(e,t){let n=t.trim();if(/^header\s+/i.test(n)){let t=n.slice(7).trim().toLowerCase(),r=e.header??{};return r[t]??r[Object.keys(r).find(e=>e.toLowerCase()===t)]}let r=n.split(`.`),i=e;for(let e of r){if(i==null)return;let t=e.match(/^(.+?)\[(\d+)\]$/);i=t?i[t[1]]?.[+t[2]]:i[e]}return i}function ce(e){let t=e.trim();if(t===`null`)return null;if(t===`true`)return!0;if(t===`false`)return!1;if(t!==`undefined`)return/^-?\d+(\.\d+)?$/.test(t)?Number(t):/^["'].*["']$/.test(t)?t.slice(1,-1):t}function le(e,t){let n=e.trim(),r=n.match(/^(.+?)\s+(exists|isTrue|isFalse|isNumber|isBoolean|isString|isArray)$/i);if(r){let e=v(t,r[1]);switch(r[2].toLowerCase()){case`exists`:return{expr:n,pass:e!=null,actual:e};case`istrue`:return{expr:n,pass:e===!0,actual:e};case`isfalse`:return{expr:n,pass:e===!1,actual:e};case`isnumber`:return{expr:n,pass:typeof e==`number`,actual:typeof e};case`isboolean`:return{expr:n,pass:typeof e==`boolean`,actual:typeof e};case`isstring`:return{expr:n,pass:typeof e==`string`,actual:typeof e};case`isarray`:return{expr:n,pass:Array.isArray(e),actual:typeof e}}}for(let e of[`startsWith`,`endsWith`,`includes`,`contains`,`matches`,`!=`,`==`,`<=`,`>=`,`<`,`>`]){let r=([`<`,`>`,`==`,`!=`,`<=`,`>=`].includes(e),` ${e} `),i=n.indexOf(r);if(i===-1)continue;let a=n.slice(0,i).trim(),o=n.slice(i+r.length),s=v(t,a),c=ce(o),l;switch(e){case`==`:l=s==c;break;case`!=`:l=s!=c;break;case`<`:l=Number(s)<Number(c);break;case`>`:l=Number(s)>Number(c);break;case`<=`:l=Number(s)<=Number(c);break;case`>=`:l=Number(s)>=Number(c);break;case`includes`:case`contains`:l=Array.isArray(s)?s.includes(c):String(s??``).includes(String(c));break;case`startsWith`:l=String(s??``).startsWith(String(c));break;case`endsWith`:l=String(s??``).endsWith(String(c));break;case`matches`:try{l=new RegExp(c).test(String(s??``))}catch{l=!1}break;default:l=!1}return{expr:n,pass:l,actual:s,expected:c,op:e}}let i=v(t,n);return{expr:n,pass:!!i,actual:i,expected:`truthy`}}function ue(e,t){if(!e?.length)return[];let n;try{n=JSON.parse(t.body)}catch{n=t.body??``}let r={status:t.status,body:n,duration:t.time,header:t.headers??{}};return e.map(e=>{try{return le(e,r)}catch(t){return{expr:e,pass:!1,actual:null,expected:null,error:t.message}}})}var de=`* { box-sizing: border-box; margin: 0; padding: 0; }

.backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  animation: fade-in 0.14s ease;
}
.backdrop.hidden { display: none; }

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  width: 100%;
  max-width: 680px;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03);
  animation: rise 0.16s ease;
  overflow: hidden;
}
@keyframes rise {
  from { transform: translateY(12px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0)    scale(1);    opacity: 1; }
}

/* Header */
.card-head {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 13px 16px;
  border-bottom: 1px solid #30363d;
  background: #0d1117;
  flex-shrink: 0;
}
.badge {
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  font-family: monospace; letter-spacing: 0.05em; flex-shrink: 0;
}
.m-GET    { background: #0d419d28; color: #58a6ff; }
.m-POST   { background: #14532d28; color: #3fb950; }
.m-PUT    { background: #78350f28; color: #d29922; }
.m-DELETE { background: #7f1d1d28; color: #f85149; }
.m-PATCH  { background: #4c1d9528; color: #bc8cff; }
.m-HEAD,.m-OPTIONS { background: #1c3a4a28; color: #79c0ff; }
.m-OTHER  { background: #21262d; color: #8b949e; }

.req-name { color: #8b949e; font-size: 11.5px; flex-shrink: 0; }
.req-url  {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px; color: #e6edf3;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.status-code {
  font-weight: 700; font-family: monospace; font-size: 13px; flex-shrink: 0;
}
.s-2xx { color: #3fb950; }
.s-3xx { color: #58a6ff; }
.s-4xx { color: #d29922; }
.s-5xx { color: #f85149; }
.s-net { color: #8b949e; }
.res-time { color: #8b949e; font-size: 11px; flex-shrink: 0; }

.close-btn {
  margin-left: auto; flex-shrink: 0;
  padding: 3px 9px;
  background: transparent; border: 1px solid #30363d; border-radius: 5px;
  color: #8b949e; font-size: 12px; cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.close-btn:hover { color: #f85149; border-color: rgba(248,81,73,0.6); }

/* Body */
.card-body { flex: 1; overflow-y: auto; }
.card-body::-webkit-scrollbar { width: 5px; }
.card-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

.section { padding: 13px 16px; border-bottom: 1px solid #21262d; }
.section:last-child { border-bottom: none; }

.sec-title {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.09em;
  text-transform: uppercase; color: #8b949e; margin-bottom: 9px;
}

.kv { display: grid; grid-template-columns: 110px 1fr; gap: 4px 10px; margin-bottom: 6px; }
.k  { color: #8b949e; font-size: 12px; white-space: nowrap; padding-top: 1px; }
.v  {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px; color: #e6edf3; word-break: break-all;
}

.sub { font-size: 11px; color: #6b7280; margin: 10px 0 5px; font-weight: 500; }

pre.code {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 9px 11px;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 11px; color: #e6edf3;
  white-space: pre-wrap; word-break: break-all;
  max-height: 260px; overflow-y: auto; line-height: 1.55;
  margin: 0;
}
pre.code::-webkit-scrollbar { width: 4px; }
pre.code::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
pre.code.body-err {
  border-color: #da3633;
  background: #1a0f0f;
}

.muted { color: #6b7280; font-size: 12px; font-style: italic; }

.err-type {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.err-type.s-net {
  background: rgba(127, 29, 29, 0.2);
  color: #f85149;
}
.err-hint {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.55;
  color: #8b949e;
  padding: 8px 10px;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  border-left: 3px solid #f85149;
}

.assert-row {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 4px 8px;
  padding: 5px 0;
  border-bottom: 1px solid #21262d;
  align-items: start;
  font-size: 12px;
}
.assert-row:last-child { border-bottom: none; }
.a-icon { font-weight: 700; font-size: 12px; }
.a-icon.ok  { color: #3fb950; }
.a-icon.err { color: #f85149; }
.a-expr { font-family: monospace; font-size: 11px; color: #c9d1d9; }
.a-got  {
  grid-column: 2;
  font-family: monospace; font-size: 10.5px;
  color: #8b949e; margin-top: 2px;
}
.a-got code { color: #f85149; background: #21262d; padding: 1px 4px; border-radius: 3px; }

.running-msg {
  display: flex; align-items: center; gap: 8px;
  color: #58a6ff; font-size: 12px; padding: 4px 0;
}
.running-spin { animation: spin 0.65s linear infinite; display: inline-block; }

@keyframes spin { to { transform: rotate(360deg); } }

/* Footer */
.card-foot {
  display: flex; gap: 7px; align-items: center;
  padding: 11px 16px;
  border-top: 1px solid #30363d;
  background: #0d1117;
  flex-shrink: 0;
}
.foot-btn {
  padding: 5px 12px;
  background: #21262d; border: 1px solid #30363d; border-radius: 6px;
  color: #c9d1d9; font-size: 12px; cursor: pointer; font-family: inherit;
  transition: background 0.12s;
}
.foot-btn:hover:not(:disabled) { background: #30363d; }
.foot-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.foot-run {
  background: #0f2d16; border-color: #238636; color: #3fb950;
}
.foot-run:hover:not(:disabled) { background: #238636; color: #fff; }
.ml { margin-left: auto; }
`,y=null,b=null,x=null;function fe(){y=document.createElement(`div`),y.setAttribute(`data-http-owl-overlay`,``),y.style.cssText=`all:initial;`,document.body.appendChild(y),b=y.attachShadow({mode:`open`}),b.innerHTML=`<style>${de}</style><div class="backdrop hidden"></div>`,b.addEventListener(`click`,async e=>{if(e.target.classList.contains(`backdrop`)){me();return}let t=e.target.closest(`[data-action]`);if(!t)return;let n=t.dataset.action;if(n===`close`){me();return}if(n===`copy-res`&&x){let e=x.entry.results[x.idx];e&&navigator.clipboard.writeText(e.body||``).catch(()=>{});return}if(n===`copy-curl`&&x){let e=await chrome.storage.local.get(`variables`),t=x.entry.blocks[x.idx];navigator.clipboard.writeText(c(_(t,e.variables??{}))).catch(()=>{});return}if(n===`run`&&x){w(x.entry,x.idx);return}}),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&me()})}async function pe(e,t){x={entry:e,idx:t,resolvedBlock:null},S(),b?.querySelector(`.backdrop`)?.classList.remove(`hidden`);let n=await chrome.storage.local.get(`variables`);x?.entry===e&&x?.idx===t&&(x.resolvedBlock=_(e.blocks[t],n.variables??{}),S())}function me(){b?.querySelector(`.backdrop`)?.classList.add(`hidden`),x=null}function S(){if(!x||!b)return;let{entry:e,idx:t}=x,n=e.blocks[t],r=x.resolvedBlock??n,i=e.results[t],o=n.method,c=[`GET`,`POST`,`PUT`,`DELETE`,`PATCH`,`HEAD`,`OPTIONS`].includes(o)?`m-${o}`:`m-OTHER`,l=i?.status??0,u=i?.state===`running`,d=i&&!u,f=l===0?`s-net`:l<300?`s-2xx`:l<400?`s-3xx`:l<500?`s-4xx`:`s-5xx`,p=Object.entries(r.headers||{}).map(([e,t])=>`${e}: ${t}`).join(`
`)||`(none)`,m=(()=>{if(u)return`
      <div class="section">
        <div class="sec-title">Response</div>
        <div class="running-msg"><span class="running-spin">↻</span> Executing…</div>
      </div>`;if(!i)return`
      <div class="section">
        <p class="muted">Not yet run. Click ▶ Run below.</p>
      </div>`;let e=Object.entries(i.headers||{}).map(([e,t])=>`${e}: ${t}`).join(`
`)||`(none)`,t=l>=400,n=i.body||``,r=l===0?i.statusText?.toLowerCase().includes(`timed out`)?`Timeout`:i.statusText?.toLowerCase().includes(`extension context`)?`Context Lost`:i.statusText?.startsWith(`Token endpoint`)||i.statusText?.includes(`OAuth missing`)?`OAuth Error`:`Network Error`:null,o=r===`Timeout`?`Request did not receive a response within 30 seconds. The endpoint may be unreachable from the extension context.`:r===`Context Lost`?`The background service worker terminated. Reload the page to restore the extension connection.`:r===`OAuth Error`?`OAuth token acquisition failed. Check your client credentials in the Variables tab.`:null,c=l===0?i.statusText:s(n,i.headers?.[`content-type`]||``),d=l!==0&&n.length>0;return`
      <div class="section">
        <div class="sec-title">Response</div>
        <div class="kv">
          <span class="k">Status</span>
          <span class="v ${f}">${l===0?`Network Error`:`${l} ${a(i.statusText)}`}</span>
        </div>
        ${l>0?`<div class="kv"><span class="k">Time</span><span class="v">${i.time}ms</span></div>`:``}
        ${l===0?`
        <div class="kv"><span class="k">Error Type</span><span class="err-type s-net">${r}</span></div>
        <div class="sub">Error</div>
        <pre class="code">${a(i.statusText||`Unknown error`)}</pre>
        ${o?`<p class="err-hint">${o}</p>`:``}`:``}
        ${t?`
        <div class="kv"><span class="k">Error Type</span><span class="err-type ${f}">HTTP ${l}</span></div>
        ${d?`<div class="sub">Error Body</div>
        <pre class="code body-err">${a(c)}</pre>`:`<p class="muted">(no response body)</p>`}`:``}
        <div class="sub">Headers</div>
        <pre class="code">${a(e)}</pre>
        ${!t&&l>0?`<div class="sub">Body</div>
        <pre class="code">${a(c)}</pre>`:``}
      </div>`})(),h=i?.assertResults??[],g=h.length===0?``:`
      <div class="section">
        <div class="sec-title">Assertions ${h.filter(e=>e.pass).length}/${h.length}</div>
        ${h.map(e=>`
          <div class="assert-row">
            <span class="a-icon ${e.pass?`ok`:`err`}">${e.pass?`✓`:`✗`}</span>
            <span class="a-expr">${a(e.expr)}</span>
            ${e.pass?``:`<div class="a-got">got: <code>${a(String(e.actual??`undefined`))}</code></div>`}
          </div>`).join(``)}
      </div>`,ee=`
    <div class="card" role="dialog" aria-modal="true" aria-label="Request detail: ${a(n.name?`${o} ${a(n.name)}`:`${o} ${a(r.url)}`)}">
      <div class="card-head">
        <span class="badge ${c}">${a(o)}</span>
        ${n.name?`<span class="req-name">${a(n.name)}</span>`:``}
        <span class="req-url" title="${a(r.url)}">${a(r.url)}</span>
        ${d&&l>0?`<span class="status-code ${f}">${l} ${a(i.statusText)}</span>`:``}
        ${d&&l>0?`<span class="res-time">${i.time}ms</span>`:``}
        <button class="close-btn" data-action="close" aria-label="Close dialog">\u2715</button>
      </div>
      <div class="card-body">
        <div class="section">
          <div class="sec-title">Request</div>
          <div class="kv">
            <span class="k">Method</span><span class="v">${a(o)}</span>
          </div>
          <div class="kv">
            <span class="k">URL</span><span class="v">${a(r.url)}</span>
          </div>
          <div class="sub">Headers</div>
          <pre class="code">${a(p)}</pre>
          ${r.body?`<div class="sub">Body</div><pre class="code">${a(r.body)}</pre>`:``}
        </div>
        ${m}
        ${g}
      </div>
      <div class="card-foot">
        ${d&&i.body?`<button class="foot-btn" data-action="copy-res" aria-label="Copy response body">Copy Response</button>`:``}
        <button class="foot-btn" data-action="copy-curl" aria-label="Copy as cURL command">Copy as cURL</button>
        <button class="foot-btn foot-run" data-action="run" ${u?`disabled`:``} aria-label="${u?`Running`:`Run request`}">\u25B6 Run</button>
        <button class="foot-btn ml" data-action="close" aria-label="Close dialog">Close</button>
      </div>
    </div>`;b.querySelector(`.backdrop`).innerHTML=ee}var C=[];async function w(e,t){e.results[t]={state:`running`,ok:!1,httpOk:!1,status:0,statusText:``,time:0,headers:{},body:``,assertResults:[]},e.render(),x?.entry===e&&x?.idx===t&&S();let n=(await chrome.storage.local.get(`variables`)).variables??{},r=e.blocks[t],i={...n,...r.localVars??{}},a=_(r,n);console.log(`[httpOwl] runOne sendMessage`,{method:r.method,url:a.url,blockUrl:r.url});let o=!1,s=await new Promise(e=>{let t=setTimeout(()=>{o=!0,console.warn(`[httpOwl] TIMEOUT — no response from background after 30s`),e(null)},3e4);try{chrome.runtime.sendMessage({type:`EXECUTE`,request:a,vars:i},n=>{clearTimeout(t),chrome.runtime.lastError?(console.warn(`[httpOwl] sendMessage lastError`,chrome.runtime.lastError.message),e(null)):(console.log(`[httpOwl] sendMessage response received`,{ok:n?.ok,status:n?.status,time:n?.time}),e(n??null))})}catch(n){clearTimeout(t),console.error(`[httpOwl] sendMessage threw synchronously`,n),e(null)}});if(!s){e.results[t]={state:`error`,ok:!1,httpOk:!1,status:0,statusText:o?`Request timed out after 30s`:`Extension context lost — reload page`,time:0,headers:{},body:``,assertResults:[]},e.render(),x?.entry===e&&x?.idx===t&&S();return}let c=ue(r.assertions,s),l=c.every(e=>e.pass),u=s.ok&&l;e.results[t]={state:u?`done`:`error`,...s,ok:u,httpOk:s.ok,assertResults:c},e.render(),x?.entry===e&&x?.idx===t&&S(),he();let d=e.results[t];document.body.dispatchEvent(new CustomEvent(`httpowl-done`,{detail:{method:r.method,url:r.url,name:r.name,status:d.status,ok:d.ok,time:d.time,assertTotal:r.assertions.length,assertFail:d.assertResults?.filter(e=>!e.pass).length??0}}))}function he(){let e=C.flatMap(e=>e.results.filter(Boolean));e.length&&(e.some(e=>e.state===`running`)?chrome.runtime.sendMessage({type:`SET_ICON`,state:`running`},()=>{chrome.runtime.lastError}):chrome.runtime.sendMessage({type:`SET_ICON`,state:e.every(e=>e.ok)?`success`:`error`},()=>{chrome.runtime.lastError}))}function T(){let e=C.flatMap(e=>e.blocks.map((t,n)=>({block:t,result:e.results[n]})));return{total:e.length,done:e.filter(({result:e})=>e&&e.state!==`running`).length,ok:e.filter(({result:e})=>e?.ok).length,err:e.filter(({result:e})=>e&&!e.ok&&e.state!==`running`).length,requests:e.map(({block:e,result:t})=>({method:e.method,url:e.url,name:e.name??null,state:t?.state??null,ok:t?.ok??null,httpOk:t?.httpOk??null,status:t?.status??null,statusText:t?.statusText??null,time:t?.time??null,assertTotal:e.assertions?.length??0,assertFail:t?.assertResults?.filter(e=>!e.pass).length??0}))}}function E(e){return C.flatMap(e=>e.blocks.map((t,n)=>({e,i:n})))[e]??null}async function ge(){let e={},t=(t,n)=>{let r=performance.now();return n().then(n=>{e[t]={ok:!0,ms:Math.round(performance.now()-r),data:n}},n=>{e[t]={ok:!1,ms:Math.round(performance.now()-r),error:String(n)}})};return await t(`storage.local.get`,()=>chrome.storage.local.get(`variables`)),await t(`sendMessage PING (background alive?)`,()=>new Promise((e,t)=>{let n=setTimeout(()=>t(Error(`PING timed out after 5s`)),5e3);chrome.runtime.sendMessage({type:`PING`},r=>{clearTimeout(n),chrome.runtime.lastError?t(Error(chrome.runtime.lastError.message)):e(r)})})),e}function D(e,t,n){let r={shadow:null,blocks:t,results:Array(t.length).fill(null),el:e,wrapper:null,offsets:[],render:()=>{}},a=document.createElement(`div`);a.setAttribute(`data-http-owl-wrapper`,``),a.style.cssText=`position:relative;display:block;`,e.parentNode.insertBefore(a,e),a.appendChild(e),r.wrapper=a,r.offsets=n??t.map((n,r)=>{let a=t.slice(0,r).filter(e=>e.method===n.method&&e.url===n.url).length;return i(e,n,a)});let o=document.createElement(`div`);o.setAttribute(`data-http-owl`,``),o.style.cssText=`position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible;`,a.appendChild(o),r.shadow=o.attachShadow({mode:`open`}),r.render=()=>{e.isConnected&&se(r.shadow,r.blocks,r.results,r.offsets,0)},requestAnimationFrame(()=>r.render()),C.push(r),ae(e,t),r.shadow.addEventListener(`click`,e=>{let t=e.target.closest(`[data-action]`);if(!t)return;let n=parseInt(t.dataset.idx,10);t.dataset.action===`run`?w(r,n):t.dataset.action===`details`&&pe(r,n)})}function _e(e){let t=e.nextElementSibling,n=0;for(;t&&n<3&&!t.matches(`h1,h2,h3,h4,h5,h6`);){if(t.matches(`pre, code`))return t;let e=t.querySelector(`pre, code`);if(e)return e;t=t.nextElementSibling,n++}return null}function O(n=!1){n&&(document.querySelectorAll(`[data-http-owl-wrapper]`).forEach(e=>{Array.from(e.childNodes).forEach(t=>{t.nodeType===1&&!t.hasAttribute(`data-http-owl`)&&e.parentNode.insertBefore(t,e)}),e.remove()}),document.querySelectorAll(`[data-http-owl]`).forEach(e=>e.remove()),document.querySelectorAll(`[data-http-owl-done]`).forEach(e=>{e.removeAttribute(`data-http-owl-done`)}),C.length=0);let r=0,i=null;{let e=Array.from(document.querySelectorAll(`td.blob-code, td.js-file-line, td[id^="LC"], td.react-code-file-line`));if(e.length){let n=e[0].closest(`table`);if(n&&!n.dataset.httpOwlDone){let r=e.map(e=>e.textContent??``),a=t(r.join(`
`));if(a.length){n.dataset.httpOwlBlob=`1`;let t=n.getBoundingClientRect(),o=e.map(e=>e.getBoundingClientRect().top-t.top);i={table:n,blocks:a,blockOffsets:a.map((e,t)=>{let n=e.method+` `+e.url,i=a.slice(0,t).filter(t=>t.method===e.method&&t.url===e.url).length,s=0;for(let e=0;e<r.length;e++)if(r[e].includes(n)){if(s===i)return o[e];s++}return 0})}}}}}if(document.querySelectorAll(`pre, code, textarea`).forEach(e=>{if(e.tagName===`CODE`&&e.closest(`pre`)||e.dataset.httpOwlDone||e.closest(`[data-http-owl-wrapper]`))return;if(e.closest(`[data-http-owl-blob]`)){e.dataset.httpOwlDone=`1`;return}if(e.closest(`[data-http-owl-done]`))return;if(e.tagName===`TEXTAREA`){let t=e;if(typeof t.checkVisibility==`function`?!t.checkVisibility():!t.offsetWidth&&!t.offsetHeight){e.dataset.httpOwlDone=`1`;return}}let n=t(e.value??e.textContent??``);n.length&&(e.dataset.httpOwlDone=`1`,D(e,n),r+=n.length)}),document.querySelectorAll(`h2, h3, h4`).forEach(t=>{let n=t.textContent?.trim();if(!n)return;let i=_e(t);if(!i||i.dataset.httpOwlDone)return;let a=e((i.value??i.textContent??``).trim(),n);a&&(i.dataset.httpOwlDone=`1`,D(i,[a]),r++)}),i){let{table:e,blocks:t,blockOffsets:n}=i;e.dataset.httpOwlDone=`1`,D(e,t,n),r+=t.length}return chrome.runtime.sendMessage({type:`SET_ICON`,state:`default`},()=>{chrome.runtime.lastError}),r}var ve=`* { box-sizing: border-box; margin: 0; padding: 0; }

:host { all: initial; display: block; }

/* ── Floating Tab (right-edge strip) ────────────────────────────────── */
.tab {
  position: fixed;
  right: 0;
  top: 45%;
  transform: translateY(-50%);
  z-index: 2147483646;
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  background: rgba(22, 27, 34, 0.82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(48, 54, 61, 0.6);
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s, width 0.2s, padding 0.2s;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.tab:hover {
  width: 42px;
  padding: 10px 8px;
  background: rgba(22, 27, 34, 0.92);
}
.tab.hidden { display: none; }

.tab-icon {
  font-size: 14px;
  font-weight: 700;
  color: #58a6ff;
  line-height: 1;
  letter-spacing: 0.04em;
}
.tab-count {
  font-size: 10px;
  font-weight: 700;
  color: #e6edf3;
  background: #21262d;
  border-radius: 8px;
  padding: 1px 5px;
  min-width: 18px;
  text-align: center;
  line-height: 1.4;
}
.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.3s;
}
.tab-dot.idle   { background: #6b7280; }
.tab-dot.ok     { background: #3fb950; }
.tab-dot.err    { background: #f85149; }
.tab-dot.scan   { background: #58a6ff; animation: pulse-dot 1.2s ease-in-out infinite; }

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 2px #58a6ff; }
  50%      { box-shadow: 0 0 6px #58a6ff; }
}

/* ── Backdrop ───────────────────────────────────────────────────────── */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483645;
  animation: fade-in 0.18s ease;
}
.backdrop.hidden { display: none; }

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Drawer ─────────────────────────────────────────────────────────── */
.drawer {
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 380px;
  max-width: 95vw;
  z-index: 2147483646;
  background: #0d1117;
  border-left: 1px solid #30363d;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #e6edf3;
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: -8px 0 30px rgba(0, 0, 0, 0.5);
}
.drawer.open { transform: translateX(0); }

/* ── Header ─────────────────────────────────────────────────────────── */
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
  flex-shrink: 0;
}
.header-title {
  font-size: 15px;
  font-weight: 700;
  color: #e6edf3;
}
.header-title span { color: #58a6ff; }
.header-stats {
  font-size: 11px;
  color: #8b949e;
  margin-left: auto;
}
.header-stats .ok  { color: #3fb950; }
.header-stats .err { color: #f85149; }
.close-btn {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #8b949e;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.close-btn:hover { color: #f85149; border-color: rgba(248,81,73,0.6); }

/* ── Error bar ──────────────────────────────────────────────────────── */
.error-bar {
  padding: 8px 16px;
  background: rgba(248,81,73,0.1);
  border-bottom: 1px solid rgba(248,81,73,0.2);
  color: #f85149;
  font-size: 12px;
  flex-shrink: 0;
}

/* ── Tabs ───────────────────────────────────────────────────────────── */
.tabs {
  display: flex;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}
.tab-btn {
  flex: 1;
  padding: 9px 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  font-family: inherit;
}
.tab-btn:hover { color: #c9d1d9; }
.tab-btn.active {
  color: #e6edf3;
  border-bottom-color: #58a6ff;
}

/* ── Tab Content (shared) ───────────────────────────────────────────── */
.tab-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.tab-content.hidden { display: none; }
.tab-content::-webkit-scrollbar { width: 5px; }
.tab-content::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

/* ── Requests Tab ───────────────────────────────────────────────────── */
.stats-bar {
  display: flex;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #21262d;
  font-size: 11.5px;
  color: #8b949e;
  flex-shrink: 0;
}
.stat-item { display: flex; align-items: center; gap: 4px; }
.stat-item.ok  { color: #3fb950; }
.stat-item.err { color: #f85149; }

.action-bar {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}
.action-btn {
  padding: 5px 11px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 11.5px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.action-btn:hover:not(:disabled) { background: #30363d; border-color: #8b949e; }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.run-all { background: #0f2d16; border-color: #238636; color: #3fb950; }
.action-btn.run-all:hover:not(:disabled) { background: #238636; color: #fff; }
.action-btn.run-all:disabled { background: #0f2d16; border-color: #238636; opacity: 0.4; }

.request-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.request-list::-webkit-scrollbar { width: 5px; }
.request-list::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

.req-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid #161b22;
}
.req-item:hover { background: #161b22; }
.req-item:last-child { border-bottom: none; }

.req-method {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  font-family: monospace;
}
.req-method.GET     { background: rgba(13,65,157,0.2);  color: #58a6ff; }
.req-method.POST    { background: rgba(20,83,45,0.2);   color: #3fb950; }
.req-method.PUT     { background: rgba(120,53,15,0.2);  color: #d29922; }
.req-method.DELETE  { background: rgba(127,29,29,0.2);  color: #f85149; }
.req-method.PATCH   { background: rgba(76,29,149,0.2);  color: #bc8cff; }
.req-method.OTHER   { background: rgba(33,38,45,0.5);   color: #8b949e; }

.req-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #c9d1d9;
  min-width: 0;
}

.req-result {
  font-size: 11px;
  font-family: monospace;
  flex-shrink: 0;
  white-space: nowrap;
}
.req-result.ok  { color: #3fb950; }
.req-result.err { color: #f85149; }
.req-result.run { color: #58a6ff; }

.req-assert {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0;
  margin-left: 2px;
}
.req-assert.ok  { background: rgba(63,185,80,0.15); color: #3fb950; }
.req-assert.err { background: rgba(248,81,73,0.15); color: #f85149; }

.req-run-btn {
  padding: 2px 7px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #8b949e;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  font-family: inherit;
  flex-shrink: 0;
}
.req-run-btn:hover:not(:disabled) {
  background: #238636;
  border-color: #2ea043;
  color: #fff;
}
.req-run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Variables Tab ──────────────────────────────────────────────────── */
.env-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}
.env-select {
  flex: 1;
  padding: 4px 8px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #e6edf3;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.env-select:focus { outline: none; border-color: #58a6ff; }

.env-btn {
  padding: 4px 9px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #8b949e;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s;
}
.env-btn:hover { background: #30363d; border-color: #8b949e; }
.env-btn.del:hover { border-color: rgba(248,81,73,0.6); color: #f85149; }

.var-editor-wrap {
  flex: 1;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
}
.var-editor {
  flex: 1;
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  padding: 10px;
  resize: none;
  line-height: 1.55;
  tab-size: 2;
}
.var-editor:focus { outline: none; border-color: #58a6ff; }
.var-editor::placeholder { color: #484f58; }

/* ── Spinner ────────────────────────────────────────────────────────── */
.spin { animation: sp 0.65s linear infinite; display: inline-block; }
@keyframes sp { to { transform: rotate(360deg); } }

/* ── Empty state ────────────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
  flex: 1;
}
.empty-state .icon { font-size: 24px; opacity: 0.4; }

/* ── About Tab ───────────────────────────────────────────────────────── */
.about-section {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
}
.about-title {
  font-size: 20px;
  font-weight: 700;
  color: #e6edf3;
  letter-spacing: -0.02em;
}
.about-title span { color: #58a6ff; }
.about-version {
  font-size: 11px;
  color: #484f58;
  font-family: monospace;
  margin-top: -8px;
}
.about-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: #8b949e;
}
.about-desc a {
  color: #58a6ff;
  text-decoration: none;
}
.about-desc a:hover { text-decoration: underline; }
.about-desc code {
  background: #161b22;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
  color: #c9d1d9;
}
.about-hr {
  border: none;
  border-top: 1px solid #21262d;
  margin: 4px 0;
}
.about-sub {
  font-size: 12px;
  font-weight: 600;
  color: #e6edf3;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.about-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
}
.about-list li {
  font-size: 12px;
  line-height: 1.55;
  color: #8b949e;
  padding-left: 16px;
  position: relative;
}
.about-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #30363d;
}
.about-list li code {
  background: #161b22;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  color: #c9d1d9;
}
`,k=null,A=null,j=!1,M=`requests`,N=!1,P=!1,F={envs:{$shared:``,default:``},activeEnv:`default`};function ye(e){return String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function be(e){return String(e).replace(/"/g,`&quot;`).replace(/&/g,`&amp;`)}function xe(e){try{let t=new URL(e);return t.pathname+(t.search||``)}catch{return e}}function I(e){return A?.querySelector(e)}var L=`✓`,R=`✗`,z=`▶`,B=`↻`,Se=`+`,Ce=`−`,we=`✕`,Te=`⌂`;function Ee(){if(k)return;k=document.createElement(`div`),k.style.cssText=`all:initial;display:block;position:static;`,A=k.attachShadow({mode:`open`}),A.innerHTML=`<style>${ve}</style>
    <div class="tab" role="button" tabindex="0" aria-label="Toggle httpOwl side panel">
      <span class="tab-icon">HO</span>
      <span class="tab-count">0</span>
      <span class="tab-dot idle"></span>
    </div>
    <div class="backdrop hidden"></div>
    <div class="drawer">
      <div class="header">
        <span class="header-title">http<span>Owl</span></span>
        <span class="header-stats"></span>
        <button class="close-btn" aria-label="Close side panel">${we}</button>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="requests">Requests</button>
        <button class="tab-btn" data-tab="variables">Variables</button>
        <button class="tab-btn" data-tab="about">About</button>
      </div>
      <div class="tab-content" id="tab-requests">
        <div class="stats-bar"></div>
        <div class="action-bar">
          <button class="action-btn run-all" aria-label="Run all requests">${z} Run All</button>
          <button class="action-btn rescan" aria-label="Re-scan page">${B} Re-scan</button>
        </div>
        <div class="request-list"></div>
      </div>
        <div class="tab-content hidden" id="tab-variables">
        <div class="env-bar">
          <select class="env-select" aria-label="Select environment"></select>
          <button class="env-btn add" aria-label="Add environment">${Se}</button>
          <button class="env-btn del" aria-label="Delete environment">${Ce}</button>
        </div>
        <div class="var-editor-wrap">
          <textarea class="var-editor" placeholder="KEY=value&#10;API_KEY=abc123&#10;BASE_URL=https://api.example.com" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="tab-content hidden" id="tab-about">
        <div class="about-section">
          <div class="about-title">http<span>Owl</span></div>
          <div class="about-version">v1.0.1</div>
          <p class="about-desc">
            Browser companion for <a href="https://httpyac.github.io" target="_blank" rel="noopener">httpYac</a>
            &mdash; runs <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>DELETE</code>, <code>PATCH</code>
            requests and evaluates <code>??</code> assertions directly on any webpage.
          </p>
          <hr class="about-hr">
          <div class="about-sub">Known Limitations</div>
          <ul class="about-list">
            <li>No response variable capture (<code>@variable</code>) &mdash; cannot chain requests by extracting values from responses.</li>
            <li>No script block support &mdash; httpYac <code>&lt;script&gt;</code> blocks for custom JS logic are not executed.</li>
            <li>Only OAuth2 <code>client_credentials</code> is supported &mdash; authorization code, PKCE, implicit, and AWS Signature flows are not implemented.</li>
            <li>No request chaining &mdash; requests run independently; results from one cannot feed into another.</li>
            <li>Body truncated at 5&thinsp;000 characters in the detail overlay (full body still used for assertions).</li>
            <li>Some servers may reject requests even with extension-origin fetch due to strict CORS or security policies.</li>
            <li>Load testing is not supported &mdash; this is a debugging tool, not a benchmarking tool.</li>
          </ul>
        </div>
      </div>
    </div>`,document.body.appendChild(k);let e=I(`.tab`);e.addEventListener(`click`,V),e.addEventListener(`keydown`,e=>{let t=e;(t.key===`Enter`||t.key===` `)&&(e.preventDefault(),V())}),I(`.close-btn`).addEventListener(`click`,H),I(`.backdrop`).addEventListener(`click`,H),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&j&&H()}),I(`.tabs`).addEventListener(`click`,e=>{let t=e.target.closest(`.tab-btn`);if(!t)return;let n=t.dataset.tab;if(n===M)return;M=n,I(`.tabs`).querySelectorAll(`.tab-btn`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`);let r=I(`#tab-requests`),i=I(`#tab-variables`),a=I(`#tab-about`);r.classList.toggle(`hidden`,n!==`requests`),i.classList.toggle(`hidden`,n!==`variables`),a.classList.toggle(`hidden`,n!==`about`),n===`variables`&&J()}),I(`.action-btn.run-all`).addEventListener(`click`,Ae),I(`.action-btn.rescan`).addEventListener(`click`,je),I(`.env-select`).addEventListener(`change`,Pe),I(`.var-editor`)?.addEventListener(`input`,Fe),I(`.env-btn.add`).addEventListener(`click`,Ie),I(`.env-btn.del`).addEventListener(`click`,Le),te(()=>{j&&M===`variables`&&J()}),chrome.runtime.onMessage.addListener(e=>{e.type===`TOGGLE_PANEL`&&V()}),W()}function V(){j=!j,I(`.drawer`).classList.toggle(`open`,j),I(`.backdrop`).classList.toggle(`hidden`,!j),j&&(De(),M===`variables`&&J())}function H(){j&&(j=!1,I(`.drawer`).classList.remove(`open`),I(`.backdrop`).classList.add(`hidden`))}function U(){W(),j&&De()}function W(){let e=T(),t=I(`.tab`),n=I(`.tab-count`),r=I(`.tab-dot`);t&&t.classList.toggle(`hidden`,e.total===0),n&&(n.textContent=String(e.total)),r&&(r.className=`tab-dot`,N||e.requests.some(e=>e.state===`running`)?r.classList.add(`scan`):e.err>0?r.classList.add(`err`):e.ok>0?r.classList.add(`ok`):r.classList.add(`idle`))}function De(){Oe(),W()}function Oe(){let e=T(),t=I(`.header-stats`);if(t){let n=[];e.total>0&&n.push(`${e.total} req`),e.ok>0&&n.push(`<span class="ok">${L} ${e.ok}</span>`),e.err>0&&n.push(`<span class="err">${R} ${e.err}</span>`),t.innerHTML=n.join(` \xA0`)}let n=I(`.stats-bar`);n&&(n.innerHTML=`
      <span class="stat-item">Total: ${e.total}</span>
      ${e.ok>0?`<span class="stat-item ok">${L} ${e.ok}</span>`:``}
      ${e.err>0?`<span class="stat-item err">${R} ${e.err}</span>`:``}
    `);let r=I(`.action-btn.run-all`),i=I(`.action-btn.rescan`);if(r&&(r.disabled=N||e.total===0,r.textContent=N?`${B} Running\u2026`:`${z} Run All`),i&&(i.disabled=P,i.textContent=P?`${B} Scanning\u2026`:`${B} Re-scan`),!e.total&&!P){let e=I(`.request-list`);e&&(e.innerHTML=`<div class="empty-state"><div class="icon">${Te}</div><div>No HTTP requests detected</div></div>`);return}ke(e)}function ke(e){let t=I(`.request-list`);t&&(t.innerHTML=e.requests.map((e,t)=>{let n=e.method??`GET`,r=[`GET`,`POST`,`PUT`,`DELETE`,`PATCH`].includes(n)?n:`OTHER`,i=e.name||xe(e.url),a=e.state===`running`,o=``;if(a)o=`<span class="req-result run"><span class="spin">${B}</span></span>`;else if(e.state){let t=e.assertTotal,n=e.assertFail,r=t>0?` <span class="req-assert ${n?`err`:`ok`}">${n?`${R}${n}/${t}`:`${L}${t}`}</span>`:``;o=e.ok?`<span class="req-result ok">${L} ${e.status} \u00B7 ${e.time}ms${r}</span>`:`<span class="req-result err">${e.status&&e.status>0?`${R} ${e.status}`:`${R} ERR`}${r}</span>`}let s=a?`disabled`:``,c=a?B:z;return`<div class="req-item" data-index="${t}">
      <span class="req-method ${r}">${n}</span>
      <span class="req-label" title="${be(e.url)}">${ye(i)}</span>
      ${o}
      <button class="req-run-btn" data-index="${t}" ${s}>${c}</button>
    </div>`}).join(``),t.querySelectorAll(`.req-item`).forEach(e=>{let t=parseInt(e.dataset.index,10);e.addEventListener(`click`,e=>{if(e.target.closest(`.req-run-btn`))return;let n=E(t);n&&n.e.wrapper?.scrollIntoView({behavior:`smooth`,block:`center`})});let n=e.querySelector(`.req-run-btn`);n.addEventListener(`click`,async e=>{e.stopPropagation(),n.disabled=!0;let r=E(t);r&&(await w(r.e,r.i),U())})}))}async function Ae(){N||(N=!0,U(),await Promise.all(C.flatMap(e=>e.blocks.map((t,n)=>w(e,n)))),N=!1,U())}async function je(){if(!P){P=!0,U();try{O(!0)}catch(e){console.warn(`[httpOwl] re-scan error`,e)}P=!1,U()}}function Me(e){let t={};for(let n of e.split(`
`)){let e=n.indexOf(`=`);if(e>0){let r=n.slice(0,e).trim(),i=n.slice(e+1).trim();r&&(t[r]=i)}}return t}function Ne(){let e=Me(F.envs.$shared||``),t=Me(F.envs[F.activeEnv]||``);return{...e,...t}}async function G(){let e=Ne();await chrome.storage.local.set({envConfig:F,variables:e})}function K(){let e=I(`.env-select`);e.innerHTML=Object.keys(F.envs).map(e=>`<option value="${be(e)}" ${e===F.activeEnv?`selected`:``}>${ye(e)}</option>`).join(``)}function q(){let e=I(`.var-editor`);e.value=F.envs[F.activeEnv]||``}async function J(){let e=await chrome.storage.local.get(`envConfig`);e.envConfig&&(F=e.envConfig),K(),q()}function Pe(){let e=I(`.var-editor`),t=I(`.env-select`);F.envs[F.activeEnv]=e.value,F.activeEnv=t.value,q(),G()}function Fe(){let e=I(`.var-editor`);F.envs[F.activeEnv]=e.value,G()}function Ie(){let e=prompt(`New environment name:`);if(!e?.trim())return;let t=e.trim();if(F.envs[t]!==void 0)return;let n=I(`.var-editor`);F.envs[F.activeEnv]=n.value,F.envs[t]=``,F.activeEnv=t,K(),q(),G()}function Le(){let e=F.activeEnv;e!==`$shared`&&(Object.keys(F.envs).length<=1||confirm(`Delete environment "${e}"?`)&&(delete F.envs[e],F.activeEnv=Object.keys(F.envs)[0],K(),q(),G()))}var Re=`* { box-sizing: border-box; margin: 0; padding: 0; }

:host { all: initial; display: block; }

.toast-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483645;
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #e6edf3;
  pointer-events: auto;
  animation: toast-in 0.25s ease, toast-out 0.25s ease 2s forwards;
  max-width: 380px;
  overflow: hidden;
}

@keyframes toast-in {
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes toast-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.toast-method {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  font-family: monospace;
}
.toast-method.GET     { background: rgba(13,65,157,0.25);  color: #58a6ff; }
.toast-method.POST    { background: rgba(20,83,45,0.25);   color: #3fb950; }
.toast-method.PUT     { background: rgba(120,53,15,0.25);  color: #d29922; }
.toast-method.DELETE  { background: rgba(127,29,29,0.25);  color: #f85149; }
.toast-method.PATCH   { background: rgba(76,29,149,0.25);  color: #bc8cff; }
.toast-method.OTHER   { background: rgba(33,38,45,0.5);    color: #8b949e; }

.toast-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: #c9d1d9;
}

.toast-result {
  font-family: monospace;
  font-size: 11px;
  flex-shrink: 0;
  white-space: nowrap;
}
.toast-result.ok  { color: #3fb950; }
.toast-result.err { color: #f85149; }
`,Y=null,X=null;function ze(){Y||(Y=document.createElement(`div`),Y.style.cssText=`all:initial;display:block;position:static;`,X=Y.attachShadow({mode:`open`}),X.innerHTML=`<style>${Re}</style><div class="toast-container"></div>`,document.body.appendChild(Y))}function Be(){return ze(),X.querySelector(`.toast-container`)}function Ve(e,t,n,r,i){let a=Be(),o=[`GET`,`POST`,`PUT`,`DELETE`,`PATCH`].includes(e)?e:`OTHER`,s=n?`✓`:`✗`,c=n?`ok`:`err`,l=r>0?`${s} ${r}`:`${s} ERR`,u=document.createElement(`div`);u.className=`toast`,u.innerHTML=`
    <span class="toast-method ${o}">${Z(e)}</span>
    <span class="toast-label">${Z(t)}</span>
    <span class="toast-result ${c}">${Z(l)} \u00B7 ${i}ms</span>
  `,a.appendChild(u),setTimeout(()=>{u.parentNode&&u.remove()},2300)}function Z(e){return String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function He(){document.body.addEventListener(`httpowl-done`,(e=>{let{method:t,url:n,name:r,status:i,ok:a,time:o}=e.detail;Ve(t,r||Ue(n),a,i,o)}))}function Ue(e){try{let t=new URL(e);return t.pathname+(t.search||``)}catch{return e}}var We=`httpowl:`,Q=null;function Ge(){Q&&clearTimeout(Q),Q=setTimeout(()=>{Q=null,Ke()},400)}function Ke(){if(C.length===0)return;let e={entries:C.map(e=>({blocks:e.blocks.map(e=>({method:e.method,url:e.url,name:e.name})),results:e.results})),timestamp:Date.now()},t=We+location.href;chrome.storage.session.set({[t]:e}).catch(()=>{})}async function qe(){let e=We+location.href,t=(await chrome.storage.session.get(e))[e];if(t){if(Date.now()-t.timestamp>1800*1e3){chrome.storage.session.remove(e).catch(()=>{});return}for(let e of C){let n=!1;for(let r=0;r<e.blocks.length;r++){let i=e.blocks[r];if(e.results[r])continue;let a=i.method+`\0`+i.url+`\0`+(i.name??``);for(let i of t.entries){for(let t=0;t<i.blocks.length;t++){let o=i.blocks[t];if(o.method+`\0`+o.url+`\0`+(o.name??``)===a&&i.results[t]){e.results[r]=i.results[t],n=!0;break}}if(e.results[r])break}}n&&e.render()}}}function Je(){window.addEventListener(`beforeunload`,()=>{Ke()})}window.__httpOwl={reinject:O,getStats:T,runAll:()=>Promise.all(C.flatMap(e=>e.blocks.map((t,n)=>w(e,n)))),diagnose:ge},chrome.runtime.onMessage.addListener((e,t,n)=>{let{type:r,index:i}=e;if(r===`SCAN`){let e=O(!0);U(),n({count:e})}else if(r===`RUN_ALL`)return Promise.all(C.flatMap(e=>e.blocks.map((t,n)=>w(e,n)))).then(()=>{n({ok:!0}),U()}),!0;else if(r===`RUN_ONE`){let e=E(i);return e&&w(e.e,e.i).then(()=>{n(T()),U()}),!0}else if(r===`SCROLL_TO`)E(i)?.e.wrapper?.scrollIntoView({behavior:`smooth`,block:`center`}),n({ok:!0});else if(r===`STATS`)n(T());else if(r===`GET_REPORT`)return chrome.storage.local.get(`variables`).then(({variables:e={}})=>{n({requests:C.flatMap(t=>t.blocks.map((n,r)=>{let i=t.results[r],a=_(n,e);return{method:n.method,name:n.name??null,url:n.url,resolvedUrl:a.url,headers:n.headers,resolvedHeaders:a.headers,body:n.body,resolvedBody:a.body,assertions:n.assertions??[],state:i?.state??null,ok:i?.ok??null,status:i?.status??null,statusText:i?.statusText??null,time:i?.time??null,resHeaders:i?.headers??{},resBody:i?.body??null,assertResults:i?.assertResults??[]}}))})}),!0}),ee(),te(()=>{for(let e of C)ae(e.el,e.blocks)}),fe(),Ee(),He();try{O()}catch(e){console.warn(`[httpOwl] init scan error`,e)}U(),qe().catch(()=>{}),document.body.addEventListener(`httpowl-done`,()=>{Ge()}),Je();var $=null;new MutationObserver(()=>{clearTimeout($),$=setTimeout(()=>{if($=null,document.querySelector(`pre:not([data-http-owl-done]),code:not(pre code):not([data-http-owl-done]),textarea:not([data-http-owl-done])`)){try{O()}catch(e){console.warn(`[httpOwl] re-scan error`,e)}U()}},600)}).observe(document.documentElement,{childList:!0,subtree:!0});
//# sourceMappingURL=content.js.map