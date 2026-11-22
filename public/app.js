const app = document.getElementById('app');
const names = { studio: 'استوديو', court: 'كورت', matcha: 'ماتشا' };
const colors = { studio: '#c7f36a', court: '#e74531', matcha: '#a9cd91' };
const labels = { queued: 'استلمنا طلبك', preparing: 'جاري التحضير', ready: 'جاهز للاستلام', completed: 'تم التسليم' };
const orderStates = ['queued', 'preparing', 'ready', 'completed'];
let siteName = 'نوى';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials:'same-origin', ...options, headers:{ ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({error:`استجابة غير متوقعة من الخادم (${response.status})` }));
  if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب');
  return data;
};
const json = (body) => JSON.stringify(body);
const themeClass = (theme) => `theme-${['studio','court','matcha'].includes(theme) ? theme : 'studio'}`;
function toast(message) { const el=document.createElement('div'); el.className='toast'; el.textContent=message; document.body.append(el); setTimeout(()=>el.remove(),2800); }
function themeCards(selected='studio') {
  return `<div class="theme-grid">${Object.entries(names).map(([key,name])=>`<button type="button" class="theme-card ${selected===key?'selected':''}" data-theme="${key}"><div class="theme-swatch" style="background:${colors[key]}"></div><div class="theme-name">${name}</div><div class="theme-hint">${key==='studio'?'هادئ ونظيف':key==='court'?'رياضي وجريء':'طبيعي ومنعش'}</div></button>`).join('')}</div>`;
}
function attachThemeCards(root=document) {
  root.querySelectorAll('.theme-card').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('.theme-card').forEach(card=>card.classList.toggle('selected', card===button));
    const field=root.querySelector('input[name="theme"]'); if(field) field.value=button.dataset.theme;
  }));
}
function brand(admin=false) { return `<div class="brand"><span class="brand-mark">ن</span><span>${esc(siteName)}<small>${admin?'SUPER ADMIN / FULL ACCESS':'ORDER CONTROL / STORE'}</small></span></div>`; }
function shell(user, active='home', body='') {
  const admin=user.role==='admin';
  const nav=admin?[["home","◫","نظرة عامة"],["shops","▦","المتاجر"],["settings","⚙","إعدادات النظام"]]:[["home","◫","الطلبات"],["menu","☷","قائمة الأصناف"],["design","✳","تصميم المتجر"]];
  app.innerHTML=`<div class="shell"><aside class="rail">${brand(admin)}<div class="rail-label">WORKSPACE</div><nav class="rail-nav">${nav.map(([id,ico,label])=>`<button class="nav-item ${id===active?'active':''}" data-page="${id}"><span class="nav-ico">${ico}</span><span class="nav-text">${label}</span></button>`).join('')}</nav><div class="rail-bottom"><strong>${esc(user.name||user.username)}</strong>${admin?'سوبر أدمن · كامل الصلاحيات':'إدارة الطلبات اليومية'}<br>${esc(siteName)} · لوحة العمل</div></aside><main class="work"><header class="topline"><div><div class="eyebrow">${admin?'مساحة الأدمن':'مساحة المتجر'}</div><h1 class="page-title" id="pageTitle">${admin?'نظرة عامة':'إدارة الطلبات'}</h1></div><div class="top-actions"><button class="icon-button" id="refreshBtn" aria-label="تحديث">↻</button><div class="profile"><div class="avatar">${admin?'ن':'م'}</div><div><strong>${esc(user.name||user.username)}</strong><small>${admin?'سوبر أدمن':'صاحب المتجر'}</small></div></div><button class="button soft" id="logoutBtn">خروج <span>↗</span></button></div></header><section id="view">${body}</section></main></div>`;
  document.getElementById('logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'}); location.href='/';};
  document.getElementById('refreshBtn').onclick=()=>location.reload();
  app.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=()=>admin?adminView(btn.dataset.page,user):storeView(btn.dataset.page,user));
}
function login() {
  app.innerHTML=`<main class="login-wrap"><section class="login-art">${brand()}<h2>طلباتك،<br><em>بإيقاع أفضل.</em><br>من أول مسح.</h2><p>مساحة هادئة لإدارة متجرك ومتابعة كل طلب حتى لحظة الاستلام.</p><div class="art-mark" aria-hidden="true"><i></i><i></i><i></i></div><div class="art-foot">NAWA / ORDER STUDIO&nbsp;&nbsp; · &nbsp;&nbsp; RIYADH</div></section><section class="login-side"><div class="login-box">${brand()}<h1>مرحبًا بك</h1><p class="login-intro">سجّل الدخول إلى مساحة إدارة الطلبات</p><form id="loginForm" class="form-stack"><div class="field"><label for="username">اسم المستخدم</label><input class="input" id="username" name="username" autocomplete="username" placeholder="مثال: admin" required></div><div class="field"><label for="password">كلمة المرور</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="أدخل كلمة المرور" required></div><div class="error" id="loginError"></div><button class="button primary" type="submit">دخول إلى لوحة العمل <span>←</span></button></form><div class="secure-note"><span>◈</span><span>اتصال خاص وجلسة آمنة. أنشئ حسابات المتاجر من لوحة الأدمن.</span></div></div></section></main>`;
  document.getElementById('loginForm').onsubmit=async e=>{e.preventDefault();const error=document.getElementById('loginError');error.textContent='';try{const data=await api('/api/auth/login',{method:'POST',body:json({username:e.target.username.value,password:e.target.password.value})});data.user.role==='admin'?adminView('home',data.user):storeView('home',data.user);}catch(err){error.textContent=err.message;}};
}
function stats(items){return `<div class="grid stats">${items.map(([label,value,note])=>`<article class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note||''}</div></article>`).join('')}</div>`;}
function sectionHead(title,sub,action=''){return `<div class="section-head"><div><h2 class="section-title">${title}</h2><p class="section-sub">${sub}</p></div>${action}</div>`;}
async function adminSettingsView(user){
  const {settings}=await api('/api/admin/settings');
  const body=`${sectionHead('إعدادات النظام','تخصيص اسم المنصة وصلاحيات الإدارة.') }<form id="adminSettingsForm" class="panel card form-stack admin-settings"><div class="field"><label for="appName">اسم الموقع</label><input class="input" id="appName" name="appName" maxlength="40" minlength="2" value="${esc(settings.appName||'نوى')}" required><small>يظهر الاسم في الشعار وعنوان المتصفح.</small></div><div class="superadmin-callout"><span class="shop-avatar">♛</span><div><strong>حساب سوبر أدمن</strong><small>للأدمن كامل الصلاحيات على جميع المتاجر: الطلبات، الحالات، الأصناف، بيانات الدخول، التصميم، روابط التقييم، التفعيل والحذف.</small></div></div><button class="button primary" type="submit">حفظ إعدادات النظام</button></form>`;
  shell(user,'settings',body);document.getElementById('pageTitle').textContent='إعدادات النظام';
  document.getElementById('adminSettingsForm').onsubmit=async e=>{e.preventDefault();try{const result=await api('/api/admin/settings',{method:'PATCH',body:json({appName:e.target.appName.value.trim()})});siteName=result.settings.appName;document.title=`${siteName} | إدارة الطلبات`;toast('تم حفظ اسم الموقع');adminSettingsView(user);}catch(err){toast(err.message);}};
}
async function adminView(page='home',user={username:'admin',role:'admin'}) {
  if(page==='settings') return adminSettingsView(user);
  if(page==='orders') return adminShopOrdersView(window.adminShop,user);
  const all=(await api('/api/admin/shops')).shops;
  const active=all.filter(s=>s.active).length;
  const today=all.filter(s=>new Date(s.createdAt).toDateString()===new Date().toDateString()).length;
  const body=`${stats([["إجمالي المتاجر",all.length,"مساحات العمل المنشأة"],["متاجر نشطة",active,"تعمل الآن"],["متاجر متوقفة",all.length-active,"يمكن تفعيلها"],["أضيفت اليوم",today,"هذا اليوم"]])}${sectionHead('مساحات العمل','إدارة كاملة لكل متجر، من الحساب والأصناف إلى الطلبات والتصميم.',`<button class="button primary" id="addShopBtn">＋ إضافة متجر</button>`)}<div class="panel table-wrap"><table class="table"><thead><tr><th>المتجر</th><th>اسم المستخدم</th><th>شاشة الطلب</th><th>المظهر</th><th>الحالة</th><th>إدارة</th></tr></thead><tbody>${all.length?all.map(s=>`<tr><td><div class="shopcell"><span class="shop-avatar">◈</span><span>${esc(s.name)}<small class="subtle" style="display:block">أُضيف ${new Date(s.createdAt).toLocaleDateString('ar-SA')}</small></span></div></td><td>${esc(s.username)}</td><td><a class="table-link" target="_blank" href="/screen/${encodeURIComponent(s.slug)}">شاشة الطلبات ↗</a></td><td>${s.orderMode==='custom'?'طلب يدوي':'قائمة أصناف'} · ${names[s.theme]||names.studio}</td><td><span class="pill ${s.active?'':'off'}">${s.active?'نشط':'متوقف'}</span></td><td><div class="row-actions"><button class="mini-button" data-orders="${esc(s.id)}">الطلبات</button><button class="mini-button" data-edit="${esc(s.id)}">تعديل</button><button class="mini-button" data-menu="${esc(s.id)}">الأصناف</button><button class="mini-button" data-toggle="${esc(s.id)}">${s.active?'إيقاف':'تفعيل'}</button><button class="mini-button del" data-delete="${esc(s.id)}">حذف</button></div></td></tr>`).join(''):`<tr><td colspan="6" class="empty">لا توجد متاجر بعد. ابدأ بإضافة أول متجر.</td></tr>`}</tbody></table></div><div class="inline-alert" style="margin-top:14px">الأدمن سوبر أدمن: صلاحية كاملة لإدارة حسابات المتاجر وأصنافها وطلباتها وتصميمها. رابط تقييم Google Maps يحدده الأدمن فقط.</div>`;
  shell(user,page==='shops'?'shops':'home',body); document.getElementById('pageTitle').textContent=page==='shops'?'المتاجر':'نظرة عامة';
  document.getElementById('addShopBtn').onclick=()=>shopModal();
  app.querySelectorAll('[data-orders]').forEach(b=>b.onclick=()=>{window.adminShop=all.find(s=>s.id===b.dataset.orders);adminShopOrdersView(window.adminShop,user);});
  app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>shopModal(all.find(s=>s.id===b.dataset.edit)));
  app.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>catalogDialog(all.find(s=>s.id===b.dataset.menu),true));
  app.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/shops/${b.dataset.toggle}`,{method:'PATCH',body:json({active:b.textContent==='إيقاف'?false:true})});toast('تم تحديث حالة المتجر');adminView(page,user);}catch(e){toast(e.message);}});
  app.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('سيتم حذف المتجر وطلباته. هل تريد المتابعة؟'))return;await api(`/api/admin/shops/${b.dataset.delete}`,{method:'DELETE'});toast('تم حذف المتجر');adminView(page,user);});
}
async function adminShopOrdersView(shop,user){
  if(!shop){toast('اختر متجرًا أولاً');return adminView('shops',user);}
  const {orders}=await api(`/api/admin/shops/${encodeURIComponent(shop.id)}/orders`);
  const active=orders.filter(order=>order.status!=='completed'),completed=orders.filter(order=>order.status==='completed');
  const renderOrder=o=>`<article class="order-card"><div class="order-no">#${esc(o.number)}</div><div><div class="order-title">${o.customerName?`<span class="subtle">${esc(o.customerName)} · </span>`:''}${esc(o.item)}</div><div class="order-meta">${new Date(o.createdAt).toLocaleString('ar-SA')} · ${o.prepMinutes?`تحضير نحو ${o.prepMinutes} د`:'طلب يدوي'}</div></div><div class="order-status ${o.status==='ready'?'ready':o.status==='preparing'?'preparing':''}">${labels[o.status]}</div><div class="status-actions">${o.status==='queued'?`<button class="button soft admin-order-status" data-id="${esc(o.id)}" data-next="preparing">بدء التحضير</button>`:o.status==='preparing'?`<button class="button lime admin-order-status" data-id="${esc(o.id)}" data-next="ready">جاهز للاستلام</button>`:o.status==='ready'?`<button class="button primary admin-order-status" data-id="${esc(o.id)}" data-next="completed">تأكيد التسليم</button>`:''}</div></article>`;
  const body=`${sectionHead(`طلبات ${esc(shop.name)}`,'سوبر أدمن: عرض وتحديث كل طلبات المتجر.',`<button class="button soft" id="backToShops">← المتاجر</button><button class="button primary" id="adminCreateOrder" ${shop.active?'':'disabled'}>＋ طلب جديد</button>`)}<div class="order-list">${active.length?active.map(renderOrder).join(''):`<div class="panel empty active-empty"><strong>لا توجد طلبات حالية</strong><span>أنشئ طلبًا لهذا المتجر أو راجع المكتمل.</span></div>`}</div><section class="completed-orders"><div class="completed-head"><strong>الطلبات المكتملة <span>${completed.length}</span></strong><button class="mini-button del" id="adminClearCompleted" ${completed.length?'':'disabled'}>تصفير المكتمل</button></div>${completed.length?`<details><summary>عرض الطلبات المكتملة</summary><div class="order-list">${completed.map(renderOrder).join('')}</div></details>`:`<p class="completed-empty">لا توجد طلبات مكتملة حاليًا.</p>`}</section><div class="grid content-grid"><article class="panel card"><div class="eyebrow">إدارة المتجر بالكامل</div><p class="section-sub">تعديل بيانات الحساب ورابط Google Maps والتصميم وطريقة استقبال الطلبات، وإدارة قائمة الأصناف.</p><div class="row-actions"><button class="mini-button" id="adminEditShop">بيانات المتجر</button><button class="mini-button" id="adminEditItems">قائمة الأصناف</button><a class="mini-button" target="_blank" href="/screen/${encodeURIComponent(shop.slug)}">شاشة QR ↗</a></div></article></div>`;
  shell(user,'shops',body);document.getElementById('pageTitle').textContent=`طلبات ${shop.name}`;
  document.getElementById('backToShops').onclick=()=>adminView('shops',user);
  document.getElementById('adminCreateOrder').onclick=()=>storeOrderModal(user,shop);
  document.getElementById('adminClearCompleted').onclick=async()=>{if(!completed.length||!confirm(`سيتم حذف ${completed.length} طلبًا مكتملًا من ${shop.name}. هل تريد المتابعة؟`))return;try{const result=await api(`/api/admin/shops/${encodeURIComponent(shop.id)}/orders/completed`,{method:'DELETE'});toast(`تم تصفير ${result.cleared} طلب مكتمل`);adminShopOrdersView(shop,user);}catch(e){toast(e.message);}};
  document.getElementById('adminEditShop').onclick=()=>shopModal(shop);
  document.getElementById('adminEditItems').onclick=()=>catalogDialog(shop,true);
  app.querySelectorAll('.admin-order-status').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/admin/shops/${encodeURIComponent(shop.id)}/orders/${encodeURIComponent(button.dataset.id)}`,{method:'PATCH',body:json({status:button.dataset.next})});toast('تم تحديث حالة الطلب');adminShopOrdersView(shop,user);}catch(e){button.disabled=false;toast(e.message);}});
}
function shopModal(shop=null){
  const editing=!!shop;
  const orderMode=shop?.orderMode||'catalog';
  const host=document.createElement('div');host.className='modal-backdrop';host.innerHTML=`<form class="modal form-stack" id="shopForm"><div class="modal-head"><div><h2>${editing?'إدارة كاملة للمتجر':'إنشاء مساحة متجر'}</h2><p>${editing?'سوبر أدمن: تعديل بيانات الدخول والإعدادات والتصميم.':'بيانات الدخول ورابط المتجر تنشأ فور الحفظ.'}</p></div><button class="close" type="button" data-close>×</button></div><div class="field"><label>اسم المتجر</label><input class="input" name="name" value="${esc(shop?.name||'')}" placeholder="مثال: مقهى ندى" required minlength="2"></div><div class="form-grid"><div class="field"><label>اسم المستخدم</label><input class="input" name="username" value="${esc(shop?.username||'')}" placeholder="nada.cafe" required pattern="[A-Za-z0-9_.-]{3,40}"></div><div class="field"><label>${editing?'كلمة مرور جديدة (اتركها فارغة للإبقاء عليها)':'كلمة المرور'}</label><input class="input" name="password" type="password" minlength="12" maxlength="128" placeholder="${editing?'12 خانة على الأقل':'12 خانة على الأقل'}" ${editing?'':'required'}></div></div><div class="field"><label>طريقة استقبال الطلبات</label><input type="hidden" name="orderMode" value="${orderMode}"><div class="mode-options"><button type="button" class="mode-card ${orderMode==='catalog'?'selected':''}" data-order-mode="catalog"><strong>قائمة أصناف</strong><small>إدارة أصناف قابلة للبحث والاختيار</small></button><button type="button" class="mode-card ${orderMode==='custom'?'selected':''}" data-order-mode="custom"><strong>طلب يدوي</strong><small>إدخال تفاصيل الطلب كتابةً</small></button></div></div><div class="field"><label>عبارة شاشة البانر</label><input class="input" name="bannerText" maxlength="90" value="${esc(shop?.bannerText||'أهلاً بك — اطلب واستمتع')}"></div><div class="field"><label>المظهر</label><input type="hidden" name="theme" value="${esc(shop?.theme||'studio')}">${themeCards(shop?.theme||'studio')}</div><div class="field"><label>رابط تقييم Google Maps <span class="subtle">— الأدمن فقط</span></label><input class="input" name="reviewUrl" type="url" value="${esc(shop?.reviewUrl||'')}" placeholder="https://maps.app.goo.gl/…"><small>يظهر للعميل بعد تسليم الطلب.</small></div><div class="modal-actions"><button class="button primary" type="submit">${editing?'حفظ التعديلات':'إنشاء المتجر'}</button><button class="button soft" type="button" data-close>إلغاء</button></div></form>`;
  document.body.append(host);attachThemeCards(host);host.querySelectorAll('[data-order-mode]').forEach(b=>b.onclick=()=>{host.querySelector('input[name="orderMode"]').value=b.dataset.orderMode;host.querySelectorAll('[data-order-mode]').forEach(x=>x.classList.toggle('selected',x===b));});host.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>host.remove());host.onclick=e=>{if(e.target===host)host.remove();};
  host.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target;const body={name:f.name.value.trim(),username:f.username.value.trim(),theme:f.theme.value,reviewUrl:f.reviewUrl.value.trim(),orderMode:f.orderMode.value,bannerText:f.bannerText.value.trim()};if(f.password.value)body.password=f.password.value;try{if(editing)await api(`/api/admin/shops/${shop.id}`,{method:'PATCH',body:json(body)});else await api('/api/admin/shops',{method:'POST',body:json({...body,password:f.password.value})});host.remove();toast(editing?'حُفظت التعديلات':'أُنشئ المتجر');adminView('home');}catch(err){toast(err.message);}};
}
async function catalogDialog(shop,admin){
  if(!shop)return;
  const base=admin?`/api/admin/shops/${encodeURIComponent(shop.id)}/items`:'/api/shop/items';
  const host=document.createElement('div');host.className='modal-backdrop';
  host.innerHTML=`<section class="modal form-stack catalog-modal"><div class="modal-head"><div><h2>أصناف ${esc(shop.name)}</h2><p>أضف المنتجات وحدد مدة تحضير كل صنف.</p></div><button class="close" type="button" data-close>×</button></div><form id="itemForm" class="item-form"><input type="hidden" name="id"><div class="form-grid"><div class="field"><label>اسم الصنف</label><input class="input" name="name" placeholder="مثال: لاتيه بارد" required minlength="2"></div><div class="field"><label>التصنيف</label><input class="input" name="category" placeholder="قهوة" maxlength="35"></div></div><div class="form-grid"><div class="field"><label>مدة التحضير (دقائق)</label><input class="input" name="prepMinutes" type="number" min="1" max="180" value="4" required></div><button class="button primary" type="submit" id="itemSave">＋ إضافة الصنف</button></div></form><div class="eyebrow">الأصناف المتاحة</div><div class="catalog-list" id="catalogList"><div class="loading-row">جاري تحميل القائمة…</div></div></section>`;
  document.body.append(host);host.querySelector('[data-close]').onclick=()=>host.remove();host.onclick=e=>{if(e.target===host)host.remove();};
  const form=host.querySelector('#itemForm'),list=host.querySelector('#catalogList');
  const refresh=async()=>{const {items}=await api(base);list.innerHTML=items.length?items.map(i=>`<div class="catalog-row"><div><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${i.prepMinutes} د</small></div><span class="pill ${i.active?'':'off'}">${i.active?'متاح':'مخفي'}</span><div class="row-actions"><button class="mini-button" data-item-edit="${esc(i.id)}">تعديل</button><button class="mini-button" data-item-toggle="${esc(i.id)}" data-active="${i.active}">${i.active?'إخفاء':'إظهار'}</button><button class="mini-button del" data-item-delete="${esc(i.id)}">حذف</button></div></div>`).join(''):`<div class="empty">القائمة فارغة. أضف أول صنف.</div>`;
    list.querySelectorAll('[data-item-edit]').forEach(b=>b.onclick=()=>{const item=items.find(i=>i.id===b.dataset.itemEdit);form.id.value=item.id;form.name.value=item.name;form.category.value=item.category;form.prepMinutes.value=item.prepMinutes;host.querySelector('#itemSave').textContent='حفظ التعديل';form.name.focus();});
    list.querySelectorAll('[data-item-toggle]').forEach(b=>b.onclick=async()=>{await api(`${base}/${b.dataset.itemToggle}`,{method:'PATCH',body:json({active:b.dataset.active!=='true'})});refresh();});
    list.querySelectorAll('[data-item-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف هذا الصنف من قائمة الطلب؟'))return;await api(`${base}/${b.dataset.itemDelete}`,{method:'DELETE'});refresh();});
  };
  form.onsubmit=async e=>{e.preventDefault();const body={name:form.name.value.trim(),category:form.category.value.trim(),prepMinutes:Number(form.prepMinutes.value)};const id=form.id.value;try{await api(id?`${base}/${id}`:base,{method:id?'PATCH':'POST',body:json(body)});form.reset();form.id.value='';form.prepMinutes.value=4;host.querySelector('#itemSave').textContent='＋ إضافة الصنف';refresh();toast(id?'حُفظ الصنف':'أُضيف الصنف');}catch(err){toast(err.message);}};
  refresh();
}
async function storeOrderModal(user,adminShop=null){
  const info=window.storeInfo||{};
  const slug=adminShop?.slug||info.slug||user.slug;
  if(!adminShop&&!slug){toast('تعذر تحديد رابط المتجر');return;}
  let shop;
  try{if(adminShop){const catalog=await api(`/api/admin/shops/${encodeURIComponent(adminShop.id)}/items`);shop={...adminShop,items:(catalog.items||[]).filter(item=>item.active!==false)};}else{const [config,catalog]=await Promise.all([api('/api/shop/config'),api('/api/shop/items')]);shop={...config.shop,items:(catalog.items||[]).filter(item=>item.active!==false)};}}catch(e){toast(e.message);return;}
  const host=document.createElement('div');host.className='modal-backdrop';
  const custom=shop.orderMode==='custom';
  host.innerHTML=`<section class="modal form-stack store-order-modal"><div class="modal-head"><div><h2>إنشاء طلب جديد</h2><p>${custom?'أدخل اسم العميل وتفاصيل الطلب.':'ابحث عن الأصناف وحدد الكمية قبل إرسال الطلب.'}</p></div><button class="close" type="button" data-close aria-label="إغلاق">×</button></div><form id="storeOrderForm" class="form-stack"><div class="field"><label for="storeCustomerName">اسم العميل</label><input class="input" id="storeCustomerName" name="customerName" maxlength="60" placeholder="مثال: أحمد" required minlength="2"></div>${custom?`<div class="field"><label for="storeCustomItem">تفاصيل الطلب</label><textarea class="input" id="storeCustomItem" name="item" rows="3" maxlength="180" placeholder="اكتب تفاصيل الطلب…" required minlength="2"></textarea></div>`:`<label class="search-box"><span>⌕</span><input class="input" id="storeItemSearch" type="search" placeholder="ابحث عن صنف…" autocomplete="off"><kbd>⌕</kbd></label><div class="category-chips" id="storeCategoryChips"></div><div class="store-product-grid" id="storeProductGrid"></div><div class="store-basket" id="storeBasket"><span>لم يتم اختيار أصناف</span></div>`}<div class="modal-actions"><button class="button primary" id="storeSubmit" type="submit" ${custom?'':'disabled'}>إنشاء الطلب</button><button class="button soft" type="button" data-close>إلغاء</button></div></form></section>`;
  document.body.append(host);
  host.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>host.remove());host.onclick=e=>{if(e.target===host)host.remove();};
  const cart=new Map();
  if(!custom){
    const items=shop.items||[];let category='الكل';
    const categories=['الكل',...new Set(items.map(i=>i.category))];
    const chips=host.querySelector('#storeCategoryChips');
    chips.innerHTML=categories.map(c=>`<button type="button" class="category-chip ${c===category?'selected':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('');
    const render=()=>{
      const q=host.querySelector('#storeItemSearch').value.trim().toLocaleLowerCase('ar');
      const matches=items.filter(i=>(category==='الكل'||i.category===category)&&`${i.name} ${i.category}`.toLocaleLowerCase('ar').includes(q));
      host.querySelector('#storeProductGrid').innerHTML=matches.length?matches.map(i=>`<article class="store-product"><div><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${i.prepMinutes} د</small></div><div class="quantity-control"><button type="button" data-minus="${esc(i.id)}" aria-label="تقليل">−</button><span>${cart.get(i.id)||0}</span><button type="button" data-plus="${esc(i.id)}" aria-label="زيادة">＋</button></div></article>`).join(''):`<div class="empty">لا توجد أصناف مطابقة.</div>`;
      const chosen=[...cart].filter(([,n])=>n>0).map(([id,n])=>`${esc(items.find(i=>i.id===id)?.name)} × ${n}`);
      host.querySelector('#storeBasket').innerHTML=chosen.length?`<strong>الأصناف المختارة</strong><span>${chosen.join('، ')}</span>`:'<span>لم يتم اختيار أصناف</span>';
      const submit=host.querySelector('#storeSubmit');submit.disabled=!chosen.length;submit.textContent=chosen.length?`إنشاء الطلب · ${[...cart.values()].reduce((a,b)=>a+b,0)} أصناف`:'اختر صنفًا واحدًا على الأقل';
      host.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{const id=b.dataset.plus;cart.set(id,(cart.get(id)||0)+1);render();});
      host.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{const id=b.dataset.minus,n=(cart.get(id)||0)-1;if(n<=0)cart.delete(id);else cart.set(id,n);render();});
    };
    chips.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;chips.querySelectorAll('.category-chip').forEach(c=>c.classList.toggle('selected',c===b));render();});
    host.querySelector('#storeItemSearch').oninput=render;render();
  }
  host.querySelector('#storeOrderForm').onsubmit=async e=>{
    e.preventDefault();const button=host.querySelector('#storeSubmit');button.disabled=true;
    try{
      const payload={slug,customerName:host.querySelector('[name="customerName"]').value.trim()};
      if(custom)payload.item=host.querySelector('[name="item"]').value.trim();
      else payload.items=[...cart].map(([id,quantity])=>({id,quantity}));
      const endpoint=adminShop?`/api/admin/shops/${encodeURIComponent(adminShop.id)}/orders`:'/api/shop/orders';
      await api(endpoint,{method:'POST',body:json(payload)});host.remove();toast('تم إنشاء الطلب');if(adminShop)await adminShopOrdersView(adminShop,user);else await storeView('home',user);
    }catch(err){toast(err.message);button.disabled=false;}
  };
}
async function storeView(page='home',user) {
  clearTimeout(window.storeTimer);
  const shop=(await api('/api/auth/me')).user;
  if(!shop||shop.role!=='shop'){location.href='/';return;}
  if(page==='menu'){
    const body=`${sectionHead('قائمة الأصناف','أدرج ما يبيعه متجرك وحدد تقدير وقت التحضير.') }<div class="panel card catalog-manage"><div class="catalog-callout"><span class="shop-avatar">☷</span><div><strong>أصناف متجرك</strong><small>تظهر الأصناف المتاحة للعميل مع البحث والتصنيف والمدة التقديرية.</small></div></div><button class="button primary" id="openCatalog">إدارة القائمة <span>←</span></button></div><div class="inline-alert" style="margin-top:13px">يمكن للأدمن أو صاحب المتجر إدارة الأصناف. إخفاء صنف يوقف ظهوره في الطلبات الجديدة، وتبقى الطلبات السابقة كما هي.</div>`;
    shell(user,'menu',body);document.getElementById('pageTitle').textContent='قائمة الأصناف';document.getElementById('openCatalog').onclick=()=>catalogDialog(window.storeInfo,false);return;
  }
  if(page==='design'){
    const data=await api('/api/shop/orders').catch(()=>({orders:[]}));
    const info=window.storeInfo||{};
    const body=`${sectionHead('صوت متجرك','عدّل ما يظهر على شاشة المتجر وبطاقة الحالة بعد المسح.') }<div class="grid content-grid"><article class="panel card"><h2 class="section-title" style="margin:0 0 5px">اختر المظهر</h2><p class="section-sub" style="margin-bottom:16px">الثيم ينعكس على شاشة المتجر وبطاقة حالة الطلب بعد المسح.</p><form id="designForm" class="form-stack"><input type="hidden" name="theme" value="${esc(info.theme||'studio')}">${themeCards(info.theme||'studio')}<div class="field" style="margin-top:7px"><label>عبارة البانر</label><input class="input" name="bannerText" maxlength="90" value="${esc(info.bannerText||'أهلاً بك — اطلب واستمتع')}"></div><div class="shop-hero ${themeClass(info.theme)}" style="margin-top:8px"><div class="hero-stripes"><i></i><i></i><i></i></div><div class="hero-copy"><span class="hero-kicker">YOUR SPACE / YOUR STYLE</span><h2>${esc(info.name||user.name||'متجرك')}</h2><p>هوية واضحة وتجربة سلسة لكل عميل.</p></div></div><button class="button primary" type="submit">حفظ التصميم</button></form></article><aside class="panel card"><div class="eyebrow">روابط المتجر</div><h2 class="section-title" style="margin-top:8px">شاركها بسهولة</h2><p class="section-sub" style="margin-bottom:17px">هذه الروابط دائمة لمتجرك.</p><div class="form-stack"><a class="button soft" target="_blank" href="/screen/${encodeURIComponent(info.slug||'')}">شاشة البانر وQR ↗</a><div class="inline-alert">إضافة وتعديل رابط Google Maps بيد الأدمن فقط.</div></div></aside></div>`;
    shell(user,'design',body);document.getElementById('pageTitle').textContent='تصميم المتجر';attachThemeCards(document.getElementById('view'));
    document.getElementById('designForm').onsubmit=async e=>{e.preventDefault();await api('/api/shop/settings',{method:'PATCH',body:json({theme:e.target.theme.value,bannerText:e.target.bannerText.value})});info.theme=e.target.theme.value;info.bannerText=e.target.bannerText.value;toast('تم حفظ تصميم المتجر');};
    return;
  }
  const {orders}=await api('/api/shop/orders');
  const today=orders.filter(o=>new Date(o.createdAt).toDateString()===new Date().toDateString()).length;
  const activeOrders=orders.filter(o=>o.status!=='completed');
  const completedOrders=orders.filter(o=>o.status==='completed');
  const waiting=activeOrders.filter(o=>o.status==='queued').length,prep=activeOrders.filter(o=>o.status==='preparing').length,ready=activeOrders.filter(o=>o.status==='ready').length;
  const renderOrder=o=>`<article class="order-card"><div class="order-no">#${esc(o.number)}</div><div><div class="order-title">${o.customerName?`<span class="subtle">${esc(o.customerName)} · </span>`:''}${esc(o.item)}</div><div class="order-meta">${new Date(o.createdAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})} · ${o.prepMinutes?`تحضير نحو ${o.prepMinutes} د`:'طلب يدوي'}</div></div><div class="order-status ${o.status==='ready'?'ready':o.status==='preparing'?'preparing':''}">${labels[o.status]}</div><div class="status-actions">${o.status==='queued'?`<button class="button soft next-status" data-status="${esc(o.id)}" data-next="preparing">بدء التحضير</button>`:o.status==='preparing'?`<button class="button lime next-status" data-status="${esc(o.id)}" data-next="ready">جاهز للاستلام</button>`:o.status==='ready'?`<button class="button primary next-status" data-status="${esc(o.id)}" data-next="completed">تأكيد التسليم</button>`:''}</div></article>`;
  const activeList=activeOrders.length?activeOrders.map(renderOrder).join(''):`<div class="panel empty active-empty"><strong>لا توجد طلبات قيد التنفيذ</strong><span>طلبات متجرك الجديدة ستظهر هنا.</span><button class="button primary" id="emptyCreateOrder">＋ إنشاء طلب جديد</button></div>`;
  const completedList=`<section class="completed-orders"><div class="completed-head"><strong>الطلبات المكتملة <span>${completedOrders.length}</span></strong><button class="mini-button del" id="clearCompleted" ${completedOrders.length?'':'disabled'}>تصفير المكتمل</button></div>${completedOrders.length?`<details><summary>عرض الطلبات المكتملة</summary><div class="order-list">${completedOrders.map(renderOrder).join('')}</div></details>`:`<p class="completed-empty">لا توجد طلبات مكتملة حاليًا.</p>`}</section>`;
  const body=`${stats([["طلبات اليوم",today,"منذ بداية اليوم"],["طلبات جديدة",waiting,"بانتظار بدء التحضير"],["قيد التحضير",prep,"اضغط عند الجاهزية"],["جاهزة للاستلام",ready,"بانتظار التسليم"]])}<div class="current-orders-head">${sectionHead('الطلبات الحالية','غيّر الحالة من بطاقة الطلب. حالة الطلب يديرها المتجر.',`<button class="button primary" id="createOrderBtn">＋ طلب جديد</button>`)}</div><div class="order-list" id="ordersList">${activeList}</div>${completedList}<div class="grid content-grid"><aside><div class="shop-hero ${themeClass(window.storeInfo?.theme)}"><div class="hero-stripes"><i></i><i></i><i></i></div><div class="hero-copy"><span class="hero-kicker">STORE / CONTROL</span><h2>${esc(window.storeInfo?.name||user.name||'متجرك')}</h2><p>كل طلب واضح. كل خطوة في وقتها.</p></div></div><div class="panel card" style="margin-top:13px"><div class="eyebrow">روابط سريعة</div><div class="form-stack" style="margin-top:12px"><a class="button soft" target="_blank" href="/screen/${encodeURIComponent(window.storeInfo?.slug||'')}">شاشة البانر وQR ↗</a><button class="button soft" data-page="design">تخصيص الهوية</button><button class="button soft" data-page="menu">إدارة الأصناف</button></div></div></aside></div>`;
  shell(user,'home',body);document.getElementById('pageTitle').textContent='إدارة الطلبات';
  document.getElementById('createOrderBtn')?.addEventListener('click',()=>storeOrderModal(user));
  document.getElementById('emptyCreateOrder')?.addEventListener('click',()=>storeOrderModal(user));
  document.getElementById('clearCompleted').onclick=async()=>{if(!completedOrders.length||!confirm(`سيتم حذف ${completedOrders.length} طلبًا مكتملًا من سجل هذا المتجر. هل تريد المتابعة؟`))return;try{const result=await api('/api/shop/orders/completed',{method:'DELETE'});toast(`تم تصفير ${result.cleared} طلب مكتمل`);storeView('home',user);}catch(e){toast(e.message);}};
  app.querySelectorAll('[data-status]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/shop/orders/${button.dataset.status}`,{method:'PATCH',body:json({status:button.dataset.next})});toast(button.dataset.next==='ready'?'تم إشعار العميل أن طلبه جاهز':'تم تحديث حالة الطلب');storeView('home',user);}catch(e){button.disabled=false;toast(e.message);}});
  app.querySelectorAll('[data-page="design"]').forEach(b=>b.onclick=()=>storeView('design',user));
  window.storeTimer=setTimeout(()=>storeView('home',user),6000);
}
function orderPage(id){
  document.body.className='customer-page';
  app.innerHTML=`<main class="customer-shell" id="orderPage"><header class="customer-brand"><a class="brand" href="/"><span class="brand-mark">ن</span><span>${esc(siteName)}<small>ORDER / LIVE</small></span></a><span class="live">تحديث مباشر</span></header><section class="customer-card"><div class="eyebrow" id="orderShop">بطاقة طلبك</div><div class="ticket"><div><div class="customer-label">ORDER NUMBER</div><div class="ticket-number" id="orderNumber">—</div><h2 id="orderStatus" aria-live="polite">جاري جلب طلبك...</h2><p class="muted" id="orderCustomer"></p><p class="muted" id="orderItem"></p><p class="prep-estimate" id="prepEstimate"></p><div class="progress" id="orderProgress">${orderStates.map((s,i)=>`<div class="progress-step" data-progress="${s}">${['تم الاستلام','التحضير','جاهز','تم التسليم'][i]}</div>`).join('')}</div><button class="button soft notification-setup" id="enableNotify" type="button">◉ فعّل تنبيه الجاهزية</button><p class="notification-hint" id="notifyHint" aria-live="polite">فعّل التنبيه لاستلام إشعار عند جاهزية الطلب.</p><a class="button review-btn hidden" id="reviewBtn" target="_blank" rel="noopener noreferrer">قيّم تجربتك على Google Maps ↗</a></div></div></section></main>`;
  const update=async()=>{try{const data=await api(`/api/public/orders/${encodeURIComponent(id)}`);const {order,shop}=data;document.body.className=`customer-page ${themeClass(shop.theme)}`;document.getElementById('orderShop').textContent=shop.name;document.getElementById('orderNumber').textContent=`#${order.number}`;document.getElementById('orderStatus').textContent=order.statusLabel;document.getElementById('orderCustomer').textContent=order.customerName?`باسم: ${order.customerName}`:'';document.getElementById('orderItem').textContent=order.item;document.getElementById('prepEstimate').textContent=order.prepMinutes?`المدة التقديرية: ${order.prepMinutes} دقائق`:'';document.querySelectorAll('[data-progress]').forEach(el=>el.classList.toggle('done',orderStates.indexOf(el.dataset.progress)<=orderStates.indexOf(order.status)));const review=document.getElementById('reviewBtn');if(order.status==='completed'&&shop.reviewUrl){review.href=shop.reviewUrl;review.classList.remove('hidden');}}catch(e){document.getElementById('orderStatus').textContent=e.message||'تعذر العثور على الطلب';}};
  setupPush(id);update();setInterval(update,3500);
}
function decodeVapidKey(base64){const padding='='.repeat((4-base64.length%4)%4);const raw=atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function setupPush(orderId){
  const button=document.getElementById('enableNotify'),hint=document.getElementById('notifyHint');
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){button.classList.add('hidden');hint.textContent='التحديث المباشر يعمل ما دامت صفحة الطلب مفتوحة.';return;}
  try{const {key}=await api('/api/public/push-key');if(!key){button.disabled=true;hint.textContent='إشعار الخلفية يحتاج إعداد مفتاح الإشعار على الخادم. ستبقى الحالة محدثة داخل الصفحة.';return;}}
  catch{button.disabled=true;hint.textContent='تعذر تهيئة الإشعارات على هذا الخادم.';return;}
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent),standalone=navigator.standalone||matchMedia('(display-mode: standalone)').matches;
  if(ios&&!standalone)hint.textContent='على iPhone: أضف الموقع إلى الشاشة الرئيسية من زر المشاركة، ثم افتحه منها لتفعيل الإشعارات.';
  button.onclick=async()=>{
    if(ios&&!standalone){toast('أضف الموقع إلى الشاشة الرئيسية أولاً لتفعيل إشعارات iPhone.');return;}
    if(Notification.permission==='denied'){hint.textContent='الإشعارات محظورة من إعدادات المتصفح. اسمح بها ثم أعد المحاولة.';return;}
    try{const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted'){hint.textContent='لم يتم السماح بالإشعارات؛ سيبقى تحديث الحالة داخل الصفحة.';return;}
      const {key}=await api('/api/public/push-key');const registration=await navigator.serviceWorker.register('/sw.js');let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapidKey(key)});
      await api(`/api/public/orders/${encodeURIComponent(orderId)}/push`,{method:'POST',body:json({subscription:subscription.toJSON()})});button.textContent='✓ تم تفعيل تنبيه الجاهزية';button.disabled=true;hint.textContent='سيصلك إشعار عندما يغيّر المتجر حالة الطلب إلى جاهز.';
    }catch(error){hint.textContent=error.message||'تعذر تفعيل الإشعار على هذا الجهاز.';}
  };
}
async function screenPage(slug){
  document.body.className='screen-page';app.innerHTML=`<main class="signage"><header class="signage-head"><div class="brand"><span class="brand-mark">ن</span><span id="screenShop">${esc(siteName)}<small>ORDER SCREEN</small></span></div><span class="live">مباشر</span></header><section class="signage-banner" id="banner"><div class="banner-inner"><span class="brand-mark">ن</span><div class="hero-kicker">WELCOME / ORDER HERE</div><h1 id="bannerTitle">أهلاً بك</h1><p id="bannerCopy">امسح رمز طلبك لمتابعة حالته</p></div></section><section class="screen-order" id="screenOrder"><div><div class="eyebrow">NOW SERVING</div><h1 id="screenNumber">#0000</h1><p class="customer-name" id="screenCustomer"></p><p id="screenStatus">جاري التحضير</p></div><img id="screenQr" alt="QR لمتابعة الطلب"></section><footer class="signage-foot"><span>${esc(siteName)} / DIGITAL QUEUE</span><span>امسح الرمز لمتابعة حالة طلبك</span></footer></main>`;
  const update=async()=>{try{const {shop,activeOrder}=await api(`/api/public/screen/${encodeURIComponent(slug)}`);document.body.className=`screen-page ${themeClass(shop.theme)}`;document.getElementById('screenShop').innerHTML=`${esc(shop.name)}<small>ORDER SCREEN</small>`;document.getElementById('bannerTitle').textContent=shop.name;document.getElementById('bannerCopy').textContent=shop.bannerText||'أهلاً بك — اطلب واستمتع';const banner=document.getElementById('banner'),order=document.getElementById('screenOrder');banner.classList.toggle('hidden',!!activeOrder);order.classList.toggle('active',!!activeOrder);if(activeOrder){document.getElementById('screenNumber').textContent=`#${activeOrder.number}`;document.getElementById('screenCustomer').textContent=activeOrder.customerName?`باسم: ${activeOrder.customerName}`:'';document.getElementById('screenStatus').textContent=activeOrder.statusLabel;document.getElementById('screenQr').src=activeOrder.qr;}}catch(e){document.getElementById('bannerTitle').textContent='الرابط غير متاح';}};
  update();setInterval(update,3000);
}
async function boot(){
  const [,userData,publicSettings]=await Promise.all([document.fonts?.ready||Promise.resolve(),api('/api/auth/me').catch(()=>({user:null})),api('/api/public/settings').catch(()=>({settings:{appName:'نوى'}}))]);
  siteName=publicSettings.settings?.appName||'نوى';document.title=`${siteName} | إدارة الطلبات`;
  const p=location.pathname.split('/').filter(Boolean);
  try{
    if(p[0]==='shop'){location.replace('/');return;}
    if(p[0]==='screen'&&p[1])return await screenPage(p[1]);
    if(p[0]==='order'&&p[1])return orderPage(p[1]);
    if(userData.user?.role==='admin')return await adminView('home',userData.user);
    if(userData.user?.role==='shop'){
      const me=userData.user;
      const result=await api('/api/shop/orders');
      window.storeInfo={slug:me.slug,name:me.name,theme:'studio',bannerText:'أهلاً بك — اطلب واستمتع'};
      const adminShops=await api('/api/auth/me');
      if(adminShops.user.shopId){
        const config=await api('/api/shop/config').catch(()=>null);
        if(config)window.storeInfo={...window.storeInfo,...config.shop};
      }
      return await storeView('home',me);
    }
    login();
  }catch(e){console.error(e);login();toast(e.message);}
}
document.addEventListener('keydown',(event)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){const search=document.getElementById('itemSearch');if(search){event.preventDefault();search.focus();}}});
boot();
