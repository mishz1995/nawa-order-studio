require('dotenv').config();
const express = require('express');
const session = require('express-session');
const QRCode = require('qrcode');
const webPush = require('web-push');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ThemeSystem = require('./public/theme-system.js');

const app = express();
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const dbFile = path.join(dataDir, 'nawa.enc');
fs.mkdirSync(dataDir, { recursive: true });
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters.');
if (!process.env.BOOTSTRAP_ADMIN_USERNAME || !process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 8 || process.env.BOOTSTRAP_ADMIN_PASSWORD.length > 128) throw new Error('Set BOOTSTRAP_ADMIN_USERNAME and an 8–128 character BOOTSTRAP_ADMIN_PASSWORD.');

const deriveKey = () => Buffer.from(crypto.hkdfSync('sha256', process.env.SESSION_SECRET, '', 'nawa-store-v1', 32));
function decodeDb(encoded) {
  const [version, ivHex, tagHex, body] = encoded.split(':');
  if (version !== 'nawa1' || !body) throw new Error('The local database has an unknown format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8'));
}
function readDb() { return fs.existsSync(dbFile) ? decodeDb(fs.readFileSync(dbFile, 'utf8')) : { users: [], shops: [], orders: [] }; }
let db = readDb();
const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
if (Boolean(redisUrl) !== Boolean(redisToken)) throw new Error('Set both Upstash REST URL and token, or leave both unset.');
if (process.env.NODE_ENV === 'production' && !redisUrl) throw new Error('Production requires persistent encrypted storage. Configure Upstash REST credentials.');
if (redisUrl && new URL(redisUrl).protocol !== 'https:') throw new Error('Upstash REST storage must use HTTPS.');
if (process.env.NODE_ENV === 'production' && process.env.BASE_URL && new URL(process.env.BASE_URL).protocol !== 'https:') throw new Error('BASE_URL must use HTTPS in production.');
let persistQueue = Promise.resolve();
function encryptDb() {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(db), 'utf8'), cipher.final()]);
  return ['nawa1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), payload.toString('base64')].join(':');
}
async function upstashCommand(command, args=[], body) {
  const url = `${redisUrl}/${command.toLowerCase()}/${args.map((arg) => encodeURIComponent(arg)).join('/')}`;
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${redisToken}`, ...(body === undefined ? {} : { 'Content-Type': 'text/plain' }) }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(`Cloud storage ${command} failed (${response.status})`);
  return result.result;
}
async function loadRemoteDb() {
  if (!redisUrl) return null;
  const encoded = await upstashCommand('GET', ['nawa:state']);
  return encoded ? decodeDb(encoded) : null;
}
async function saveDb() {
  const encoded = encryptDb();
  const temp = dbFile + '.tmp';
  fs.writeFileSync(temp, encoded, { mode: 0o600 });
  fs.renameSync(temp, dbFile);
  if (!redisUrl) return;
  const persist = persistQueue.then(() => upstashCommand('SET', ['nawa:state'], encoded));
  persistQueue = persist.catch(() => {});
  return persist;
}
const sessionKey = Buffer.from(crypto.hkdfSync('sha256', process.env.SESSION_SECRET, '', 'nawa-session-v1', 32));
function encryptSession(sessionData) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(sessionData), 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), body.toString('base64')].join(':');
}
function decryptSession(encoded) {
  const [ivHex, tagHex, body] = encoded.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8'));
}
class EncryptedUpstashSessionStore extends session.Store {
  get(sid, callback) {
    upstashCommand('GET', [`nawa:session:${sid}`]).then((value) => callback(null, value ? decryptSession(value) : null)).catch(callback);
  }
  set(sid, sessionData, callback) {
    const expiresAt = sessionData.cookie?.expires ? new Date(sessionData.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
    const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    const key = `nawa:session:${sid}`;
    const value = encryptSession(sessionData);
    fetch(`${redisUrl}/set/${encodeURIComponent(key)}?EX=${ttl}`, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'text/plain' }, body: value })
      .then(async (response) => { const result = await response.json().catch(() => ({})); if (!response.ok || result.error) throw new Error('Session storage write failed'); callback(null); })
      .catch(callback);
  }
  destroy(sid, callback) { upstashCommand('DEL', [`nawa:session:${sid}`]).then(() => callback(null)).catch(callback); }
  touch(sid, sessionData, callback) { this.set(sid, sessionData, callback); }
}
class EncryptedFileSessionStore extends session.Store {
  constructor() { super(); this.directory = path.join(dataDir, '.sessions'); fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 }); }
  fileFor(sid) { return path.join(this.directory, `${crypto.createHash('sha256').update(sid).digest('hex')}.enc`); }
  get(sid, callback) {
    fs.readFile(this.fileFor(sid), 'utf8', (error, encoded) => {
      if (error?.code === 'ENOENT') return callback(null, null);
      if (error) return callback(error);
      try {
        const value = decryptSession(encoded);
        if (value.cookie?.expires && new Date(value.cookie.expires).getTime() <= Date.now()) return this.destroy(sid, (destroyError) => callback(destroyError, null));
        callback(null, value);
      } catch (decodeError) { callback(decodeError); }
    });
  }
  set(sid, value, callback) {
    const file = this.fileFor(sid), temp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFile(temp, encryptSession(value), { encoding: 'utf8', mode: 0o600 }, (error) => {
      if (error) return callback(error);
      fs.rename(temp, file, callback);
    });
  }
  destroy(sid, callback) { fs.rm(this.fileFor(sid), { force: true }, callback); }
  touch(sid, value, callback) { this.set(sid, value, callback); }
}
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};
const validPassword = (password) => typeof password === 'string' && password.length >= 8 && password.length <= 128;
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(input) {
  let bits = 0, value = 0, output = '';
  for (const byte of input) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += base32Alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input) {
  let bits = 0, value = 0;
  const output = [];
  for (const char of String(input).replace(/=+$/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function verifyTotp(secret, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 30_000);
  for (let drift = -1; drift <= 1; drift++) {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(now + drift));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    if (crypto.timingSafeEqual(Buffer.from(String(value).padStart(6, '0')), Buffer.from(code))) return true;
  }
  return false;
}
const verifyPassword = (password, stored) => {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, saltHex, expectedHex] = stored.split('$');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
function normalizeAndSeedDb() {
  let changed = false;
  if (!db.settings || typeof db.settings !== 'object') { db.settings = { appName: 'نوى' }; changed = true; }
  if (typeof db.settings.appName !== 'string' || !db.settings.appName.trim()) { db.settings.appName = 'نوى'; changed = true; }
  if (!db.settings.branding || typeof db.settings.branding !== 'object') { db.settings.branding = {}; changed = true; }
  if (!Array.isArray(db.settings.stylePresets)) { db.settings.stylePresets = []; changed = true; }
  const rawFonts = Array.isArray(db.settings.customFonts) ? db.settings.customFonts : [];
  const normalizedFonts = rawFonts.map((font) => safeCustomFont(font)).filter(Boolean).slice(0, 4);
  if (!Array.isArray(db.settings.customFonts) || JSON.stringify(normalizedFonts) !== JSON.stringify(rawFonts)) { db.settings.customFonts = normalizedFonts; changed = true; }
  const rawCustomThemes = Array.isArray(db.settings.customThemes) ? db.settings.customThemes : [];
  if (rawCustomThemes.length || !Array.isArray(db.settings.customThemes)) { db.settings.customThemes = []; changed = true; }
  if (!db.settings.themeSystem || db.settings.themeSystem.version !== 1) {
    db.settings.themeSystem = makeThemeSystem();
    db.settings.customThemes = [];
    db.settings.stylePresets = [];
    db.settings.activeStyleId = '';
    changed = true;
  } else {
    const system = db.settings.themeSystem;
    const sanitizeRecord = (record, fallback) => {
      const published = safeThemeConfig(record?.published) || ThemeSystem.clone(fallback);
      const draft = safeThemeConfig(record?.draft) || ThemeSystem.clone(published);
      const versions = Array.isArray(record?.versions) ? record.versions.slice(-20).map((item) => ({ config: safeThemeConfig(item?.config), createdAt: Number(item?.createdAt) || Date.now() })).filter((item) => item.config) : [];
      return { published, draft, versions };
    };
    const fallbackPlatform = { ...ThemeSystem.clone(ThemeSystem.DEFAULT_THEME), name: 'Stap Platform Theme' };
    const themes = (Array.isArray(system.themes) ? system.themes : []).slice(0, 40).map((theme) => ({
      id: validThemeId(theme?.id) && theme.id !== 'stap-default' ? theme.id : `theme-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      name: cleanText(theme?.name, 60), config: safeThemeConfig(theme?.config), draft: safeThemeConfig(theme?.draft) || safeThemeConfig(theme?.config), createdAt: Number(theme?.createdAt) || Date.now(), updatedAt: Number(theme?.updatedAt) || Date.now(),
      versions: Array.isArray(theme?.versions) ? theme.versions.slice(-20).map((item) => ({ config: safeThemeConfig(item?.config), createdAt: Number(item?.createdAt) || Date.now() })).filter((item) => item.config) : []
    })).filter((theme) => theme.name.length >= 2 && theme.config);
    db.settings.themeSystem = { version: 1, storeDefault: sanitizeRecord(system.storeDefault, ThemeSystem.DEFAULT_THEME), platform: sanitizeRecord(system.platform, fallbackPlatform), themes };
    if (db.settings.customThemes.length) { db.settings.customThemes = []; changed = true; }
    if ((db.settings.stylePresets || []).length || db.settings.activeStyleId) { db.settings.stylePresets = []; db.settings.activeStyleId = ''; changed = true; }
    if (JSON.stringify(db.settings.themeSystem) !== JSON.stringify(system)) changed = true;
  }
  if (typeof db.settings.activeStyleId !== 'string') { db.settings.activeStyleId = ''; changed = true; }
  if (typeof db.settings.adminDisplayName !== 'string') { db.settings.adminDisplayName = ''; changed = true; }
  if (db.settings.adminTheme !== 'stap-default') { db.settings.adminTheme = 'stap-default'; changed = true; }
  if (!db.settings.textOverrides || typeof db.settings.textOverrides !== 'object' || Array.isArray(db.settings.textOverrides)) { db.settings.textOverrides = {}; changed = true; }
  for (const shop of db.shops) {
    if (!Array.isArray(shop.visibleSections)) { shop.visibleSections = [...allShopSections]; changed = true; }
    if (typeof shop.chatEnabled !== 'boolean') { shop.chatEnabled = true; changed = true; }
    if (Object.hasOwn(shop, 'customCssEnabled')) { delete shop.customCssEnabled; changed = true; }
    if (Object.hasOwn(shop, 'customCss')) { delete shop.customCss; changed = true; }
    const oldTheme = shop.theme;
    const migratedThemeId = validThemeId(oldTheme) && themeById(oldTheme) ? oldTheme : 'stap-default';
    const normalizedThemeState = sanitizeShopThemeState(shop.themeSystem, migratedThemeId);
    if (JSON.stringify(normalizedThemeState) !== JSON.stringify(shop.themeSystem || null)) changed = true;
    shop.themeSystem = normalizedThemeState;
    if (shop.theme !== normalizedThemeState.published.themeId) { shop.theme = normalizedThemeState.published.themeId; changed = true; }
    if (typeof shop.bannerImage !== 'string') { shop.bannerImage = ''; changed = true; }
    if (typeof shop.iconImage !== 'string') { shop.iconImage = ''; changed = true; }
    if (!['catalog', 'custom'].includes(shop.orderMode)) { shop.orderMode = 'catalog'; changed = true; }
    if (!Array.isArray(shop.items)) {
      shop.items = [
        { id: crypto.randomUUID(), name: 'لاتيه بارد', category: 'قهوة', prepMinutes: 4, active: true },
        { id: crypto.randomUUID(), name: 'كابتشينو', category: 'قهوة', prepMinutes: 5, active: true },
        { id: crypto.randomUUID(), name: 'فلات وايت', category: 'قهوة', prepMinutes: 4, active: true },
        { id: crypto.randomUUID(), name: 'كرواسون زبدة', category: 'مخبوزات', prepMinutes: 3, active: true },
        { id: crypto.randomUUID(), name: 'تشيزكيك', category: 'حلويات', prepMinutes: 2, active: true },
        { id: crypto.randomUUID(), name: 'ماتشا لاتيه', category: 'مشروبات باردة', prepMinutes: 6, active: true }
      ];
      changed = true;
    }
    for (const entry of shop.items) if (!catalogImages.includes(entry.image)) { entry.image = productImage(entry.name, entry.category); changed = true; }
  }
  if (!db.users.some((user) => user.role === 'admin')) {
    db.users.push({ id: crypto.randomUUID(), username: process.env.BOOTSTRAP_ADMIN_USERNAME, passwordHash: hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD), role: 'admin' });
    changed = true;
  }
  return changed;
}

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || '';
const pushReady = Boolean(vapidPublicKey && vapidPrivateKey && /^(mailto:|https:\/\/)/.test(vapidSubject));
if (pushReady) webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
const appBaseUrl = () => (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

app.disable('x-powered-by');
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') {
    if (req.secure || req.get('x-forwarded-proto') === 'https') res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (!origin || origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'مصدر الطلب غير صالح' });
  }
  next();
});
app.use(express.json({ limit: '5mb' }));
const sessionOptions = {
  name: 'nawa.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
};
if (redisUrl) sessionOptions.store = new EncryptedUpstashSessionStore();
else if (process.env.NODE_ENV !== 'production') sessionOptions.store = new EncryptedFileSessionStore();
app.use(session(sessionOptions));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const attempts = new Map();
const pruneAttempts = setInterval(() => { const now = Date.now(); for (const [key, bucket] of attempts) if (bucket.until < now) attempts.delete(key); }, 60_000);
pruneAttempts.unref();
app.use('/api', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const segments = req.path.split('/').filter(Boolean), root = segments[0] || 'other';
  const routeGroup = ['auth', 'admin', 'shop', 'public'].includes(root) ? `${root}/${segments[1] || ''}` : 'other';
  const key = `nawa:rate:${req.ip}:${routeGroup}`;
  const now = Date.now();
  const windowMs = req.path === '/auth/login' || req.path === '/auth/verify-2fa' ? 15 * 60_000 : 60_000;
  const limit = req.path === '/auth/login' || req.path === '/auth/verify-2fa' ? 10 : 180;
  if (redisUrl) {
    try {
      const count = Number(await upstashCommand('INCR', [key]));
      if (count === 1) await upstashCommand('EXPIRE', [key, String(Math.ceil(windowMs / 1000))]);
      if (count > limit) return res.status(429).json({ error: 'محاولات كثيرة، حاول لاحقاً' });
      return next();
    } catch {
      console.error('Rate limiter storage unavailable');
      return res.status(503).json({ error: 'خدمة الحماية غير متاحة مؤقتًا' });
    }
  }
  let bucket = attempts.get(key);
  if (!bucket || bucket.until < now) {
    if (attempts.size >= 20_000) for (const [bucketKey, current] of attempts) if (current.until < now) attempts.delete(bucketKey);
    if (attempts.size >= 20_000) return res.status(429).json({ error: 'خدمة الحماية مشغولة، حاول لاحقاً' });
    bucket = { count: 0, until: now + windowMs };
  }
  if (++bucket.count > limit) return res.status(429).json({ error: 'محاولات كثيرة، حاول لاحقاً' });
  attempts.set(key, bucket);
  next();
});
const allShopSections = ['home', 'menu', 'design'];
const safeImage = (value) => typeof value === 'string' && value.length <= 1_500_000 && /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
const shopSections = (shop) => Array.isArray(shop.visibleSections) ? shop.visibleSections.filter((section) => allShopSections.includes(section)) : [...allShopSections];
const validSubscriptionDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const subscriptionExpiresAt = (value) => {
  if (!validSubscriptionDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day + 1) - 3 * 60 * 60 * 1000;
};
const subscriptionDaysRemaining = (shop, now = Date.now()) => {
  const expiresAt = subscriptionExpiresAt(shop.subscriptionEndDate);
  return expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 86_400_000));
};
const subscriptionExpired = (shop, now = Date.now()) => subscriptionDaysRemaining(shop, now) === 0;
const safeShop = (shop) => { const remaining = subscriptionDaysRemaining(shop); const expired = remaining === 0; return { id: shop.id, slug: shop.slug, name: shop.name, username: shop.username, active: shop.active && !expired, subscriptionEndDate: validSubscriptionDate(shop.subscriptionEndDate) ? shop.subscriptionEndDate : '', subscriptionDaysRemaining: remaining, subscriptionExpired: expired, reviewUrl: shop.reviewUrl, theme: shop.theme, orderMode: shop.orderMode || 'catalog', bannerText: shop.bannerText, bannerImage: safeImage(shop.bannerImage), iconImage: safeImage(shop.iconImage), visibleSections: shopSections(shop), chatEnabled: shop.chatEnabled !== false, createdAt: shop.createdAt }; };
const publicScreenShop = (shop) => ({ slug: shop.slug, name: shop.name, theme: shop.theme, themeData: resolveThemeData(shop, 'signage'), bannerText: shop.bannerText, bannerImage: safeImage(shop.bannerImage), iconImage: safeImage(shop.iconImage) });
const sanitizeItem = (item) => ({ id: item.id, name: item.name, category: item.category, prepMinutes: item.prepMinutes, image: catalogImages.includes(item.image) ? item.image : productImage(item.name,item.category), active: item.active !== false });
const safeOrder = (order) => { const { pushSubscriptions, ...visible } = order; return visible; };
async function manageShopItems(shop, req, res) {
  const items = shop.items || (shop.items = []);
  if (req.method === 'GET') return res.json({ items: items.map(sanitizeItem) });
  if (req.method === 'POST') {
    const name = cleanText(req.body?.name, 70);
    const category = cleanText(req.body?.category, 35) || 'أخرى';
    const prepMinutes = Number(req.body?.prepMinutes);
    if (name.length < 2 || !Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 180) return res.status(400).json({ error: 'أدخل اسم الصنف ومدة تحضير من 1 إلى 180 دقيقة' });
    const image = catalogImages.includes(req.body?.image) ? req.body.image : productImage(name,category);
    const item = { id: crypto.randomUUID(), name, category, prepMinutes, image, active: true };
    items.push(item); await saveDb(); return res.status(201).json({ item: sanitizeItem(item) });
  }
  const item = items.find((entry) => entry.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
  if (req.method === 'PATCH') {
    if (req.body?.name !== undefined) { const name = cleanText(req.body.name, 70); if (name.length < 2) return res.status(400).json({ error: 'اسم الصنف قصير' }); item.name = name; }
    if (req.body?.category !== undefined) item.category = cleanText(req.body.category, 35) || 'أخرى';
    if (req.body?.prepMinutes !== undefined) { const time = Number(req.body.prepMinutes); if (!Number.isInteger(time) || time < 1 || time > 180) return res.status(400).json({ error: 'مدة التحضير يجب أن تكون من 1 إلى 180 دقيقة' }); item.prepMinutes = time; }
    if (req.body?.image !== undefined) { if (!catalogImages.includes(req.body.image)) return res.status(400).json({ error: 'اختر صورة من الصور المتاحة' }); item.image = req.body.image; }
    if (req.body?.active !== undefined) item.active = !!req.body.active;
    await saveDb(); return res.json({ item: sanitizeItem(item) });
  }
  shop.items = items.filter((entry) => entry.id !== item.id); await saveDb(); return res.json({ ok: true });
}
const requireLogin = (req, res, next) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  const record = user.role === 'admin' ? db.users.find((entry) => entry.id === user.id) : db.shops.find((entry) => entry.id === user.shopId);
  if (!record || (record.authVersion || 0) !== (req.session.authVersion || 0)) return req.session.destroy(() => res.status(401).json({ error: 'انتهت صلاحية الجلسة، سجّل الدخول مجددًا' }));
  next();
};
const requireAdmin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'هذه الصلاحية للأدمن فقط' });
const requireShop = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'shop') return res.status(403).json({ error: 'هذه الصفحة خاصة بالمتجر' });
  const shop = db.shops.find((item) => item.id === req.session.user.shopId && item.active && (item.authVersion || 0) === (req.session.authVersion || 0));
  if (!shop) return res.status(403).json({ error: 'المتجر غير متاح' });
  if (subscriptionExpired(shop)) return res.status(403).json({ error: 'انتهت صلاحية اشتراك المتجر. يرجى التواصل مع الإدارة لتجديده.' });
  req.shop = shop;
  next();
};
const cleanText = (value, max) => String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const googleUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'google.com' || host.endsWith('.google.com') || host === 'g.page' || host === 'goo.gl' || host.endsWith('.goo.gl')) ? url.toString() : null;
  } catch { return null; }
};
const maxFontBytes = 256 * 1024;
const safeCustomFont = (raw) => {
  if (!raw || typeof raw !== 'object' || !/^font-[a-f0-9]{12}$/.test(String(raw.id || '')) || typeof raw.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.data)) return null;
  const bytes = Buffer.from(raw.data, 'base64');
  if (!bytes.length || bytes.length > maxFontBytes || bytes.subarray(0, 4).toString('ascii') !== 'wOF2') return null;
  const name = cleanText(raw.name, 50);
  return name.length >= 2 ? { id: raw.id, name, format: 'woff2', bytes: bytes.length, data: raw.data } : null;
};
const customFontById = (id) => db.settings?.customFonts?.find((font) => font.id === id) || null;
const publicFontCatalog = () => (db.settings?.customFonts || []).map(({ id, name, format, bytes }) => ({ id, name, format, bytes }));
const makeThemeRecord = (config) => ({ draft: ThemeSystem.clone(config), published: ThemeSystem.clone(config), versions: [] });
const makeThemeSystem = (themes = []) => ({
  version: 1,
  storeDefault: makeThemeRecord(ThemeSystem.DEFAULT_THEME),
  platform: makeThemeRecord({ ...ThemeSystem.clone(ThemeSystem.DEFAULT_THEME), name: 'Stap Platform Theme' }),
  themes
});
const validThemeId = (id) => id === 'stap-default' || /^custom-[a-f0-9]{12}$/.test(String(id || '')) || /^theme-[a-f0-9]{12}$/.test(String(id || ''));
const themeById = (id) => id === 'stap-default' ? { id, name: 'stap Default Theme', config: db.settings?.themeSystem?.storeDefault?.published || ThemeSystem.DEFAULT_THEME } : db.settings?.themeSystem?.themes?.find((theme) => theme.id === id) || null;
const publicThemeCatalog = () => [{ id: 'stap-default', name: 'stap Default Theme', protected: true }, ...(db.settings?.themeSystem?.themes || []).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))];
function safeThemeConfig(raw, partial = false) {
  return ThemeSystem.sanitizeConfig(raw, {
    cleanText,
    safeImage,
    fontExists: (id) => Boolean(customFontById(id))
  }, partial);
}
function sanitizeThemeOverride(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const shaped = { ...raw, schemaVersion: 1 };
  const cleaned = safeThemeConfig(shaped, true);
  if (!cleaned) return null;
  delete cleaned.schemaVersion;
  delete cleaned.name;
  return cleaned;
}
function sanitizeShopThemeState(raw, previousTheme = 'stap-default') {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const cleanRevision = (revision) => {
    if (!revision || typeof revision !== 'object' || !validThemeId(revision.themeId)) return null;
    const overrides = sanitizeThemeOverride(revision.overrides || {});
    return overrides ? { themeId: revision.themeId, overrides } : null;
  };
  const published = cleanRevision(value.published) || { themeId: validThemeId(previousTheme) ? previousTheme : 'stap-default', overrides: {} };
  const draft = value.draft ? cleanRevision(value.draft) : null;
  const versions = Array.isArray(value.versions) ? value.versions.slice(-20).map((item) => {
    const revision = cleanRevision(item?.revision);
    return revision && Number.isFinite(item?.createdAt) ? { revision, createdAt: item.createdAt } : null;
  }).filter(Boolean) : [];
  return { published, draft, versions };
}
function resolveThemeData(shop, target = 'store') {
  const themeState = shop?.themeSystem || sanitizeShopThemeState(null, shop?.theme);
  const revision = themeState.published || { themeId: 'stap-default', overrides: {} };
  return {
    defaultTheme: db.settings.themeSystem.storeDefault.published,
    assignedTheme: themeById(revision.themeId)?.config || db.settings.themeSystem.storeDefault.published,
    overrides: revision.overrides || {},
    fonts: publicFontCatalog(),
    target
  };
}
function adminThemeTarget(target, shopId) {
  const system = db.settings.themeSystem;
  if (target === 'platform' || target === 'default') {
    const record = target === 'platform' ? system.platform : system.storeDefault;
    return { kind: target, name: target === 'platform' ? 'هوية المنصة' : 'stap Default Theme', record, config: ThemeSystem.clone(record.draft || record.published), versions: record.versions || [] };
  }
  if (target.startsWith('theme:')) {
    const record = system.themes.find((entry) => entry.id === target.slice(6));
    return record ? { kind: 'theme', id: record.id, name: record.name, record, config: ThemeSystem.clone(record.draft || record.config), versions: record.versions || [] } : null;
  }
  if (target === 'shop' && shopId) {
    const shop = db.shops.find((entry) => entry.id === shopId);
    if (!shop) return null;
    const published = shop.themeSystem?.published || { themeId: 'stap-default', overrides: {} };
    const draft = shop.themeSystem?.draft;
    const source = draft || published;
    const assigned = themeById(source.themeId)?.config || system.storeDefault.published;
    const config = ThemeSystem.merge(system.storeDefault.published, assigned, source.overrides || {});
    return { kind: 'shop', id: shop.id, name: shop.name, shop, config, versions: shop.themeSystem?.versions || [] };
  }
  return null;
}
const isKnownTheme = (id) => validThemeId(id) && Boolean(themeById(id));
const statuses = ['queued', 'preparing', 'ready', 'completed'];
const statusLabels = { queued: 'استلمنا طلبك', preparing: 'جاري التحضير', ready: 'جاهز للاستلام', completed: 'تم التسليم' };

