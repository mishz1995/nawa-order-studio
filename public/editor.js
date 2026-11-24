const editorFields = {
  login: [
    ['appName', '.login-box .brand > span:not(.brand-mark)', 'اسم الموقع', 40],
    ['branding.loginWelcome', '#loginWelcome', 'عنوان تسجيل الدخول', 60],
    ['branding.loginPrompt', '.login-intro', 'وصف تسجيل الدخول', 60],
    ['branding.loginHeadline', '#loginHeadline', 'العنوان التعريفي', 60],
    ['branding.loginIntro', '#loginIntro', 'النص التعريفي', 60],
    ['branding.loginBackground', '.login-art', 'خلفية الجزء التعريفي', 'color'],
    ['branding.loginButtonLabel', '#loginButtonLabel', 'نص زر الدخول', 60],
    ['branding.loginButtonColor', '#loginForm button', 'خلفية زر الدخول', 'color'],
  ],
  screen: [
    ['name', '#bannerTitle, #screenShop, #screenFooterShop', 'اسم المتجر', 70],
    ['bannerText', '#bannerCopy', 'عبارة البانر', 90],
  ],
  card: [
    ['name', '#orderShop', 'اسم المتجر', 70],
    ['cardColors.panel', '.customer-ticket-status', 'خلفية الحالة', 'color'],
    ['cardColors.accent', '#orderProgress', 'لون مؤشر التقدم', 'color'],
    ['cardColors.surface', '.customer-ticket-info', 'خلفية بيانات الطلب', 'color'],
    ['cardColors.text', '.customer-item-copy', 'لون نص بيانات الطلب', 'color'],
    ['cardColors.border', '.customer-ticket', 'لون حدود البطاقة', 'color'],
  ],
};

