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

// Admin-only direct page editor. It stores allow-listed style values rather
// than accepting arbitrary CSS or selectors from the browser.
(() => {
  let active = false, context = null, selected = null, draft = {}, deleted = new Set(), panel = null;
  const editableSelector = '*';
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
  const targets=(targetDoc=document)=>[targetDoc.body,...targetDoc.body.querySelectorAll(editableSelector)].filter(node=>!node.closest('[data-visual-tools]')&&!node.closest('.language-toggle')&&!/^(SCRIPT|STYLE|LINK|META|TITLE|NOSCRIPT)$/.test(node.tagName)&&(node.children.length===0||/^(HTML|BODY|MAIN|ARTICLE|SECTION|ASIDE|HEADER|FOOTER|BUTTON|A|IMG|INPUT|TEXTAREA|SELECT|FORM|NAV|UL|OL|TABLE|THEAD|TBODY|TR|TD|TH|FIGURE|FIGCAPTION|DIV|SPAN|SVG|PATH)$/.test(node.tagName)));
  const targetDoc=()=>context?.targetDoc||document;
  const cssMap={color:'color',backgroundColor:'backgroundColor',borderColor:'borderColor',fill:'fill',stroke:'stroke',fontSize:'fontSize',fontWeight:'fontWeight',textAlign:'textAlign',textTransform:'textTransform',borderWidth:'borderWidth',borderStyle:'borderStyle',borderRadius:'borderRadius',padding:'padding',margin:'margin',width:'width',height:'height',minWidth:'minWidth',minHeight:'minHeight',maxWidth:'maxWidth',maxHeight:'maxHeight',gap:'gap',lineHeight:'lineHeight',letterSpacing:'letterSpacing',opacity:'opacity',display:'display',objectFit:'objectFit',objectPosition:'objectPosition',flexDirection:'flexDirection',justifyContent:'justifyContent',alignItems:'alignItems',boxShadow:'boxShadow'};
  function applyOne(node,edit={}){
    node.__visualOriginals ||= {styles:{},attrs:{},text:null};
    const original=node.__visualOriginals;
    if(Object.hasOwn(edit,'text')&&original.text===null&&node.children.length===0)original.text=node.textContent;
    for(const property of Object.values(cssMap)){if(!Object.hasOwn(original.styles,property))original.styles[property]=node.style[property];node.style[property]=original.styles[property];}
    if(!Object.hasOwn(original.styles,'backgroundImage'))original.styles.backgroundImage=node.style.backgroundImage;
    node.style.backgroundImage=original.styles.backgroundImage;
    for(const attr of ['placeholder','alt','src']){if(!Object.hasOwn(original.attrs,attr))original.attrs[attr]=node.getAttribute(attr);if(original.attrs[attr]===null)node.removeAttribute(attr);else node.setAttribute(attr,original.attrs[attr]);}
    if(original.text!==null&&node.children.length===0)node.textContent=original.text;
    if(Object.hasOwn(edit,'text')&&node.children.length===0&&node.textContent!==edit.text)node.textContent=edit.text;
    for(const [key,property] of Object.entries(cssMap))if(Object.hasOwn(edit,key))node.style[property]=['fontSize','borderWidth','borderRadius','padding','margin','width','height','minWidth','minHeight','maxWidth','maxHeight','gap','lineHeight','letterSpacing'].includes(key)?`${edit[key]}px`:key==='opacity'?String(edit[key]/100):key==='boxShadow'?({none:'none',soft:'0 4px 14px rgba(23,25,20,.12)',medium:'0 10px 28px rgba(23,25,20,.18)',strong:'0 18px 48px rgba(23,25,20,.25)'}[edit[key]]):String(edit[key]);
    if(node.tagName==='IMG'){if(edit.image)node.src=edit.image;if(Object.hasOwn(edit,'alt'))node.alt=edit.alt;}
    if(Object.hasOwn(edit,'placeholder'))node.placeholder=edit.placeholder;
    if(edit.backgroundImage)node.style.backgroundImage=`url("${edit.backgroundImage}")`;
  }
  function apply(scope,edits={},doc=document){
    if(!scope)return;
    targets(doc).forEach(node=>{const key=getKey(node);node.dataset.visualKey=key;applyOne(node,edits[key]||{});});
  }
  function selectedEdit(){return deleted.has(selected)?{...draft[selected]}:{...(context.allEdits?.[context.scope]?.[selected]||{}),...(draft[selected]||{})};}
  const numberStyle=(node,key,fallback='')=>{const parsed=parseFloat(getComputedStyle(node)[key]);return Number.isFinite(parsed)?Math.round(parsed):fallback;};
  function clearSelection(){targetDoc().querySelectorAll('[data-visual-selected]').forEach(n=>delete n.dataset.visualSelected);selected=null;}
  function closePanel(){panel?.remove();panel=null;}
  function parentNavigation(event){if(event.target.closest('#inlineEditToggle,#publicVisualEdit,[data-visual-tools]'))return;if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد مغادرة التحرير؟')){event.preventDefault();event.stopImmediatePropagation();return;}stop();}
  function stop(){const doc=targetDoc();active=false;clearSelection();doc.body.classList.remove('visual-editing');closePanel();doc.removeEventListener('click',onPick,true);doc.removeEventListener('mouseover',onHover,true);if(doc!==document)document.removeEventListener('click',parentNavigation,true);}
  function onHover(event){const doc=event.currentTarget;doc.querySelectorAll('[data-visual-hover]').forEach(n=>delete n.dataset.visualHover);if(event.target.closest('[data-visual-tools]'))return;const node=event.target.closest('[data-visual-key]');if(node)node.dataset.visualHover='';}
  function onPick(event){if(event.target.closest('[data-visual-tools]'))return;const node=event.target.closest('[data-visual-key]');if(!node){const isToggle=event.target.closest('#inlineEditToggle,#publicVisualEdit');if(!isToggle&&!event.target.closest('#view')){if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد مغادرة التحرير؟')){event.preventDefault();event.stopImmediatePropagation();return;}stop();}return;}event.preventDefault();event.stopPropagation();select(node);}
  function colorFor(node,property,fallback){const computed=getComputedStyle(node)[property];if(property==='backgroundColor'&&/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(computed))return 'transparent';const match=computed?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);if(match)return `#${match.slice(1,4).map(part=>Number(part).toString(16).padStart(2,'0')).join('')}`;try{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.fillStyle='#000000';ctx.fillStyle=computed;ctx.fillRect(0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;return `#${[r,g,b].map(part=>part.toString(16).padStart(2,'0')).join('')}`;}catch{return fallback;}}
  function field(label,key,type='text',value='',attrs='') {const escaped=String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'),hex=/^#[0-9a-f]{6}$/i.test(escaped)?escaped:'#ffffff';return `<label class="visual-field"><span>${label}</span>${type==='select'?`<select data-prop="${key}" ${attrs}><option value="${escaped}">${escaped||'تلقائي'}</option></select>`:type==='color'?`<div class="visual-color-controls"><input data-prop="${key}" type="color" value="${hex}"><input data-color-hex="${key}" type="text" inputmode="text" maxlength="7" value="${hex}" aria-label="قيمة HEX">${key==='backgroundColor'?`<span class="visual-transparent"><input data-transparent="${key}" type="checkbox" ${escaped==='transparent'?'checked':''}> شفاف</span>`:''}</div>`:`<input data-prop="${key}" type="${type}" value="${escaped}" ${attrs}>`}</label>`;}
  function renderPanel(){
    if(!panel)return;
    const node=selected&&targetDoc().querySelector(`[data-visual-key="${CSS.escape(selected)}"]`),edit=selectedEdit(),leaf=node?.children.length===0;
    panel.innerHTML=`<header class="visual-editor-head"><div><strong>تحرير العنصر</strong><small>${node?`${node.tagName.toLowerCase()} · ${selected}`:'اختر عنصرًا من الصفحة'}</small></div><button type="button" class="visual-close" data-close aria-label="إغلاق">×</button></header>
      ${node?`<div class="visual-editor-grid">
        ${leaf&&!['IMG','INPUT','TEXTAREA','SELECT'].includes(node.tagName)?field('النص','text','text',edit.text??node.textContent.trim(),'maxlength="160"'):''}
        ${['INPUT','TEXTAREA'].includes(node.tagName)?field('النص الإرشادي','placeholder','text',edit.placeholder??node.placeholder,'maxlength="160"'):''}
        ${field('لون النص','color','color',edit.color||colorFor(node,'color','#171914'))}${field('لون الخلفية','backgroundColor','color',Object.hasOwn(edit,'backgroundColor')?edit.backgroundColor:colorFor(node,'backgroundColor','#ffffff'))}
        ${node.namespaceURI==='http://www.w3.org/2000/svg'?`${field('لون تعبئة الأيقونة','fill','color',edit.fill||colorFor(node,'fill','#171914'))}${field('لون خط الأيقونة','stroke','color',edit.stroke||colorFor(node,'stroke','#171914'))}`:''}
        ${field('حجم الخط (px)','fontSize','number',edit.fontSize??numberStyle(node,'fontSize',16),'min="8" max="96"')}
        ${field('سماكة الخط','fontWeight','select',edit.fontWeight??getComputedStyle(node).fontWeight)}
        ${field('محاذاة النص','textAlign','select',edit.textAlign||getComputedStyle(node).textAlign)}${field('نمط الحد','borderStyle','select',edit.borderStyle||getComputedStyle(node).borderStyle)}
        ${field('لون الحد','borderColor','color',edit.borderColor||colorFor(node,'borderColor','#d9d9d2'))}${field('عرض الحد (px)','borderWidth','number',edit.borderWidth??numberStyle(node,'borderWidth'),'min="0" max="128"')}
        ${field('تقويس الحد (px)','borderRadius','number',edit.borderRadius??numberStyle(node,'borderRadius'),'min="0" max="128"')}
        ${field('الحشو الداخلي (px)','padding','number',edit.padding??numberStyle(node,'padding'),'min="0" max="128"')}${field('الهامش (px)','margin','number',edit.margin??numberStyle(node,'margin'),'min="0" max="128"')}
        ${field('العرض (px)','width','number',edit.width??Math.round(node.getBoundingClientRect().width),'min="0" max="1600"')}${field('الارتفاع (px)','height','number',edit.height??Math.round(node.getBoundingClientRect().height),'min="0" max="1600"')}
        ${field('المسافة بين العناصر (px)','gap','number',edit.gap??numberStyle(node,'gap'),'min="0" max="256"')}${field('تباعد السطور (px)','lineHeight','number',edit.lineHeight??numberStyle(node,'lineHeight'),'min="0" max="256"')}
        ${field('تباعد الأحرف (px)','letterSpacing','number',edit.letterSpacing??numberStyle(node,'letterSpacing'),'min="-20" max="256"')}
        ${field('اتجاه العناصر','flexDirection','select',edit.flexDirection||getComputedStyle(node).flexDirection)}${field('توزيع العناصر','justifyContent','select',edit.justifyContent||getComputedStyle(node).justifyContent)}
        ${field('محاذاة العناصر','alignItems','select',edit.alignItems||getComputedStyle(node).alignItems)}${field('الظل','boxShadow','select',edit.boxShadow||'')}
        ${field('تحويل حالة الأحرف','textTransform','select',edit.textTransform||getComputedStyle(node).textTransform)}
        ${field('الشفافية %','opacity','number',edit.opacity??Math.round(parseFloat(getComputedStyle(node).opacity)*100),'min="0" max="100"')}
        ${field('الظهور','display','select',edit.display||'')}
        ${node.tagName==='IMG'?`${field('النص البديل للصورة','alt','text',edit.alt??node.alt,'maxlength="160"')}<label class="visual-field"><span>ملاءمة الصورة</span><select data-prop="objectFit"><option value="contain">احتواء</option><option value="cover">ملء مع قص</option><option value="fill">تمدد</option></select></label>${field('موضع الصورة','objectPosition','select',edit.objectPosition||'center')}<label class="visual-field"><span>استبدال الصورة</span><input data-image="image" type="file" accept="image/png,image/jpeg,image/webp"></label>`:''}
        <label class="visual-field"><span>صورة خلفية للعنصر</span><input data-image="backgroundImage" type="file" accept="image/png,image/jpeg,image/webp"></label>
      </div><div class="visual-editor-actions"><button type="button" class="button soft" data-reset>مسح تعديلات العنصر</button><button type="button" class="button primary" data-save>حفظ ونشر</button></div><p class="visual-editor-note" role="status"></p>`:''}`;
    panel.querySelector('[data-close]').onclick=()=>{if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد إغلاق المحرر؟'))return;stop();};
    panel.querySelectorAll('[data-prop]').forEach(input=>input.oninput=()=>{const prop=input.dataset.prop;let value=input.value;if(input.type==='number'){if(value===''||!Number.isFinite(Number(value)))return;const max=['width','height','minWidth','minHeight','maxWidth','maxHeight'].includes(prop)?1600:prop==='fontSize'?96:256,min=prop==='letterSpacing'?-20:0;value=Math.max(min,Math.min(max,Math.round(Number(value))));}else if(input.type==='color'&&!/^#[0-9a-f]{6}$/i.test(value))return;deleted.delete(selected);draft[selected]={...(draft[selected]||{}),[prop]:input.type==='number'?Number(value):value};if(input.type==='color'){const hex=panel.querySelector(`[data-color-hex="${prop}"]`);if(hex)hex.value=value;}if(input.type==='color'||input.type==='number'||['fontWeight','textAlign','display','objectFit','objectPosition','flexDirection','justifyContent','alignItems','boxShadow','textTransform'].includes(prop))applyOne(node,selectedEdit());else if(prop==='text'||prop==='placeholder'||prop==='alt')applyOne(node,selectedEdit());});
    panel.querySelectorAll('[data-color-hex]').forEach(input=>input.oninput=()=>{const value=input.value.trim();if(!/^#[0-9a-f]{6}$/i.test(value))return;const color=panel.querySelector(`[data-prop="${input.dataset.colorHex}"][type="color"]`);if(color){color.value=value;color.dispatchEvent(new Event('input',{bubbles:true}));}});
    panel.querySelectorAll('[data-transparent]').forEach(input=>input.onchange=()=>{const prop=input.dataset.transparent,color=panel.querySelector(`[data-prop="${prop}"][type="color"]`);deleted.delete(selected);draft[selected]={...(draft[selected]||{}),[prop]:input.checked?'transparent':color?.value||'#ffffff'};applyOne(node,selectedEdit());});
    panel.querySelectorAll('select[data-prop]').forEach(input=>{const p=input.dataset.prop,choices=p==='fontWeight'?['400','500','600','700','800']:p==='textAlign'?['start','center','end','left','right']:p==='borderStyle'?['none','solid','dashed','dotted']:p==='objectFit'?['contain','cover','fill','none','scale-down']:p==='objectPosition'?['center','top','bottom','left','right']:p==='flexDirection'?['row','row-reverse','column','column-reverse']:p==='justifyContent'?['start','center','end','space-between','space-around','space-evenly']:p==='alignItems'?['start','center','end','stretch','baseline']:p==='textTransform'?['none','uppercase','lowercase','capitalize']:p==='boxShadow'?['','none','soft','medium','strong']:['','none','block','flex','grid','inline','inline-flex'];input.innerHTML=choices.map(v=>`<option value="${v}">${v||'تلقائي'}</option>`).join('');input.value=edit[p]??(p==='fontWeight'?getComputedStyle(node).fontWeight:p==='textAlign'?getComputedStyle(node).textAlign:p==='borderStyle'?getComputedStyle(node).borderStyle:p==='objectFit'?getComputedStyle(node).objectFit:p==='objectPosition'?getComputedStyle(node).objectPosition:p==='flexDirection'?getComputedStyle(node).flexDirection:p==='justifyContent'?getComputedStyle(node).justifyContent:p==='alignItems'?getComputedStyle(node).alignItems:p==='textTransform'?getComputedStyle(node).textTransform:'');input.onchange=()=>{deleted.delete(selected);draft[selected]={...(draft[selected]||{})};if(!input.value){delete draft[selected][p];applyOne(node,selectedEdit());return;}draft[selected][p]=p==='fontWeight'?Number(input.value):input.value;applyOne(node,selectedEdit());};});
    panel.querySelectorAll('[data-image]').forEach(fileInput=>fileInput.addEventListener('change',async event=>{const file=event.target.files?.[0],property=event.target.dataset.image;if(!file||file.size>1_000_000){panel.querySelector('.visual-editor-note').textContent='حجم الصورة يجب ألا يتجاوز 1 ميغابايت.';return;}const reader=new FileReader();reader.onload=()=>{const image=String(reader.result||'');if(!/^data:image\/(?:webp|png|jpeg);base64,/.test(image))return;deleted.delete(selected);draft[selected]={...(draft[selected]||{}),[property]:image};applyOne(node,selectedEdit());};reader.readAsDataURL(file);}));
    panel.querySelector('[data-reset]').onclick=()=>{delete draft[selected];deleted.add(selected);const base={...selectedContextEdits()};delete base[selected];apply(context.scope,base,targetDoc());select(node);};
    panel.querySelector('[data-save]').onclick=save;
    const dragHandle=panel.querySelector('.visual-editor-head');
    dragHandle.onpointerdown=event=>{
      if(event.target.closest('[data-close]')||event.button!==0)return;
      const rect=panel.getBoundingClientRect();
      const offsetX=event.clientX-rect.left,offsetY=event.clientY-rect.top;
      panel.style.left=`${rect.left}px`;panel.style.top=`${rect.top}px`;panel.style.right='auto';panel.style.bottom='auto';
      dragHandle.setPointerCapture(event.pointerId);panel.dataset.dragging='';event.preventDefault();
      const move=moveEvent=>{const maxLeft=Math.max(8,window.innerWidth-panel.offsetWidth-8),maxTop=Math.max(8,window.innerHeight-Math.min(panel.offsetHeight,window.innerHeight-16)-8);panel.style.left=`${Math.max(8,Math.min(maxLeft,moveEvent.clientX-offsetX))}px`;panel.style.top=`${Math.max(8,Math.min(maxTop,moveEvent.clientY-offsetY))}px`;};
      const end=endEvent=>{panel?.removeAttribute('data-dragging');try{dragHandle.releasePointerCapture(endEvent.pointerId);}catch{}dragHandle.removeEventListener('pointermove',move);dragHandle.removeEventListener('pointerup',end);dragHandle.removeEventListener('pointercancel',end);};
      dragHandle.addEventListener('pointermove',move);dragHandle.addEventListener('pointerup',end);dragHandle.addEventListener('pointercancel',end);
    };
  }
  function selectedContextEdits(){return context.allEdits?.[context.scope]||{};}
  function select(node){clearSelection();selected=node.dataset.visualKey;node.dataset.visualSelected='';renderPanel();}
  async function save(){
    if(!context||!Object.keys(draft).length)return;
    const next={...(context.allEdits||{}),[context.scope]:{...selectedContextEdits(),...draft}};
    for(const key of deleted)delete next[context.scope][key];
    const payload={visualEdits:next};
    try{
      if(context.layer==='site'){const result=await api('/api/admin/settings',{method:'PATCH',body:json(payload)});window.siteVisualEdits=result.settings.visualEdits;context.allEdits=window.siteVisualEdits;}
      else if(context.shopId){const result=await api(`/api/admin/shops/${encodeURIComponent(context.shopId)}`,{method:'PATCH',body:json(payload)});context.allEdits=result.shop.visualEdits;if(window.storeInfo?.id===context.shopId)window.storeInfo.visualEdits=context.allEdits;}
      else throw new Error('تعذر تحديد المتجر للحفظ.');
      draft={};deleted.clear();apply(context.scope,context.allEdits[context.scope],targetDoc());context.onSaved?.(context.allEdits);panel.querySelector('.visual-editor-note').textContent='تم نشر التعديلات.';toast('تم نشر التعديلات');renderPanel();
    }catch(error){panel.querySelector('.visual-editor-note').textContent=error.message;}
  }
  window.applyInlineVisualEdits=apply;
  window.startInlineVisualEditor=({scope,layer,shopId,allEdits={},targetDoc:targetDocument,onSaved})=>{
    if(window.currentUser?.role!=='admin')return;
    if(active){if(Object.keys(draft).length&&!confirm('لديك تغييرات غير منشورة. هل تريد إغلاق المحرر؟'))return;stop();return;}
    stop();context={scope,layer,shopId,onSaved,targetDoc:targetDocument||document,allEdits:JSON.parse(JSON.stringify(allEdits||{}))};draft={};deleted.clear();apply(scope,context.allEdits[scope]||{},targetDoc());
    active=true;targetDoc().body.classList.add('visual-editing');panel=document.createElement('aside');panel.className='visual-editor-panel';panel.dataset.visualTools='';panel.setAttribute('aria-label','تحرير عناصر الصفحة');document.body.append(panel);targetDoc().addEventListener('click',onPick,true);targetDoc().addEventListener('mouseover',onHover,true);if(targetDoc()!==document)document.addEventListener('click',parentNavigation,true);renderPanel();toast('اضغط على أي نص أو زر أو صورة أو بطاقة لتعديلها.');
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
  window.getInlineEditorContext=()=>({scope:shop?surface:'site:login',layer:shop?'shop':'site',shopId:shop?.id,allEdits:shop?.visualEdits||settings.visualEdits||{},targetDoc:document.getElementById('editorFrame')?.contentDocument,onSaved:edits=>{if(shop)shop.visualEdits=edits;else{settings.visualEdits=edits;window.siteVisualEdits=edits;}}});

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
    window.applyInlineVisualEdits?.(shop?surface:'site:login',(shop?.visualEdits||settings.visualEdits||{})[shop?surface:'site:login']||{},frameDocument);
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
        window.siteVisualEdits=settings.visualEdits||window.siteVisualEdits;
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