app.post('/api/auth/login', (req, res) => {
  const username = cleanText(req.body?.username, 40);
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 128) : '';
  const admin = db.users.find((user) => user.role === 'admin' && user.username === username);
  const shop = db.shops.find((item) => item.username === username);
  if (!admin && shop && verifyPassword(password, shop.passwordHash) && subscriptionExpired(shop)) return res.status(403).json({ error: 'انتهت صلاحية اشتراك المتجر. يرجى التواصل مع الإدارة لتجديده.' });
  const account = admin || (shop?.active ? { ...shop, role: 'shop', shopId: shop.id } : null);
  if (!account || !verifyPassword(password, account.passwordHash)) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'تعذر بدء الجلسة' });
    if (account.role === 'admin' && account.totpSecret) {
      req.session.pendingAdminId = account.id;
      return res.json({ requiresTwoFactor: true });
    }
    req.session.authVersion = account.authVersion || 0;
    req.session.user = account.role === 'admin' ? { id: account.id, username: account.username, role: 'admin' } : { id: account.id, username: account.username, role: 'shop', shopId: account.shopId, name: account.name, slug: account.slug, theme: account.theme, bannerText: account.bannerText };
    res.json({ user: account.role === 'admin' ? { ...req.session.user, displayName: db.settings.adminDisplayName || '' } : req.session.user });
  });
});
app.post('/api/auth/verify-2fa', (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.pendingAdminId && user.role === 'admin' && user.totpSecret);
  if (!admin || !verifyTotp(admin.totpSecret, req.body?.code)) return res.status(401).json({ error: 'رمز التحقق غير صحيح' });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'تعذر بدء الجلسة' });
    req.session.authVersion = admin.authVersion || 0;
    req.session.user = { id: admin.id, username: admin.username, role: 'admin' };
    res.json({ user: { ...req.session.user, displayName: db.settings.adminDisplayName || '' } });
  });
});
app.post('/api/auth/logout', requireLogin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/auth/me', (req, res) => { const user = req.session.user; res.json({ user: user ? (user.role === 'admin' ? { ...user, displayName: db.settings.adminDisplayName || '' } : user) : null }); });
app.get('/healthz', (req, res) => res.json({ ok: true }));
const bannerImages = ['/images/customer/almond-croissant-workshop-coffee-lab-2025-06-27-1920.jpg','/images/customer/espresso-coffee-01-1920.jpg','/images/customer/gray-espresso-cup-with-amaretto-1-1920.jpg'];
const catalogImages = bannerImages;
const productImage = (name='', category='') => { const text=`${name} ${category}`.toLowerCase(); return text.includes('كرواسون')||text.includes('مخبوز')||text.includes('pastry')||text.includes('croissant')?catalogImages[0]:text.includes('قهوة')||text.includes('لاتيه')||text.includes('كابتشينو')||text.includes('اسبريسو')||text.includes('coffee')||text.includes('espresso')?catalogImages[1]:catalogImages[2]; };
const defaultBranding = { adminBrandTag: 'SUPER ADMIN / FULL ACCESS', shopBrandTag: 'ORDER CONTROL / STORE', customerBrandTag: 'ORDER / LIVE', screenBrandTag: 'ORDER SCREEN', workspaceLabel: 'WORKSPACE', adminFooter: 'سوبر أدمن · كامل الصلاحيات', shopFooter: 'إدارة الطلبات اليومية', workLabel: 'لوحة العمل', loginBrandTag: 'NAWA / ORDER STUDIO · RIYADH', loginHeadline: 'طلباتك، بإيقاع أفضل. من أول مسح.', loginIntro: 'مساحة هادئة لإدارة متجرك ومتابعة كل طلب حتى لحظة الاستلام.', customerBannerTitle: 'تجربة هادئة، حتى أول رشفة.', customerBannerCopy: 'تابع حالة طلبك مباشرة من هنا.', screenInstructions: 'امسح رمز طلبك لمتابعة حالته', brandMark: 'ن', appIcon: '', bannerImage: bannerImages[0] };
const publicBranding = () => {
  const branding = { ...defaultBranding, ...(db.settings.branding || {}) };
  if (!bannerImages.includes(branding.bannerImage)) branding.bannerImage = defaultBranding.bannerImage;
  branding.appIcon = safeImage(branding.appIcon);
  return branding;
};
app.get('/api/public/settings', (req, res) => res.json({ settings: { appName: db.settings.appName || 'نوى', branding: publicBranding(), textOverrides: db.settings.textOverrides || {} } }));
app.get('/api/public/custom-style.css', (req, res) => {
  return res.status(410).type('text/plain').send('Legacy custom CSS is disabled');
});
app.get('/api/public/shop-style.css/:slug/:surface', (req, res) => {
  return res.status(410).type('text/plain').send('Legacy custom CSS is disabled');
});
app.get('/api/public/themes.css/:id', (req, res) => res.status(410).type('text/plain').send('Legacy theme CSS is disabled'));
app.get('/api/public/fonts/:id', (req, res) => {
  const font = customFontById(req.params.id);
  if (!font) return res.status(404).type('text/plain').send('Font not found');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('font/woff2').send(Buffer.from(font.data, 'base64'));
});
app.get('/api/public/manifest.webmanifest', (req, res) => {
  const appName = db.settings.appName || 'نوى';
  const appIcon = publicBranding().appIcon;
  const icon = appIcon ? { src: appIcon, sizes: '512x512', type: appIcon.slice(5, appIcon.indexOf(';')), purpose: 'any' } : { src: '/assets/stap/app-icon-light.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' };
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/manifest+json').json({ id: '/', name: appName, short_name: appName.slice(0, 12), lang: 'ar', dir: 'rtl', start_url: '/', scope: '/', display: 'standalone', background_color: '#f1f1e9', theme_color: '#252821', icons: [icon] });
});

app.get('/api/admin/shops', requireLogin, requireAdmin, (req, res) => res.json({ shops: db.shops.map(safeShop) }));
app.get('/api/admin/theme-builder', requireLogin, requireAdmin, (req, res) => {
  const target = String(req.query.target || 'default');
  const data = adminThemeTarget(target, String(req.query.shopId || ''));
  if (!data) return res.status(404).json({ error: 'وجهة الثيم غير موجودة' });
  let published = data.kind === 'shop' ? data.config : data.kind === 'theme' ? data.record.config : data.record.published;
  if (data.kind === 'shop') { const revision=data.shop.themeSystem?.published||{themeId:'stap-default',overrides:{}}; published=ThemeSystem.merge(db.settings.themeSystem.storeDefault.published,themeById(revision.themeId)?.config||{},revision.overrides||{}); }
  res.json({ target: { kind: data.kind, id: data.id || '', name: data.name }, config: data.config, published, versions: data.versions, themes: publicThemeCatalog(), shops: db.shops.map(({ id, name }) => ({ id, name })) , fonts: publicFontCatalog() });
});
app.patch('/api/admin/theme-builder/draft', requireLogin, requireAdmin, async (req, res) => {
  const target = String(req.body?.target || 'default'), data = adminThemeTarget(target, String(req.body?.shopId || ''));
  const config = safeThemeConfig(req.body?.config);
  if (!data || !config) return res.status(400).json({ error: 'إعدادات الثيم غير صالحة أو الوجهة غير موجودة' });
  if (data.kind === 'shop') {
    const state = data.shop.themeSystem || sanitizeShopThemeState(null, data.shop.theme);
    const overrides = sanitizeThemeOverride(config);
    if (!overrides) return res.status(400).json({ error: 'تعذر حفظ تخصيص المتجر' });
    state.draft = { themeId: state.draft?.themeId || state.published.themeId, overrides };
    data.shop.themeSystem = state;
  } else if (data.kind === 'theme') data.record.draft = config;
  else { if (data.kind === 'default') config.name = 'stap Default Theme'; data.record.draft = config; }
  await saveDb();
  res.json({ ok: true, config });
});
app.post('/api/admin/theme-builder/publish', requireLogin, requireAdmin, async (req, res) => {
  const target = String(req.body?.target || 'default'), data = adminThemeTarget(target, String(req.body?.shopId || ''));
  if (!data) return res.status(404).json({ error: 'وجهة الثيم غير موجودة' });
  const time = Date.now();
  if (data.kind === 'shop') {
    const state = data.shop.themeSystem || sanitizeShopThemeState(null, data.shop.theme);
    const draft = state.draft || { themeId: 'stap-default', overrides: {} };
    state.versions = [...(state.versions || []), { revision: state.published, createdAt: time }].slice(-20);
    state.published = draft; state.draft = null; data.shop.themeSystem = state; data.shop.theme = draft.themeId;
  } else {
    data.record.versions = [...(data.record.versions || []), { config: data.record.published || data.record.config, createdAt: time }].slice(-20);
    if (data.kind === 'theme') { data.record.config = data.record.draft || data.record.config; data.record.name = cleanText(data.record.config.name, 60) || data.record.name; }
    else data.record.published = data.record.draft || data.record.published;
    data.record.draft = ThemeSystem.clone(data.record.config || data.record.published);
  }
  await saveDb(); res.json({ ok: true });
});
app.post('/api/admin/theme-builder/themes', requireLogin, requireAdmin, async (req, res) => {
  const name = cleanText(req.body?.name, 60), config = safeThemeConfig(req.body?.config);
  if (name.length < 2 || !config || db.settings.themeSystem.themes.length >= 40) return res.status(400).json({ error: 'تحقق من اسم الثيم وإعداداته أو عدد الثيمات (الحد 40)' });
  const id = `theme-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  config.name = name;
  const record = { id, name, config, draft: ThemeSystem.clone(config), createdAt: Date.now(), updatedAt: Date.now(), versions: [] };
  db.settings.themeSystem.themes.push(record); await saveDb();
  res.status(201).json({ theme: { id, name }, themes: publicThemeCatalog() });
});
app.post('/api/admin/theme-builder/assign', requireLogin, requireAdmin, async (req, res) => {
  const shop = db.shops.find((entry) => entry.id === req.body?.shopId), themeId = String(req.body?.themeId || '');
  if (!shop || !isKnownTheme(themeId)) return res.status(400).json({ error: 'اختر متجرًا وثيمًا صالحين' });
  const state = sanitizeShopThemeState(shop.themeSystem, shop.theme);
  state.draft = { themeId, overrides: {} }; shop.themeSystem = state; await saveDb();
  res.json({ ok: true, requiresPublish: true });
});
app.post('/api/admin/theme-builder/restore', requireLogin, requireAdmin, async (req, res) => {
  const target = String(req.body?.target || 'default'), data = adminThemeTarget(target, String(req.body?.shopId || ''));
  const index = Number(req.body?.index);
  const version = data?.versions?.[index];
  if (!data || !version) return res.status(404).json({ error: 'الإصدار غير موجود' });
  if (data.kind === 'shop') data.shop.themeSystem.draft = version.revision;
  else if (data.kind === 'theme') data.record.draft = version.config;
  else data.record.draft = version.config;
  await saveDb(); res.json({ ok: true });
});
app.delete('/api/admin/theme-builder/themes/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!/^theme-[a-f0-9]{12}$/.test(id)) return res.status(400).json({ error: 'لا يمكن حذف الثيم الافتراضي' });
  if (db.shops.some((shop) => shop.themeSystem?.published?.themeId === id || shop.themeSystem?.draft?.themeId === id)) return res.status(409).json({ error: 'الثيم مستخدم لدى متجر؛ عيّن له ثيمًا آخر أولًا' });
  const before = db.settings.themeSystem.themes.length;
  db.settings.themeSystem.themes = db.settings.themeSystem.themes.filter((theme) => theme.id !== id);
  if (before === db.settings.themeSystem.themes.length) return res.status(404).json({ error: 'الثيم غير موجود' });
  await saveDb(); res.json({ ok: true });
});
app.post('/api/admin/themes', requireLogin, requireAdmin, (req, res) => res.status(410).json({ error: 'تم إيقاف محرر الثيمات القديم. استخدم محرر الثيمات المركزي.' }));
app.patch('/api/admin/themes/:id', requireLogin, requireAdmin, (req, res) => res.status(410).json({ error: 'تم إيقاف محرر الثيمات القديم. استخدم محرر الثيمات المركزي.' }));
app.delete('/api/admin/themes/:id', requireLogin, requireAdmin, (req, res) => res.status(410).json({ error: 'تم إيقاف محرر الثيمات القديم. استخدم محرر الثيمات المركزي.' }));
app.get('/api/admin/settings', requireLogin, requireAdmin, (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.user.id && user.role === 'admin');
  res.json({ settings: { appName: db.settings.appName || 'نوى', adminDisplayName: db.settings.adminDisplayName || '', adminTheme: 'stap-default', customThemes: [], customFonts: publicFontCatalog(), branding: publicBranding(), textOverrides: db.settings.textOverrides || {}, stylePresets: [], activeStyleId: '', twoFactorEnabled: Boolean(admin?.totpSecret) } });
});
app.post('/api/admin/fonts', requireLogin, requireAdmin, async (req, res) => {
  if (db.settings.customFonts.length >= 4) return res.status(400).json({ error: 'يمكن حفظ 4 خطوط مخصصة كحد أقصى؛ احذف خطًا غير مستخدم لإضافة آخر' });
  const name = cleanText(req.body?.name, 50), dataUrl = req.body?.dataUrl;
  const encoded = typeof dataUrl === 'string' ? /^data:font\/woff2;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)?.[1] : '';
  const bytes = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (name.length < 2 || !encoded || bytes.length < 16 || bytes.length > maxFontBytes || bytes.subarray(0, 4).toString('ascii') !== 'wOF2') return res.status(400).json({ error: 'ارفع ملف WOFF2 صالحًا بحجم لا يتجاوز 256 كيلوبايت' });
  if (db.settings.customFonts.some((font) => font.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return res.status(409).json({ error: 'يوجد خط بهذا الاسم بالفعل' });
  const font = { id: `font-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`, name, format: 'woff2', bytes: bytes.length, data: encoded };
  db.settings.customFonts.push(font);
  await saveDb();
  res.status(201).json({ customFonts: publicFontCatalog(), customThemes: publicThemeCatalog() });
});
app.delete('/api/admin/fonts/:id', requireLogin, requireAdmin, async (req, res) => {
  if (!customFontById(req.params.id)) return res.status(404).json({ error: 'الخط المخصص غير موجود' });
  const replaceReferences = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['bodyFont','headingFont','numberFont'].includes(key) && child === req.params.id) value[key] = 'system';
      else replaceReferences(child);
    }
  };
  replaceReferences(db.settings.themeSystem); for (const shop of db.shops) replaceReferences(shop.themeSystem);
  db.settings.customFonts = db.settings.customFonts.filter((font) => font.id !== req.params.id);
  await saveDb();
  res.json({ customFonts: publicFontCatalog(), customThemes: publicThemeCatalog() });
});
app.post('/api/admin/password', requireLogin, requireAdmin, async (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.user.id && user.role === 'admin');
  if (!admin || !verifyPassword(String(req.body?.currentPassword || '').slice(0, 128), admin.passwordHash)) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  if (admin.totpSecret && !verifyTotp(admin.totpSecret, req.body?.code)) return res.status(401).json({ error: 'أدخل رمز التحقق بخطوتين' });
  if (!validPassword(req.body?.newPassword)) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 خانة' });
  admin.passwordHash = hashPassword(req.body.newPassword);
  admin.authVersion = (admin.authVersion || 0) + 1;
  await saveDb();
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'تم تغيير كلمة المرور، سجّل الدخول مجددًا' });
    req.session.authVersion = admin.authVersion;
    req.session.user = { id: admin.id, username: admin.username, role: 'admin' };
    res.json({ ok: true });
  });
});
app.post('/api/admin/2fa/setup', requireLogin, requireAdmin, async (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.user.id && user.role === 'admin');
  if (!admin || !verifyPassword(String(req.body?.currentPassword || '').slice(0, 128), admin.passwordHash)) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  if (admin.totpSecret) return res.status(409).json({ error: 'التحقق بخطوتين مفعّل بالفعل' });
  const secret = base32Encode(crypto.randomBytes(20));
  req.session.pendingTotpSecret = secret;
  const label = encodeURIComponent(`${db.settings.appName || 'نوى'}:${admin.username}`);
  const issuer = encodeURIComponent(db.settings.appName || 'نوى');
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  res.json({ secret, qr: await QRCode.toDataURL(uri, { width: 220, margin: 1 }) });
});
app.post('/api/admin/2fa/enable', requireLogin, requireAdmin, async (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.user.id && user.role === 'admin');
  const secret = req.session.pendingTotpSecret;
  if (!admin || !secret || !verifyTotp(secret, req.body?.code)) return res.status(400).json({ error: 'تحقق من الرمز وحاول مجددًا' });
  admin.totpSecret = secret;
  admin.authVersion = (admin.authVersion || 0) + 1;
  delete req.session.pendingTotpSecret;
  await saveDb();
  req.session.authVersion = admin.authVersion;
  res.json({ ok: true });
});
app.post('/api/admin/2fa/disable', requireLogin, requireAdmin, async (req, res) => {
  const admin = db.users.find((user) => user.id === req.session.user.id && user.role === 'admin');
  if (!admin?.totpSecret || !verifyPassword(String(req.body?.currentPassword || '').slice(0, 128), admin.passwordHash) || !verifyTotp(admin.totpSecret, req.body?.code)) return res.status(401).json({ error: 'تحقق من كلمة المرور ورمز المصادقة' });
  delete admin.totpSecret;
  admin.authVersion = (admin.authVersion || 0) + 1;
  await saveDb();
  req.session.authVersion = admin.authVersion;
  res.json({ ok: true });
});
app.patch('/api/admin/settings', requireLogin, requireAdmin, async (req, res) => {
  if (req.body?.adminTheme !== undefined && !isKnownTheme(req.body.adminTheme)) return res.status(400).json({ error: 'الثيم المحدد غير موجود في المكتبة' });
  const appName = req.body?.appName === undefined ? db.settings.appName : cleanText(req.body.appName, 40);
  if (typeof appName !== 'string' || appName.length < 2) return res.status(400).json({ error: 'اسم الموقع يجب أن يكون حرفين على الأقل' });
  db.settings.appName = appName;
  if (req.body?.adminDisplayName !== undefined) db.settings.adminDisplayName = cleanText(req.body.adminDisplayName, 60);
  if (req.body?.adminTheme !== undefined) db.settings.adminTheme = req.body.adminTheme;
  if (req.body?.textOverrides !== undefined) {
    const overrides = req.body.textOverrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).length > 200) return res.status(400).json({ error: 'تحقق من تعديلات النصوص؛ الحد الأقصى 200 عبارة' });
    const safeOverrides = {};
    for (const [source, replacement] of Object.entries(overrides)) {
      const key = cleanText(source, 120), value = cleanText(replacement, 120);
      if (!key || !value) return res.status(400).json({ error: 'النص الأصلي والبديل مطلوبان وبحد أقصى 120 حرفًا' });
      safeOverrides[key] = value;
    }
    db.settings.textOverrides = safeOverrides;
  }
  if (req.body?.branding && typeof req.body.branding === 'object' && !Array.isArray(req.body.branding)) {
    const next = { ...publicBranding() };
    for (const key of Object.keys(defaultBranding)) if (req.body.branding[key] !== undefined) {
      if (key === 'bannerImage') { if (!bannerImages.includes(req.body.branding[key])) return res.status(400).json({ error: 'اختر صورة بنر من الصور المتاحة' }); next[key] = req.body.branding[key]; }
      else if (key === 'appIcon') { const icon = req.body.branding[key] === '' ? '' : safeImage(req.body.branding[key]); if (req.body.branding[key] && !icon) return res.status(400).json({ error: 'أيقونة التطبيق غير صالحة أو تتجاوز الحجم المسموح' }); next[key] = icon; }
      else if (key === 'brandMark') { const mark = cleanText(req.body.branding[key], 3); if (!mark) return res.status(400).json({ error: 'رمز الشعار لا يمكن أن يكون فارغًا' }); next[key] = mark; }
      else next[key] = cleanText(req.body.branding[key], 60);
    }
    db.settings.branding = next;
  }
  if (req.body?.stylePresets !== undefined || req.body?.activeStyleId !== undefined) return res.status(410).json({ error: 'تم إيقاف ستايلات CSS القديمة. استخدم محرر الثيمات الآمن.' });
  await saveDb();
  res.json({ settings: { appName, adminDisplayName: db.settings.adminDisplayName || '', adminTheme: 'stap-default', customThemes: [], customFonts: publicFontCatalog(), branding: publicBranding(), textOverrides: db.settings.textOverrides || {}, stylePresets: [], activeStyleId: '' } });
});
app.post('/api/admin/shops', requireLogin, requireAdmin, async (req, res) => {
  const name = cleanText(req.body?.name, 70);
  const username = cleanText(req.body?.username, 40);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const reviewUrl = req.body?.reviewUrl ? googleUrl(req.body.reviewUrl) : '';
  const theme = req.body?.theme === undefined ? 'stap-default' : isKnownTheme(req.body.theme) ? req.body.theme : null;
  const orderMode = ['catalog','custom'].includes(req.body?.orderMode) ? req.body.orderMode : 'catalog';
  const subscriptionEndDate = req.body?.subscriptionEndDate;
  if (name.length < 2 || !/^[A-Za-z0-9_.-]{3,40}$/.test(username) || !validPassword(password) || !validSubscriptionDate(subscriptionEndDate) || !theme) return res.status(400).json({ error: 'تحقق من بيانات المتجر والثيم المحدد وتاريخ انتهاء الاشتراك' });
  if (db.shops.some((s) => s.username === username) || db.users.some((u) => u.username === username)) return res.status(409).json({ error: 'اسم المستخدم مستخدم من قبل' });
  if (req.body?.reviewUrl && !reviewUrl) return res.status(400).json({ error: 'أدخل رابط Google Maps آمن يبدأ بـ HTTPS' });
  const slug = `${username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
  const shop = { id: crypto.randomUUID(), slug, name, username, passwordHash: hashPassword(password), active: true, subscriptionEndDate, reviewUrl, theme, themeSystem: sanitizeShopThemeState(null, theme), orderMode, items: [], bannerText: cleanText(req.body?.bannerText, 90) || 'أهلاً بك — اطلب واستمتع', bannerImage: safeImage(req.body?.bannerImage), iconImage: safeImage(req.body?.iconImage), visibleSections: Array.isArray(req.body?.visibleSections) ? req.body.visibleSections.filter((section) => allShopSections.includes(section)) : [...allShopSections], chatEnabled: req.body?.chatEnabled !== false, createdAt: new Date().toISOString() };
  if ((req.body?.bannerImage && !shop.bannerImage) || (req.body?.iconImage && !shop.iconImage)) return res.status(400).json({ error: 'الصورة غير صالحة أو أكبر من الحد المسموح' });
  db.shops.push(shop); await saveDb(); res.status(201).json({ shop: safeShop(shop) });
});
app.patch('/api/admin/shops/:id', requireLogin, requireAdmin, async (req, res) => {
  const shop = db.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'المتجر غير موجود' });
  if (req.body?.subscriptionEndDate !== undefined && !validSubscriptionDate(req.body.subscriptionEndDate)) return res.status(400).json({ error: 'حدد تاريخ انتهاء اشتراك صالحًا' });
  if (req.body?.username !== undefined) {
    const username = cleanText(req.body.username, 40);
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: 'اسم مستخدم المتجر غير صالح' });
    if (db.shops.some((entry) => entry.id !== shop.id && entry.username === username) || db.users.some((entry) => entry.username === username)) return res.status(409).json({ error: 'اسم المستخدم مستخدم من قبل' });
    shop.username = username;
  }
  if (req.body?.password) {
    if (!validPassword(req.body.password)) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 خانة' });
    shop.passwordHash = hashPassword(req.body.password);
    shop.authVersion = (shop.authVersion || 0) + 1;
  }
  if (req.body?.name !== undefined) shop.name = cleanText(req.body.name, 70) || shop.name;
  if (req.body?.reviewUrl !== undefined) {
    const url = req.body.reviewUrl === '' ? '' : googleUrl(req.body.reviewUrl);
    if (req.body.reviewUrl && !url) return res.status(400).json({ error: 'أدخل رابط Google Maps آمن يبدأ بـ HTTPS' });
    shop.reviewUrl = url;
  }
  if (req.body?.theme !== undefined) { if (!isKnownTheme(req.body.theme)) return res.status(400).json({ error: 'الثيم المحدد غير موجود في المكتبة' }); shop.theme = req.body.theme; }
  if (req.body?.orderMode !== undefined && ['catalog','custom'].includes(req.body.orderMode)) shop.orderMode = req.body.orderMode;
  if (req.body?.bannerText !== undefined) shop.bannerText = cleanText(req.body.bannerText, 90);
  for (const key of ['bannerImage', 'iconImage']) if (req.body?.[key] !== undefined) {
    const value = req.body[key] === '' ? '' : safeImage(req.body[key]);
    if (req.body[key] !== '' && !value) return res.status(400).json({ error: 'الصورة غير صالحة أو أكبر من الحد المسموح (1.1 ميغابايت)' });
    shop[key] = value;
  }
  if (req.body?.chatEnabled !== undefined) {
    if (typeof req.body.chatEnabled !== 'boolean') return res.status(400).json({ error: 'حالة تواصل المتجر غير صالحة' });
    shop.chatEnabled = req.body.chatEnabled;
  }
  if (req.body?.visibleSections !== undefined) {
    if (!Array.isArray(req.body.visibleSections) || req.body.visibleSections.some((section) => !allShopSections.includes(section))) return res.status(400).json({ error: 'قائمة أقسام المتجر غير صالحة' });
    shop.visibleSections = [...new Set(req.body.visibleSections)];
  }
  if (req.body?.subscriptionEndDate !== undefined) shop.subscriptionEndDate = req.body.subscriptionEndDate;
  if (req.body?.active !== undefined) shop.active = !!req.body.active;
  await saveDb(); res.json({ shop: safeShop(shop) });
});
app.delete('/api/admin/shops/:id', requireLogin, requireAdmin, async (req, res) => {
  db.shops = db.shops.filter((s) => s.id !== req.params.id);
  db.orders = db.orders.filter((o) => o.shopId !== req.params.id);
  await saveDb(); res.json({ ok: true });
});
app.get('/api/admin/shops/:id/items', requireLogin, requireAdmin, (req, res) => {
  const shop = db.shops.find((s) => s.id === req.params.id);
  return shop ? res.json({ items: (shop.items || []).map(sanitizeItem) }) : res.status(404).json({ error: 'المتجر غير موجود' });
});
function chatForShop(shop, req, res) {
  shop.messages ||= [];
  if (req.method === 'GET') {
    const role = req.session.user.role, counterpart = role === 'admin' ? 'shop' : 'admin', readKey = role === 'admin' ? 'adminReadAt' : 'storeReadAt', readAt = new Date().toISOString();
    let changed = false;
    if (req.query.read === '1') for (const message of shop.messages) if (message.sender === counterpart && !message.readAt) { message.readAt = readAt; changed = true; }
    const latestUnread = [...shop.messages].reverse().find((message) => message.sender === counterpart);
    if (latestUnread && shop[readKey] !== latestUnread.createdAt) { shop[readKey] = latestUnread.createdAt; changed = true; }
    const before = shop.messages.length;
    shop.messages = shop.messages.filter((message) => !message.readAt || Date.now() - Date.parse(message.readAt) < 10 * 60 * 1000);
    if (shop.messages.length !== before) changed = true;
    if (changed) saveDb().catch(() => {});
    return res.json({ messages: shop.messages.slice(-100) });
  }
  const text = cleanText(req.body?.text, 1000);
  if (text.length < 1) return res.status(400).json({ error: 'اكتب رسالة قبل الإرسال' });
  const role = req.session.user.role;
  const message = { id: crypto.randomUUID(), sender: role, senderName: role === 'admin' ? (db.settings.adminDisplayName || req.session.user.username) : shop.name, text, createdAt: new Date().toISOString() };
  shop.messages.push(message); if (shop.messages.length > 500) shop.messages.splice(0, shop.messages.length - 500);
  saveDb().then(() => res.status(201).json({ message })).catch(() => res.status(500).json({ error: 'تعذر حفظ الرسالة' }));
}
const chatExpiryTimer = setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  let changed = false;
  for (const shop of db.shops) {
    const messages = shop.messages || [];
    shop.messages = messages.filter((message) => !message.readAt || !Number.isFinite(Date.parse(message.readAt)) || Date.parse(message.readAt) > cutoff);
    if (shop.messages.length !== messages.length) changed = true;
  }
  if (changed) saveDb().catch(() => {});
}, 30_000);
chatExpiryTimer.unref();
app.get('/api/admin/chat/inbox', requireLogin, requireAdmin, (req, res) => res.json({ chats: db.shops.map((shop) => ({ id: shop.id, name: shop.name, unread: (shop.messages || []).filter((message) => message.sender === 'shop' && !message.readAt).length, latest: shop.messages?.at(-1) || null })) }));
app.get('/api/admin/shops/:id/chat', requireLogin, requireAdmin, (req, res) => { const shop=db.shops.find((entry)=>entry.id===req.params.id); return shop ? chatForShop(shop,req,res) : res.status(404).json({error:'المتجر غير موجود'}); });
app.post('/api/admin/shops/:id/chat', requireLogin, requireAdmin, (req, res) => { const shop=db.shops.find((entry)=>entry.id===req.params.id); return shop ? chatForShop(shop,req,res) : res.status(404).json({error:'المتجر غير موجود'}); });
app.get('/api/shop/chat', requireLogin, requireShop, (req,res)=>req.shop.chatEnabled===false?res.status(403).json({error:'التواصل مع الأدمن غير متاح لهذا المتجر'}):chatForShop(req.shop,req,res));
app.post('/api/shop/chat', requireLogin, requireShop, (req,res)=>req.shop.chatEnabled===false?res.status(403).json({error:'التواصل مع الأدمن غير متاح لهذا المتجر'}):chatForShop(req.shop,req,res));
app.post('/api/admin/shops/:id/items', requireLogin, requireAdmin, (req, res) => {
  const shop = db.shops.find((s) => s.id === req.params.id);
  return shop ? manageShopItems(shop, req, res) : res.status(404).json({ error: 'المتجر غير موجود' });
});
app.patch('/api/admin/shops/:id/items/:itemId', requireLogin, requireAdmin, (req, res) => {
  const shop = db.shops.find((s) => s.id === req.params.id);
  return shop ? manageShopItems(shop, req, res) : res.status(404).json({ error: 'المتجر غير موجود' });
});
app.delete('/api/admin/shops/:id/items/:itemId', requireLogin, requireAdmin, (req, res) => {
  const shop = db.shops.find((s) => s.id === req.params.id);
  return shop ? manageShopItems(shop, req, res) : res.status(404).json({ error: 'المتجر غير موجود' });
});