// Admin-only direct page editor. It stores a small allow-listed set of style
// properties rather than accepting arbitrary CSS or selectors from the browser.
(() => {
  let active = false, context = null, selected = null, draft = {}, panel = null;
  const editableSelector = 'h1,h2,h3,h4,p,span,strong,small,label,button,a,article,section,aside,header,footer,li,img,input,textarea,select,main,div,form,nav,ul,ol,table,thead,tbody,tr,td,th,figure,figcaption,[role="button"]';
  const getKey = (node) => {
    if (node.id && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(node.id)) return `id:${node.id}`;
    const parts=[];let current=node;
    while(current&&current.id!=='view'&&current.id!=='app'){
      const parent=current.parentElement;if(!parent)break;
      const siblings=[...parent.children].filter(child=>child.tagName===current.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:${siblings.indexOf(current)}`);current=parent;
    }
    return `path:${parts.join('/')}`;
  };
  const targets=()=>{const root=document.querySelector('#view')||document.querySelector('#app');return root?[...root.querySelectorAll(editableSelector)].filter(node=>!node.closest('[data-visual-tools]')&&!node.closest('.language-toggle')&&(node.children.length===0||/^(ARTICLE|SECTION|ASIDE|HEADER|FOOTER|BUTTON|A|IMG|LI)$/.test(node.tagName))):[];};
  const cssMap={color:'color',backgroundColor:'backgroundColor',borderColor:'borderColor',fontSize:'fontSize',fontWeight:'fontWeight',textAlign:'textAlign',borderWidth:'borderWidth',borderStyle:'borderStyle',borderRadius:'borderRadius',padding:'padding',margin:'margin',opacity:'opacity',display:'display'};
  function applyOne(node,edit={}){
    if(Object.hasOwn(edit,'text')&&node.children.length===0&&node.textContent!==edit.text)node.textContent=edit.text;
    for(const [key,property] of Object.entries(cssMap))if(Object.hasOwn(edit,key))node.style[property]=['fontSize','borderWidth','borderRadius','padding','margin'].includes(key)?`${edit[key]}px`:key==='opacity'?String(edit[key]/100):String(edit[key]);
    if(node.tagName==='IMG'){if(edit.image)node.src=edit.image;if(Object.hasOwn(edit,'alt'))node.alt=edit.alt;}
    if(Object.hasOwn(edit,'placeholder'))node.placeholder=edit.placeholder;
  }
  function apply(scope,edits={}){
    if(!scope)return;
    targets().forEach(node=>{const key=getKey(node);node.dataset.visualKey=key;applyOne(node,edits[key]||{});});
  }
  function selectedEdit(){return {...(context.allEdits?.[context.scope]?.[selected]||{}),...(draft[selected]||{})};}
  function clearSelection(){document.querySelectorAll('[data-visual-selected]').forEach(n=>delete n.dataset.visualSelected);selected=null;}
  function closePanel(){panel?.remove();panel=null;}
  function stop(){active=false;clearSelection();document.body.classList.remove('visual-editing');closePanel();document.removeEventListener('click',onPick,true);document.removeEventListener('mouseover',onHover,true);}
  function onHover(event){const node=event.target.closest('[data-visual-key]');document.querySelectorAll('[data-visual-hover]').forEach(n=>delete n.dataset.visualHover);if(node&&!node.closest('[data-visual-tools]'))node.dataset.visualHover='';}
  function onPick(event){if(event.target.closest('[data-visual-tools]'))return;const node=event.target.closest('[data-visual-key]');if(!node){const isToggle=event.target.closest('#inlineEditToggle,#publicVisualEdit');if(!isToggle&&!event.target.closest('#view')){if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد مغادرة التحرير؟')){event.preventDefault();event.stopImmediatePropagation();return;}stop();}return;}event.preventDefault();event.stopPropagation();select(node);}
  function field(label,key,type='text',value='',attrs='') {const escaped=String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');return `<label class="visual-field"><span>${label}</span>${type==='select'?`<select data-prop="${key}" ${attrs}><option value="${escaped}">${escaped||'تلقائي'}</option></select>`:`<input data-prop="${key}" type="${type}" value="${escaped}" ${attrs}>`}</label>`;}
  function renderPanel(){
    if(!panel)return;
    const node=selected&&document.querySelector(`[data-visual-key="${CSS.escape(selected)}"]`),edit=selectedEdit(),leaf=node?.children.length===0;
    panel.innerHTML=`<header class="visual-editor-head"><div><strong>تحرير العنصر</strong><small>${node?`${node.tagName.toLowerCase()} · ${selected}`:'اختر عنصرًا من الصفحة'}</small></div><button type="button" class="visual-close" data-close aria-label="إغلاق">×</button></header>
      ${node?`<div class="visual-editor-grid">
        ${leaf&&!['IMG','INPUT','TEXTAREA','SELECT'].includes(node.tagName)?field('النص','text','text',edit.text??node.textContent.trim(),'maxlength="160"'):''}
        ${['INPUT','TEXTAREA'].includes(node.tagName)?field('النص الإرشادي','placeholder','text',edit.placeholder??node.placeholder,'maxlength="160"'):''}
        ${field('لون النص','color','color',edit.color||'#171914')}${field('لون الخلفية','backgroundColor','color',edit.backgroundColor||'#ffffff')}
        ${field('حجم الخط (px)','fontSize','number',edit.fontSize??parseInt(getComputedStyle(node).fontSize,10),'min="8" max="96"')}
        ${field('سماكة الخط','fontWeight','select',edit.fontWeight??getComputedStyle(node).fontWeight)}
        ${field('محاذاة النص','textAlign','select',edit.textAlign||getComputedStyle(node).textAlign)}${field('نمط الحد','borderStyle','select',edit.borderStyle||getComputedStyle(node).borderStyle)}
        ${field('لون الحد','borderColor','color',edit.borderColor||'#d9d9d2')}${field('عرض الحد (px)','borderWidth','number',edit.borderWidth??parseInt(getComputedStyle(node).borderWidth,10),'min="0" max="128"')}
        ${field('تقويس الحد (px)','borderRadius','number',edit.borderRadius??parseInt(getComputedStyle(node).borderRadius,10),'min="0" max="128"')}
        ${field('الحشو الداخلي (px)','padding','number',edit.padding??parseInt(getComputedStyle(node).padding,10),'min="0" max="128"')}${field('الهامش (px)','margin','number',edit.margin??parseInt(getComputedStyle(node).margin,10),'min="0" max="128"')}
        ${field('الشفافية %','opacity','number',edit.opacity??Math.round(parseFloat(getComputedStyle(node).opacity)*100),'min="0" max="100"')}
        ${field('الظهور','display','select',edit.display||'')}
        ${node.tagName==='IMG'?`${field('النص البديل للصورة','alt','text',edit.alt??node.alt,'maxlength="160"')}<label class="visual-field"><span>استبدال الصورة</span><input data-image type="file" accept="image/png,image/jpeg,image/webp"></label>`:''}
      </div><div class="visual-editor-actions"><button type="button" class="button soft" data-reset>مسح تعديلات العنصر</button><button type="button" class="button primary" data-save>حفظ ونشر</button></div><p class="visual-editor-note" role="status"></p>`:''}`;
    panel.querySelector('[data-close]').onclick=()=>{if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد إغلاق المحرر؟'))return;stop();};
    panel.querySelectorAll('[data-prop]').forEach(input=>input.oninput=()=>{const prop=input.dataset.prop;let value=input.value;if(input.type==='number'){if(value===''||!Number.isFinite(Number(value)))return;value=Math.max(0,Math.min(prop==='fontSize'?96:128,Math.round(Number(value))));}else if(input.type==='color'&&!/^#[0-9a-f]{6}$/i.test(value))return;draft[selected]={...(draft[selected]||{}),[prop]:value};if(input.type==='color'||input.type==='number'||['fontWeight','textAlign','display'].includes(prop))applyOne(node,draft[selected]);else if(prop==='text')applyOne(node,draft[selected]);});
    panel.querySelectorAll('select[data-prop]').forEach(input=>{const p=input.dataset.prop,choices=p==='fontWeight'?['400','500','600','700','800']:p==='textAlign'?['start','center','end','left','right']:p==='borderStyle'?['none','solid','dashed','dotted']:['','none','block','flex','grid','inline','inline-flex'];input.innerHTML=choices.map(v=>`<option value="${v}">${v||'تلقائي'}</option>`).join('');input.value=edit[p]??(p==='fontWeight'?getComputedStyle(node).fontWeight:p==='textAlign'?getComputedStyle(node).textAlign:p==='borderStyle'?getComputedStyle(node).borderStyle:'');input.onchange=()=>{draft[selected]={...(draft[selected]||{})};if(!input.value){delete draft[selected][p];applyOne(node,selectedContextEdits()[selected]||{});return;}draft[selected][p]=p==='fontWeight'?Number(input.value):input.value;applyOne(node,draft[selected]);};});
    panel.querySelector('[data-image]')?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file||file.size>1_000_000){panel.querySelector('.visual-editor-note').textContent='حجم الصورة يجب ألا يتجاوز 1 ميغابايت.';return;}const reader=new FileReader();reader.onload=()=>{const image=String(reader.result||'');if(!/^data:image\/(?:webp|png|jpeg);base64,/.test(image))return;draft[selected]={...(draft[selected]||{}),image};applyOne(node,draft[selected]);};reader.readAsDataURL(file);});
    panel.querySelector('[data-reset]').onclick=()=>{delete draft[selected];apply(selectedContextEdits());select(node);};
    panel.querySelector('[data-save]').onclick=save;
  }
  function selectedContextEdits(){return context.allEdits?.[context.scope]||{};}
  function select(node){clearSelection();selected=node.dataset.visualKey;node.dataset.visualSelected='';renderPanel();}
  async function save(){
    if(!context||!Object.keys(draft).length)return;
    const next={...(context.allEdits||{}),[context.scope]:{...selectedContextEdits(),...draft}};
    const payload={visualEdits:next};
    try{
      if(context.layer==='site'){const result=await api('/api/admin/settings',{method:'PATCH',body:json(payload)});window.siteVisualEdits=result.settings.visualEdits;context.allEdits=window.siteVisualEdits;}
      else if(context.shopId){const result=await api(`/api/admin/shops/${encodeURIComponent(context.shopId)}`,{method:'PATCH',body:json(payload)});context.allEdits=result.shop.visualEdits;if(window.storeInfo?.id===context.shopId)window.storeInfo.visualEdits=context.allEdits;}
      else throw new Error('تعذر تحديد المتجر للحفظ.');
      draft={};apply(context.scope,context.allEdits[context.scope]);panel.querySelector('.visual-editor-note').textContent='تم نشر التعديلات.';toast('تم نشر التعديلات');renderPanel();
    }catch(error){panel.querySelector('.visual-editor-note').textContent=error.message;}
  }
  window.applyInlineVisualEdits=apply;
  window.startInlineVisualEditor=({scope,layer,shopId,allEdits={}})=>{
    if(window.currentUser?.role!=='admin')return;
    if(active){if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد إغلاق المحرر؟'))return;stop();return;}
    stop();context={scope,layer,shopId,allEdits:JSON.parse(JSON.stringify(allEdits||{}))};draft={};apply(scope,context.allEdits[scope]||{});
    active=true;document.body.classList.add('visual-editing');panel=document.createElement('aside');panel.className='visual-editor-panel';panel.dataset.visualTools='';panel.setAttribute('aria-label','تحرير عناصر الصفحة');document.body.append(panel);document.addEventListener('click',onPick,true);document.addEventListener('mouseover',onHover,true);renderPanel();toast('اضغط على أي نص أو زر أو صورة أو بطاقة لتعديلها.');
  };
})();

async function visualEditorView(user, selectedShop = '') {
  if (user.role !== 'admin') return;
  let settings, shops;
  try {
    [{ settings }, { shops }] = await Promise.all([api('/api/admin/settings'), api('/api/admin/shops')]);
  } catch (error) {
    toast(error.message);
    return;
  }
  let shop = shops.find(item => item.id === selectedShop);
  let surface = shop ? 'screen' : 'login';
  let draft = {};
  let frameDocument;
  let saving = false;

  shell(user, 'editor', `
    <div class="editor-toolbar">
      <label class="field">نطاق التعديل
        <select class="input" id="editorScope"><option value="">الموقع · تسجيل الدخول</option>
          ${shops.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field" id="editorSurfaceField">واجهة المتجر
        <select class="input" id="editorSurface">
          <option value="screen">شاشة البانر والطلبات</option><option value="card">بطاقة العميل</option>
        </select>
      </label>
      <div class="editor-actions">
        <button class="button soft" id="editorDiscard" type="button">إلغاء المسودة</button>
        <button class="button primary" id="editorSave" type="button">نشر التغييرات</button>
      </div>
    </div>
    <div class="editor-layout">
      <iframe class="editor-frame" id="editorFrame" title="معاينة التصميم" sandbox="allow-same-origin"></iframe>
      <section class="panel card form-stack editor-properties" aria-labelledby="editorProperties">
        <h2 id="editorProperties" class="section-title">خصائص العنصر</h2>
        <p class="section-sub">اضغط على العنصر في المعاينة، أو اختره من القائمة.</p>
        <label class="field">العنصر<select class="input" id="editorElement"></select></label>
        <label class="field"><span id="editorValueLabel"></span><input class="input" id="editorValue"></label>
        <p class="section-sub" id="editorStatus" role="status"></p>
      </section>
    </div>`);
  document.getElementById('pageTitle').textContent = 'التحرير';
  const scope = document.getElementById('editorScope');
  const surfaceInput = document.getElementById('editorSurface');
  const element = document.getElementById('editorElement');
  const input = document.getElementById('editorValue');
  const frame = document.getElementById('editorFrame');
  const status = document.getElementById('editorStatus');
  const save = document.getElementById('editorSave');
  const discard = document.getElementById('editorDiscard');
  const dirty = () => Object.keys(draft).length > 0;
  const canLeave = () => !saving && (!dirty() || confirm('عند المتابعة ستفقد التغييرات غير المنشورة. هل تريد المتابعة؟'));
  const read = (record, path) => path.split('.').reduce((value, key) => value?.[key], record);
  const savedValue = path => read(shop || settings, path) ?? '';
  const value = path => draft[path] ?? savedValue(path);
  const selectedField = () => editorFields[surface].find(([path]) => path === element.value);

  function updateControls(message = '') {
    const invalid = Object.keys(draft).some(path => {
      if (path === 'appName' || path === 'name') return draft[path].trim().length < 2;
      return path !== 'bannerText' && !draft[path].trim();
    });
    save.disabled = saving || !dirty() || invalid;
    discard.disabled = saving || !dirty();
    scope.disabled = saving;
    surfaceInput.disabled = saving;
    input.disabled = saving;
    status.textContent = message || (invalid ? 'أدخل نصًا صالحًا قبل النشر.' : dirty() ? 'عندك تغييرات غير منشورة.' : '');
  }

  function paint() {
    if (!frameDocument) return;
    const root = frameDocument.documentElement;
    const setText = (selector, text) => frameDocument.querySelectorAll(selector).forEach(target => {
      target.textContent = text;
    });
    for (const [path, selector,, kind] of editorFields[surface]) {
      if (kind !== 'color') setText(selector, path === 'bannerText' ? value(path) || brandCopy.screenInstructions : value(path));
    }
    if (surface === 'login') {
      frameDocument.querySelector('.login-art').style.backgroundColor = value('branding.loginBackground');
      frameDocument.querySelector('#loginForm button').style.backgroundColor = value('branding.loginButtonColor');
      const artName = frameDocument.querySelector('.login-art .brand > span:not(.brand-mark)')?.firstChild;
      if (artName) artName.textContent = value('appName');
    } else if (surface === 'card') {
      for (const key of Object.keys(shop.cardColors)) root.style.setProperty(`--customer-card-${key}`, value(`cardColors.${key}`));
    }
    applyTextOverrides(frameDocument.body);
    applyLanguage(frameDocument.body);
  }

  function selectField(path) {
    element.value = path;
    const [, selector, label, kind] = selectedField();
    document.getElementById('editorValueLabel').textContent = label;
    input.type = kind === 'color' ? 'color' : 'text';
    if (kind === 'color') input.removeAttribute('maxlength');
    else input.maxLength = kind;
    input.value = value(path);
    frameDocument?.querySelectorAll('[data-editor-target]').forEach(target => target.removeAttribute('data-editor-selected'));
    frameDocument?.querySelectorAll(selector).forEach(target => target.setAttribute('data-editor-selected', ''));
  }

  function renderPreview() {
    frameDocument = null;
    document.getElementById('editorSurfaceField').hidden = !shop;
    scope.value = shop?.id || '';
    surfaceInput.value = shop ? surface : 'screen';
    element.innerHTML = editorFields[surface].map(([path,, label]) => `<option value="${path}">${label}</option>`).join('');
    selectField(element.value);
    const markup = surface === 'login' ? loginMarkup() : surface === 'screen' ? screenMarkup() : orderMarkup();
    const bodyClass = shop ? `${surface === 'card' ? 'customer' : 'screen'}-page ${themeClass(shop.theme)}` : '';
    const shopStyle = shop?.customCssEnabled ? `<link rel="stylesheet" href="/api/public/shop-style.css/${encodeURIComponent(shop.slug)}/${surface}">` : '';
    frame.srcdoc = `<!doctype html><html lang="${document.documentElement.lang}" dir="${document.documentElement.dir}"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/feature.css">
      <link rel="stylesheet" href="/interaction.css"><link rel="stylesheet" href="/customer.css">
      <link rel="stylesheet" href="/api/public/custom-style.css">${shopStyle}
      <link rel="stylesheet" href="/editor.css"></head><body class="${bodyClass}"><div id="app">${markup}</div></body></html>`;
    updateControls();
  }

  frame.onload = () => {
    frameDocument = frame.contentDocument;
    if (!frameDocument?.querySelector('#app')) return;
    if (surface === 'screen' && shop.bannerImage) frameDocument.querySelector('.signage-photo').src = shop.bannerImage;
    if (surface === 'card') {
      frameDocument.getElementById('orderNumber').textContent = '1024';
      frameDocument.getElementById('orderItem').textContent = 'قهوة وكرواسون';
      frameDocument.getElementById('orderStatus').textContent = labels.preparing;
      frameDocument.querySelector('[data-progress="preparing"]').classList.add('current');
      if (shop.iconImage) {
        const logo = frameDocument.getElementById('orderShopLogo');
        logo.src = shop.iconImage;
        logo.classList.remove('hidden');
        logo.parentElement.classList.remove('hidden');
      }
      const { padding, radius, scale, shadow } = shop.cardStyle;
      const style = frameDocument.documentElement.style;
      style.setProperty('--customer-card-content-padding', `${padding}px`);
      style.setProperty('--customer-card-radius', `${radius}px`);
      style.setProperty('--customer-card-scale', String(scale / 100));
      style.setProperty('--customer-card-shadow', `${shadow}%`);
    }
    for (const [path, selector] of editorFields[surface]) {
      frameDocument.querySelectorAll(selector).forEach(target => { target.dataset.editorTarget = path; });
    }
    frameDocument.addEventListener('click', event => {
      event.preventDefault();
      const target = event.target.closest('[data-editor-target]');
      if (target && !saving) selectField(target.dataset.editorTarget);
    }, true);
    frameDocument.addEventListener('submit', event => event.preventDefault());
    frameDocument.querySelectorAll('input').forEach(field => { field.disabled = true; });
    paint();
    selectField(element.value);
  };

  element.onchange = () => selectField(element.value);
  input.oninput = () => {
    const [path] = selectedField();
    if (input.value === savedValue(path)) delete draft[path];
    else draft[path] = input.value;
    paint();
    updateControls();
  };
  scope.onchange = () => {
    if (!canLeave()) { scope.value = shop?.id || ''; return; }
    shop = shops.find(item => item.id === scope.value);
    surface = shop ? 'screen' : 'login';
    draft = {};
    renderPreview();
  };
  surfaceInput.onchange = () => {
    if (!canLeave()) { surfaceInput.value = surface; return; }
    surface = surfaceInput.value;
    draft = {};
    renderPreview();
  };
  discard.onclick = () => {
    draft = {};
    paint();
    selectField(element.value);
    updateControls('تم إلغاء المسودة.');
  };
  save.onclick = async () => {
    const payload = {};
    for (const [path, text] of Object.entries(draft)) {
      const [group, key] = path.split('.');
      if (key) (payload[group] ||= {})[key] = text.trim();
      else payload[group] = text.trim();
    }
    saving = true;
    updateControls('جارٍ نشر التغييرات…');
    let message;
    try {
      if (shop) {
        const result = await api(`/api/admin/shops/${encodeURIComponent(shop.id)}`, { method:'PATCH', body:json(payload) });
        Object.assign(shop, result.shop);
        scope.selectedOptions[0].textContent = shop.name;
      } else {
        ({ settings } = await api('/api/admin/settings', { method:'PATCH', body:json(payload) }));
        siteName = settings.appName;
        brandCopy = settings.branding;
        syncPlatformIcon();
      }
      draft = {};
      paint();
      selectField(element.value);
      message = 'تم نشر التغييرات.';
    } catch (error) {
      message = error.message;
    } finally {
      saving = false;
      updateControls(message);
    }
  };
  app.querySelector('.shell').addEventListener('click', event => {
    if (event.target.closest('[data-page], #refreshBtn, #logoutBtn') && !canLeave()) event.stopImmediatePropagation();
  }, true);
  renderPreview();
}
