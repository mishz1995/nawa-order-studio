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