app.get('/api/shop/orders', requireLogin, requireShop, (req, res) => res.json({ orders: db.orders.filter((o) => o.shopId === req.shop.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(safeOrder) }));
app.get('/api/shop/config', requireLogin, requireShop, (req, res) => res.json({ shop: { slug: req.shop.slug, name: req.shop.name, theme: req.shop.theme, themeData: resolveThemeData(req.shop), customThemes: publicThemeCatalog(), customFonts: publicFontCatalog(), orderMode: req.shop.orderMode || 'catalog', bannerText: req.shop.bannerText, iconImage: safeImage(req.shop.iconImage), visibleSections: shopSections(req.shop), chatEnabled: req.shop.chatEnabled !== false, subscriptionEndDate: validSubscriptionDate(req.shop.subscriptionEndDate) ? req.shop.subscriptionEndDate : '', subscriptionDaysRemaining: subscriptionDaysRemaining(req.shop) } }));
async function createOrderForShop(shop, body, res) {
  const customerName = cleanText(body?.customerName, 60);
  let item = '', items = [], prepMinutes = 0;
  if (shop.orderMode === 'custom') {
    item = cleanText(body?.item, 180);
    if (customerName.length < 2 || item.length < 2) return res.status(400).json({ error: 'أدخل اسم العميل وتفاصيل الطلب' });
  } else {
    const selections = Array.isArray(body?.items) ? body.items : [];
    if (!customerName || customerName.length < 2 || selections.length < 1 || selections.length > 20) return res.status(400).json({ error: 'أدخل اسم العميل واختر صنفًا واحدًا على الأقل' });
    const quantities = new Map();
    for (const selection of selections) {
      if (typeof selection?.id !== 'string' || !Number.isInteger(Number(selection.quantity)) || Number(selection.quantity) < 1 || Number(selection.quantity) > 20) return res.status(400).json({ error: 'تحقق من الأصناف والكميات' });
      quantities.set(selection.id, (quantities.get(selection.id) || 0) + Number(selection.quantity));
    }
    items = [...quantities].map(([id, quantity]) => {
      const entry = (shop.items || []).find((candidate) => candidate.id === id && candidate.active !== false);
      return entry ? { id: entry.id, name: entry.name, category: entry.category, prepMinutes: entry.prepMinutes, image: catalogImages.includes(entry.image) ? entry.image : productImage(entry.name,entry.category), quantity } : null;
    });
    if (items.some((entry) => !entry)) return res.status(400).json({ error: 'أحد الأصناف لم يعد متاحًا، حدّث القائمة وحاول مجددًا' });
    prepMinutes = Math.min(180, items.reduce((sum, entry) => sum + entry.prepMinutes * entry.quantity, 0));
    item = items.map((entry) => `${entry.name} × ${entry.quantity}`).join('، ');
  }
  const order = { id: crypto.randomBytes(12).toString('hex'), shopId: shop.id, number: String(1000 + crypto.randomInt(9000)), customerName, item, items, prepMinutes, pushSubscriptions: [], status: 'queued', scanned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.orders.push(order); db.orders = db.orders.slice(-500); await saveDb();
  res.status(201).json({ order: safeOrder(order) });
}
app.post('/api/shop/orders', requireLogin, requireShop, async (req, res) => createOrderForShop(req.shop, req.body, res));
app.post('/api/admin/shops/:id/orders', requireLogin, requireAdmin, async (req, res) => {
  const shop = db.shops.find((entry) => entry.id === req.params.id && entry.active && !subscriptionExpired(entry));
  return shop ? createOrderForShop(shop, req.body, res) : res.status(404).json({ error: 'المتجر غير متاح' });
});
app.get('/api/admin/shops/:id/orders', requireLogin, requireAdmin, (req, res) => {
  const shop = db.shops.find((entry) => entry.id === req.params.id);
  return shop ? res.json({ orders: db.orders.filter((order) => order.shopId === shop.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(safeOrder) }) : res.status(404).json({ error: 'المتجر غير موجود' });
});
app.delete('/api/shop/orders/completed', requireLogin, requireShop, async (req, res) => {
  const before = db.orders.length;
  db.orders = db.orders.filter((order) => order.shopId !== req.shop.id || order.status !== 'completed');
  const cleared = before - db.orders.length;
  if (cleared) await saveDb();
  res.json({ ok: true, cleared });
});
async function sendReadyPush(order, shop) {
  if (!pushReady || !order.pushSubscriptions?.length) return;
  const message = JSON.stringify({ title: `${shop.name} — طلبك جاهز`, body: `الطلب #${order.number} جاهز للاستلام`, url: `${appBaseUrl()}/order/${order.id}`, tag: `order-${order.id}` });
  const results = await Promise.allSettled(order.pushSubscriptions.map((subscription) => webPush.sendNotification(subscription, message, { TTL: 300, urgency: 'high', timeout: 8000 })));
  const expired = new Set(results.flatMap((result, i) => result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode) ? [order.pushSubscriptions[i].endpoint] : []));
  if (expired.size) { order.pushSubscriptions = order.pushSubscriptions.filter((sub) => !expired.has(sub.endpoint)); await saveDb(); }
}
async function updateOrderStatus(order, status, shop, res) {
  if (!order || !statuses.includes(status)) return res.status(400).json({ error: 'تعذر تحديث الطلب' });
  const wasReady = order.status === 'ready';
  order.status = status; order.updatedAt = new Date().toISOString(); await saveDb();
  if (order.status === 'ready' && !wasReady) return sendReadyPush(order, shop).then(() => res.json({ order: safeOrder(order), pushConfigured: pushReady }));
  return res.json({ order: safeOrder(order), pushConfigured: pushReady });
}
app.patch('/api/shop/orders/:id', requireLogin, requireShop, async (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id && o.shopId === req.shop.id);
  return updateOrderStatus(order, req.body?.status, req.shop, res);
});
app.patch('/api/admin/shops/:id/orders/:orderId', requireLogin, requireAdmin, async (req, res) => {
  const shop = db.shops.find((entry) => entry.id === req.params.id);
  const order = db.orders.find((entry) => entry.id === req.params.orderId && entry.shopId === req.params.id);
  if (!shop || !order) return res.status(404).json({ error: 'الطلب غير موجود' });
  return updateOrderStatus(order, req.body?.status, shop, res);
});
app.delete('/api/admin/shops/:id/orders/completed', requireLogin, requireAdmin, async (req, res) => {
  const shop = db.shops.find((entry) => entry.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'المتجر غير موجود' });
  const before = db.orders.length;
  db.orders = db.orders.filter((order) => order.shopId !== shop.id || order.status !== 'completed');
  const cleared = before - db.orders.length;
  if (cleared) await saveDb();
  res.json({ ok: true, cleared });
});
app.get('/api/shop/items', requireLogin, requireShop, (req, res) => manageShopItems(req.shop, req, res));
app.post('/api/shop/items', requireLogin, requireShop, (req, res) => manageShopItems(req.shop, req, res));
app.patch('/api/shop/items/:itemId', requireLogin, requireShop, (req, res) => manageShopItems(req.shop, req, res));
app.delete('/api/shop/items/:itemId', requireLogin, requireShop, (req, res) => manageShopItems(req.shop, req, res));
app.patch('/api/shop/settings', requireLogin, requireShop, async (req, res) => {
  if (req.body?.theme !== undefined) { if (!isKnownTheme(req.body.theme)) return res.status(400).json({ error: 'الثيم المحدد غير موجود في المكتبة' }); req.shop.theme = req.body.theme; }
  if (req.body?.bannerText !== undefined) req.shop.bannerText = cleanText(req.body.bannerText, 90);
  await saveDb(); res.json({ shop: safeShop(req.shop) });
});

