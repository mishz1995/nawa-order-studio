(function (root, factory) {
  const system = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = system;
  if (root) root.ThemeSystem = system;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const colors = {
    background: '#f1f1e9', backgroundSubtle: '#e7e7dd', text: '#252821', textSecondary: '#3b3e34', muted: '#707368',
    accent: '#889b59', accentText: '#ffffff', card: '#ffffff', panel: '#252821', panelText: '#f1f1e9',
    sidebar: '#252821', sidebarText: '#f1f1e9', border: '#d8d9cf', success: '#496431', warning: '#9d6b21',
    error: '#b3372b', info: '#315a70'
  };
  const darkColors = {
    background: '#191b17', backgroundSubtle: '#252821', text: '#f1f1e9', textSecondary: '#e1e1d7', muted: '#b2b3a8',
    accent: '#a5b878', accentText: '#191b17', card: '#252821', panel: '#171914', panelText: '#f1f1e9',
    sidebar: '#171914', sidebarText: '#f1f1e9', border: '#44473f', success: '#9cb883', warning: '#e1b665',
    error: '#f08c7e', info: '#9fc6d7'
  };
  const mode = (palette) => ({
    colors: { ...palette },
    typography: { bodyFont: 'thmanyah-sans', headingFont: 'thmanyah-serif-display', numberFont: 'thmanyah-sans', bodySize: 16, headingSize: 28, bodyWeight: 400, headingWeight: 700, lineHeight: 1.55, letterSpacing: 0, textAlign: 'start' },
    layout: { sidebarPosition: 'right', sidebarWidth: 250, contentWidth: 1440, columns: 2, headerHeight: 68, sectionGap: 20, cardGap: 16, responsive: { tabletColumns: 2, mobileColumns: 1, tabletContentWidth: 1024, mobileContentWidth: 760 }, showLogo: true, showStoreName: true, showPoweredBy: true },
    components: {
      button: { radius: 10, height: 44, paddingX: 16, borderWidth: 1, fontSize: 14 },
      card: { radius: 14, padding: 18, borderWidth: 1, shadow: 'soft' },
      input: { radius: 9, height: 44, borderWidth: 1, fontSize: 14 },
      sidebar: { itemRadius: 9, itemHeight: 42, padding: 18 },
      table: { rowHeight: 48, borderWidth: 1, density: 'normal' },
      modal: { radius: 18, width: 640 },
      notification: { radius: 12, padding: 14 },
      orderStatus: { radius: 12, fontSize: 22, paddingX: 14, paddingY: 12 },
      progress: { markSize: 24, rowGap: 8, lineWidth: 2 },
      banner: { height: 420, radius: 24, overlay: 20, textAlign: 'start' },
      qr: { size: 240, padding: 10, radius: 12, background: '#ffffff' }
    },
    motion: { enabled: true, durationMs: 180, entry: 'fade-up', status: 'fade', qr: 'fade' },
    assets: { logoLight: '/assets/stap/logo-light.svg', logoDark: '/assets/stap/logo-dark.svg', storeIcon: '', favicon: '/assets/stap/app-icon-light.svg', background: '', banner: '' }
  });
  const base = {
    schemaVersion: 1,
    name: 'stap Default Theme',
    appearance: 'system',
    modes: { light: mode(colors), dark: mode(darkColors) },
    surfaces: {},
    components: {}
  };
  const SURFACES = [
    ['dashboard', 'لوحة المتجر'], ['orders', 'إدارة الطلبات'], ['menu', 'قائمة الأصناف'], ['design', 'تصميم المتجر'],
    ['chats', 'المحادثات'], ['settings', 'الإعدادات'], ['login', 'تسجيل الدخول'], ['customerCard', 'بطاقة العميل'], ['signage', 'شاشة البانر وQR']
  ];
  const COMPONENTS = [
    ['button', 'الأزرار'], ['card', 'البطاقات'], ['input', 'حقول الإدخال'], ['sidebar', 'القائمة الجانبية'],
    ['table', 'الجداول'], ['modal', 'النوافذ'], ['notification', 'التنبيهات'], ['orderStatus', 'حالة الطلب'],
    ['progress', 'مؤشر التقدم'], ['banner', 'البانر'], ['qr', 'رمز QR']
  ];
  const enumValues = {
    appearance: ['light', 'dark', 'system'], sidebarPosition: ['right', 'left', 'bottom'], textAlign: ['start', 'center', 'end'],
    shadow: ['none', 'soft', 'medium'], density: ['compact', 'normal', 'comfortable'], entry: ['none', 'fade', 'fade-up', 'slide'],
    status: ['none', 'fade', 'slide'], qr: ['none', 'fade', 'scale']
  };
  const numericLimits = {
    bodySize: [12, 24], headingSize: [16, 56], bodyWeight: [300, 900], headingWeight: [300, 900], lineHeight: [1, 2.2], letterSpacing: [-2, 4],
    sidebarWidth: [180, 360], contentWidth: [320, 1920], columns: [1, 4], tabletColumns: [1, 4], mobileColumns: [1, 2], tabletContentWidth: [320, 1400], mobileContentWidth: [320, 900], headerHeight: [44, 100], sectionGap: [8, 64], cardGap: [4, 48],
    radius: [0, 32], height: [28, 80], paddingX: [0, 40], paddingY: [0, 40], padding: [0, 56], borderWidth: [0, 4], fontSize: [10, 40],
    itemRadius: [0, 24], itemHeight: [28, 64], rowHeight: [30, 80], width: [280, 960], markSize: [12, 40], rowGap: [0, 28], lineWidth: [1, 6],
    overlay: [0, 90], size: [96, 512], durationMs: [0, 1500], paddingXDesktop: [0, 64]
  };
  const fonts = ['system', 'sans', 'serif', 'rounded', 'mono', 'thmanyah-sans', 'thmanyah-serif-display', 'thmanyah-serif-text'];
  const plainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function merge(...objects) {
    const result = {};
    for (const source of objects) {
      if (!plainObject(source)) continue;
      for (const [key, value] of Object.entries(source)) {
        result[key] = plainObject(value) && plainObject(result[key]) ? merge(result[key], value) : plainObject(value) ? merge({}, value) : value;
      }
    }
    return result;
  }

  function sanitizeNode(raw, reference, path, options, partial) {
    if (plainObject(reference)) {
      if (!plainObject(raw)) return partial ? {} : clone(reference);
      const out = {};
      for (const [key, value] of Object.entries(reference)) {
        if (!Object.hasOwn(raw, key)) { if (!partial) out[key] = clone(value); continue; }
        const clean = sanitizeNode(raw[key], value, path ? `${path}.${key}` : key, options, partial);
        if (clean === null) return null;
        if (!(partial && plainObject(clean) && !Object.keys(clean).length)) out[key] = clean;
      }
      return out;
    }
    if (typeof reference === 'boolean') return typeof raw === 'boolean' ? raw : null;
    if (typeof reference === 'number') {
      const value = Number(raw), field = path.split('.').at(-1), limits = /\.components\.banner\.height$/.test(path) ? [120, 1200] : numericLimits[field] || [0, 100];
      return Number.isFinite(value) && value >= limits[0] && value <= limits[1] ? value : null;
    }
    if (typeof reference === 'string') {
      const field = path.split('.').at(-1);
      if (path.includes('.colors.') || /\.components\.qr\.background$/.test(path)) return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
      if (/\.assets\./.test(`.${path}`)) return raw === '' ? '' : /^\/assets\/stap\/[a-z0-9-]+\.svg$/.test(raw) ? raw : typeof options.safeImage === 'function' ? options.safeImage(raw) || null : null;
      if (field === 'bodyFont' || field === 'headingFont' || field === 'numberFont') {
        if (typeof raw !== 'string' || !(fonts.includes(raw) || options.fontExists?.(raw))) return null;
        return raw;
      }
      if (enumValues[field]) return enumValues[field].includes(raw) ? raw : null;
      const clean = typeof options.cleanText === 'function' ? options.cleanText(raw, 60) : String(raw || '').trim().slice(0, 60);
      return clean;
    }
    return null;
  }

  function sanitizeConfig(raw, options = {}, partial = false) {
    if (!plainObject(raw)) return null;
    const reference = { ...base, surfaces: {}, components: {} };
    const input = { ...raw, surfaces: {}, components: {} };
    const result = sanitizeNode(input, reference, '', options, partial);
    if (!result) return null;
    result.surfaces = {};
    if (plainObject(raw.surfaces)) for (const [surface, layer] of Object.entries(raw.surfaces)) {
      if (!SURFACES.some(([id]) => id === surface) || !plainObject(layer)) return null;
      const cleanLayer = {};
      for (const modeName of ['light', 'dark']) if (Object.hasOwn(layer, modeName)) {
        const cleanMode = sanitizeNode(layer[modeName], base.modes[modeName], `surfaces.${surface}.${modeName}`, options, true);
        if (!cleanMode) return null;
        cleanLayer[modeName] = cleanMode;
      }
      result.surfaces[surface] = cleanLayer;
    }
    result.components = {};
    if (plainObject(raw.components)) for (const [surface, componentLayers] of Object.entries(raw.components)) {
      if (!SURFACES.some(([id]) => id === surface) || !plainObject(componentLayers)) return null;
      result.components[surface] = {};
      for (const [component, layer] of Object.entries(componentLayers)) {
        if (!COMPONENTS.some(([id]) => id === component) || !plainObject(layer)) return null;
        const cleanLayer = {};
        for (const modeName of ['light', 'dark']) if (Object.hasOwn(layer, modeName)) {
          const cleanMode = sanitizeNode(layer[modeName], base.modes[modeName].components[component], `components.${component}.${modeName}`, options, true);
          if (!cleanMode) return null;
          cleanLayer[modeName] = cleanMode;
        }
        result.components[surface][component] = cleanLayer;
      }
    }
    if (result.name !== undefined && result.name.length < 2) return null;
    if (!partial && result.schemaVersion !== 1) return null;
    const bytes = BufferSize(JSON.stringify(result));
    if (bytes > 4_000_000) return null;
    return result;
  }
  function BufferSize(text) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length * 2; }

  function resolve(defaultConfig, assignedConfig, storeOverrides, surface, component, modeName = 'light') {
    const modeKey = modeName === 'dark' ? 'dark' : 'light';
    const root = merge(defaultConfig?.modes?.[modeKey] || base.modes[modeKey], assignedConfig?.modes?.[modeKey] || {});
    const global = storeOverrides?.modes?.[modeKey] || {};
    const presetSurface = assignedConfig?.surfaces?.[surface]?.[modeKey] || {};
    const shopSurface = storeOverrides?.surfaces?.[surface]?.[modeKey] || {};
    const presetComponent = assignedConfig?.components?.[surface]?.[component]?.[modeKey] || {};
    const shopComponent = storeOverrides?.components?.[surface]?.[component]?.[modeKey] || {};
    const resolved = merge(root, global, presetSurface, shopSurface);
    if (component) resolved.components[component] = merge(resolved.components?.[component] || {}, presetComponent, shopComponent);
    return resolved;
  }

  function setCssVariables(target, values, modeName) {
    const colors = values?.colors || {}, type = values?.typography || {}, layout = values?.layout || {},
      components = values?.components || {}, motion = values?.motion || {}, assets = values?.assets || {};
    const button = components.button || {}, card = components.card || {}, input = components.input || {},
      sidebar = components.sidebar || {}, table = components.table || {}, modal = components.modal || {},
      status = components.orderStatus || {}, progress = components.progress || {}, banner = components.banner || {}, qr = components.qr || {};
    const fontStack = (id) => {
      if (id === 'thmanyah-sans') return '"Thmanyah Sans", system-ui, sans-serif';
      if (id === 'thmanyah-serif-display') return '"Thmanyah Serif Display", Georgia, serif';
      if (id === 'thmanyah-serif-text') return '"Thmanyah Serif Text", Georgia, serif';
      if (/^font-[a-f0-9]{12}$/.test(id || '')) return `"${id}", system-ui, sans-serif`;
      return ({ sans: 'Arial, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', rounded: '"Trebuchet MS", Arial, sans-serif', mono: 'ui-monospace, Consolas, monospace' })[id] || 'system-ui, "Segoe UI", Tahoma, sans-serif';
    };
    const variables = {
      '--color-paper': colors.background, '--color-paper-2': colors.backgroundSubtle, '--color-paper-3': colors.card,
      '--color-ink': colors.text, '--color-ink-2': colors.textSecondary, '--color-text': colors.text, '--color-muted': colors.muted,
      '--color-rule': colors.border, '--color-rule-2': colors.border, '--color-accent': colors.accent,
      '--color-accent-ink': colors.accentText, '--color-accent-2': colors.accent, '--color-focus': colors.accent,
      '--color-cotton': colors.card, '--color-desk': colors.backgroundSubtle, '--color-board': colors.panel,
      '--color-board-type': colors.panelText, '--color-ticket-wine': colors.panel, '--color-ticket-cream': colors.panelText,
      '--color-ticket-side': colors.backgroundSubtle, '--color-ticket-wine-type': colors.text,
      '--customer-card-surface': colors.card, '--customer-card-text': colors.text, '--customer-card-accent': colors.accent,
      '--customer-card-border': colors.border, '--customer-card-panel': colors.panel,
      '--color-success': colors.success, '--color-warning': colors.warning, '--color-error': colors.error, '--color-info': colors.info,
      '--store-bg': colors.background, '--store-ink': colors.text, '--store-accent': colors.accent, '--store-card': colors.card,
      '--color-ref-171914': colors.sidebar, '--color-ref-161810': colors.sidebar, '--color-ref-292b24': colors.sidebar,
      '--color-ref-2d3028': colors.sidebar, '--color-ref-fff': colors.card, '--color-ref-f6f6f3': colors.background,
      '--color-ref-f8f9f6': colors.backgroundSubtle, '--color-ref-e7eadf': colors.backgroundSubtle, '--color-ref-edf0e7': colors.backgroundSubtle,
      '--color-ref-eef4e8': colors.backgroundSubtle, '--color-ref-e4e6de': colors.border, '--color-ref-eff0eb': colors.border,
      '--color-ref-aaada4': colors.sidebarText, '--color-ref-96998f': colors.muted, '--color-ref-7f8278': colors.muted,
      '--color-ref-303229': colors.text, '--color-ref-33362d': colors.accent, '--color-ref-c7f36a': colors.accent,
      '--color-ref-fff1ee': `color-mix(in srgb, ${colors.accent} 18%, ${colors.card})`,
      '--ink': colors.text, '--lime': colors.accent, '--line': colors.border, '--muted': colors.muted,
      '--color-ref-141414': colors.sidebar, '--color-ref-141511': colors.text, '--color-ref-151612': colors.text, '--color-ref-181a14': colors.text,
      '--color-ref-1b1c18': colors.textSecondary, '--color-ref-20221c': colors.backgroundSubtle, '--color-ref-222': colors.text,
      '--color-ref-263323': colors.text, '--color-ref-314c21': colors.accent, '--color-ref-354326': colors.accent,
      '--color-ref-48672d': colors.accent, '--color-ref-496431': colors.success, '--color-ref-536b3d': colors.accent,
      '--color-ref-55574f': colors.textSecondary, '--color-ref-58634b': colors.textSecondary, '--color-ref-59753c': colors.accent,
      '--color-ref-607347': colors.accent, '--color-ref-667d50': colors.accent, '--color-ref-697d51': colors.accent,
      '--color-ref-6c8552': colors.accent, '--color-ref-70736a': colors.muted, '--color-ref-777': colors.muted,
      '--color-ref-797b73': colors.muted, '--color-ref-7a7b75': colors.muted, '--color-ref-7e8177': colors.muted,
      '--color-ref-82847c': colors.muted, '--color-ref-82916d': colors.accent, '--color-ref-85877e': colors.muted,
      '--color-ref-85877f': colors.muted, '--color-ref-858980': colors.muted, '--color-ref-8a8c84': colors.muted,
      '--color-ref-8a8c85': colors.muted, '--color-ref-94bc5e': colors.accent, '--color-ref-95978e': colors.muted,
      '--color-ref-9a9c95': colors.muted, '--color-ref-9cb883': colors.success, '--color-ref-9d6b21': colors.warning,
      '--color-ref-9fa297': colors.muted, '--color-ref-a9cd91': colors.accent, '--color-ref-aeb3a6': colors.muted,
      '--color-ref-ac4132': colors.error, '--color-ref-ae3527': colors.error, '--color-ref-b3372b': colors.error,
      '--color-ref-c0c2bb': colors.border, '--color-ref-c5c7be': colors.border, '--color-ref-cbd3bf': colors.border,
      '--color-ref-e6e7e1': colors.border, '--color-ref-e7eadd': colors.backgroundSubtle, '--color-ref-e8e9e2': colors.backgroundSubtle,
      '--color-ref-ecede8': colors.backgroundSubtle, '--color-ref-eceee6': colors.backgroundSubtle, '--color-ref-eceee7': colors.backgroundSubtle,
      '--color-ref-edf5df': colors.backgroundSubtle, '--color-ref-f0f1ec': colors.backgroundSubtle, '--color-ref-f0f2eb': colors.backgroundSubtle,
      '--color-ref-f0f3eb': colors.backgroundSubtle, '--color-ref-f1f2ed': colors.backgroundSubtle, '--color-ref-f2f2ef': colors.backgroundSubtle,
      '--color-ref-f2f3ee': colors.backgroundSubtle, '--color-ref-f3f1ec': colors.backgroundSubtle, '--color-ref-f3f2ed': colors.backgroundSubtle,
      '--color-ref-f3f4ef': colors.backgroundSubtle, '--color-ref-f3f5ed': colors.backgroundSubtle, '--color-ref-f4f5ef': colors.backgroundSubtle,
      '--color-ref-f5f6f1': colors.backgroundSubtle, '--color-ref-f5f6f2': colors.backgroundSubtle, '--color-ref-f7f7f4': colors.backgroundSubtle,
      '--color-ref-f7f8f3': colors.backgroundSubtle, '--color-ref-f8faf4': colors.backgroundSubtle,
      '--color-ref-fff2df': `color-mix(in srgb, ${colors.warning} 18%, ${colors.card})`,
      '--color-ref-e74531': colors.error, '--color-ref-fff1ee': `color-mix(in srgb, ${colors.error} 15%, ${colors.card})`,
      '--color-ref-1719148c': `color-mix(in srgb, ${colors.sidebar} 80%, transparent)`,
      '--color-ref-1d21100a': `color-mix(in srgb, ${colors.text} 7%, transparent)`,
      '--color-ref-ffffff16': `color-mix(in srgb, ${colors.sidebarText} 9%, transparent)`,
      '--color-ref-ffffff17': `color-mix(in srgb, ${colors.sidebarText} 9%, transparent)`,
      '--color-ref-ffffff1c': `color-mix(in srgb, ${colors.sidebarText} 11%, transparent)`,
      '--color-ref-ffffff25': `color-mix(in srgb, ${colors.sidebarText} 15%, transparent)`,
      '--color-ref-ffffff6b': `color-mix(in srgb, ${colors.sidebarText} 42%, transparent)`,
      '--color-ref-ffffffaa': `color-mix(in srgb, ${colors.sidebarText} 67%, transparent)`,
      '--font-body': fontStack(type.bodyFont), '--font-display': fontStack(type.headingFont), '--font-numbers': fontStack(type.numberFont),
      '--theme-body-size': `${type.bodySize}px`, '--theme-heading-size': `${type.headingSize}px`, '--theme-body-weight': type.bodyWeight,
      '--theme-heading-weight': type.headingWeight, '--theme-line-height': type.lineHeight, '--theme-letter-spacing': `${type.letterSpacing}px`,
      '--layout-sidebar-width': `${layout.sidebarWidth}px`, '--layout-content-width': `${layout.contentWidth}px`, '--layout-header-height': `${layout.headerHeight}px`,
      '--layout-section-gap': `${layout.sectionGap}px`, '--layout-columns': layout.columns,
      '--layout-columns': layout.columns, '--layout-header-height': `${layout.headerHeight}px`, '--layout-section-gap': `${layout.sectionGap}px`, '--layout-card-gap': `${layout.cardGap}px`,
      '--layout-tablet-columns': layout.responsive?.tabletColumns, '--layout-mobile-columns': layout.responsive?.mobileColumns,
      '--layout-tablet-content-width': `${layout.responsive?.tabletContentWidth ?? layout.contentWidth}px`, '--layout-mobile-content-width': `${layout.responsive?.mobileContentWidth ?? layout.contentWidth}px`,
      '--component-button-radius': `${button.radius}px`, '--component-button-height': `${button.height}px`, '--component-button-padding-x': `${button.paddingX}px`, '--component-button-border': `${button.borderWidth}px`, '--component-button-font-size': `${button.fontSize}px`,
      '--component-card-radius': `${card.radius}px`, '--component-card-padding': `${card.padding}px`, '--component-card-border': `${card.borderWidth}px`,
      '--component-input-radius': `${input.radius}px`, '--component-input-height': `${input.height}px`, '--component-input-border': `${input.borderWidth}px`, '--component-input-font-size': `${input.fontSize}px`,
      '--component-sidebar-item-radius': `${sidebar.itemRadius}px`, '--component-sidebar-item-height': `${sidebar.itemHeight}px`, '--component-sidebar-padding': `${sidebar.padding}px`,
      '--component-table-row-height': `${table.rowHeight}px`, '--component-table-border': `${table.borderWidth}px`, '--component-table-density': table.density,
      '--component-modal-radius': `${modal.radius}px`, '--component-modal-width': `${modal.width}px`,
      '--component-notification-radius': `${(components.notification || {}).radius}px`, '--component-notification-padding': `${(components.notification || {}).padding}px`,
      '--component-status-radius': `${status.radius}px`, '--component-status-font-size': `${status.fontSize}px`, '--component-status-padding-x': `${status.paddingX}px`, '--component-status-padding-y': `${status.paddingY}px`,
      '--component-progress-mark-size': `${progress.markSize}px`, '--component-progress-row-gap': `${progress.rowGap}px`, '--component-progress-line-width': `${progress.lineWidth}px`,
      '--component-banner-height': `${banner.height}px`, '--component-banner-radius': `${banner.radius}px`, '--component-banner-overlay': `${banner.overlay}%`, '--component-banner-text-align': banner.textAlign,
      '--component-qr-size': `${qr.size}px`, '--component-qr-padding': `${qr.padding}px`, '--component-qr-radius': `${qr.radius}px`, '--component-qr-background': qr.background,
      '--color-cotton': colors.card, '--color-desk': colors.backgroundSubtle, '--color-board': colors.panel, '--color-board-type': colors.panelText,
      '--color-ticket-wine': colors.panel, '--color-ticket-cream': colors.panelText, '--color-ticket-side': colors.backgroundSubtle,
      '--color-ticket-wine-type': colors.text, '--customer-card-surface': colors.card, '--customer-card-text': colors.text,
      '--customer-card-accent': colors.accent, '--customer-card-border': colors.border, '--customer-card-panel': colors.panel,
      '--theme-motion-duration': `${motion.enabled ? motion.durationMs : 0}ms`, '--theme-shadow': card.shadow === 'none' ? 'none' : card.shadow === 'medium' ? '0 12px 28px rgb(20 24 18 / .12)' : '0 4px 14px rgb(20 24 18 / .07)',
      '--theme-background-image': assets.background ? `url("${assets.background}")` : 'none', '--theme-banner-image': assets.banner ? `url("${assets.banner}")` : 'none'
    };
    variables['--theme-logo-light'] = assets.logoLight ? `url("${assets.logoLight}")` : 'none';
    variables['--theme-logo-dark'] = assets.logoDark ? `url("${assets.logoDark}")` : 'none';
    variables['--theme-store-icon'] = assets.storeIcon ? `url("${assets.storeIcon}")` : 'none';
    target.dataset.themeMode = modeName;
    target.dataset.sidebarPosition = layout.sidebarPosition;
    target.dataset.showLogo = String(layout.showLogo);
    target.dataset.showStoreName = String(layout.showStoreName);
    target.dataset.showPoweredBy = String(layout.showPoweredBy);
    target.dataset.themeMotion = String(Boolean(motion.enabled));
    target.style.setProperty('--theme-text-align', type.textAlign || 'start');
    for (const [key, value] of Object.entries(variables)) if (value !== undefined && value !== null) target.style.setProperty(key, value);
    target.style.colorScheme = modeName;
  }

  return { DEFAULT_THEME: clone(base), DEFAULT_MODE: clone(base.modes.light), SURFACES, COMPONENTS, enumValues, numericLimits, clone, merge, sanitizeConfig, resolve, setCssVariables };
});