app.get('/api/public/push-key', (req, res) => res.json({ key: pushReady ? vapidPublicKey : '' }));
app.get('/api/public/orders/:id', async (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (!order.scanned) return res.status(403).json({ error: 'امسح رمز الطلب المعروض على شاشة المتجر لعرض بطاقة الحالة' });
  const shop = db.shops.find((s) => s.id === order.shopId);
  const publicShop={ name: shop?.name || '', bannerText: shop?.bannerText || '', reviewUrl: order.status === 'completed' ? shop?.reviewUrl || '' : '', theme: shop?.theme || 'stap-default', themeData: shop ? resolveThemeData(shop, 'customerCard') : null };
  if(req.query.design==='1')Object.assign(publicShop,{slug:shop?.slug||'',bannerImage:safeImage(shop?.bannerImage),iconImage:safeImage(shop?.iconImage)});
  res.json({ order: { id: order.id, number: order.number, customerName: order.customerName || '', item: order.item, items: order.items || [], prepMinutes: order.prepMinutes || 0, status: order.status, statusLabel: statusLabels[order.status], updatedAt: order.updatedAt }, shop: publicShop });
});
app.get('/scan/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).send('الطلب غير موجود');
  const shop = db.shops.find((s) => s.id === order.shopId);
  order.scanned = true;
  if (shop) shop.screenBannerUntil = Date.now() + 4500;
  await saveDb();
  res.redirect(302, `/order/${encodeURIComponent(order.id)}`);
});
app.post('/api/public/orders/:id/push', async (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order || !order.scanned) return res.status(403).json({ error: 'امسح رمز الطلب أولاً' });
  const sub = req.body?.subscription;
  if (!pushReady) return res.status(503).json({ error: 'إشعارات الويب غير مهيأة على الخادم بعد' });
  let endpoint;
  try { endpoint = new URL(sub?.endpoint); } catch {}
  const pushHost = endpoint?.hostname.toLowerCase() || '';
  const trustedPushHost = pushHost === 'fcm.googleapis.com' || pushHost.endsWith('.push.services.mozilla.com') || pushHost === 'web.push.apple.com' || pushHost.endsWith('.push.apple.com') || pushHost.endsWith('.notify.windows.com');
  if (!order || !endpoint || endpoint.protocol !== 'https:' || endpoint.port || !trustedPushHost || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return res.status(400).json({ error: 'بيانات اشتراك الإشعار غير صالحة' });
  order.pushSubscriptions ||= [];
  if (!order.pushSubscriptions.some((entry) => entry.endpoint === sub.endpoint)) {
    if (order.pushSubscriptions.length >= 5) return res.status(400).json({ error: 'تم بلوغ حد الأجهزة لهذا الطلب' });
    order.pushSubscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }); await saveDb();
  }
  res.json({ ok: true });
});
app.get('/api/public/screen/:slug', async (req, res) => {
  const shop = db.shops.find((s) => s.slug === req.params.slug && s.active && !subscriptionExpired(s));
  if (!shop) return res.status(404).json({ error: 'المتجر غير متاح' });
  const active = Date.now() < (shop.screenBannerUntil || 0) ? null : db.orders.find((o) => o.shopId === shop.id && o.status !== 'completed' && !o.scanned);
  const screenShop=publicScreenShop(shop);if(req.query.design!=='1'){delete screenShop.bannerImage;delete screenShop.iconImage;}
  res.json({ shop: screenShop, activeOrder: active ? { number: active.number, status: active.status, statusLabel: statusLabels[active.status], qr: await QRCode.toDataURL(`${appBaseUrl()}/scan/${active.id}`, { width: 240, margin: 1 }) } : null });
});

app.get('*all', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); if (!res.headersSent) res.status(500).json({ error: 'حدث خطأ غير متوقع' }); });
async function start() {
  const remote = await loadRemoteDb();
  if (remote) db = remote;
  const changed = normalizeAndSeedDb();
  if (changed || (redisUrl && !remote)) await saveDb();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`نوى جاهز على http://localhost:${port}`));
}
start().catch((error) => { console.error('Startup failed:', error.message); process.exitCode = 1; });
