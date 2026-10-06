require('dotenv').config();
// ============================================================
// LabDrop — Temporary Lab File Transfer System
// server.js — Main application entry point
// ============================================================

const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, GetObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectVersionsCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const archiver = require('archiver');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const storage = require('./storage');
const mongoose = require('mongoose');
const aiService = require('./ai-service');

const JWT_SECRET = process.env.JWT_SECRET || 'labdrop-super-secret-jwt-key';

// Keep process alive across transient DNS/network dropouts (e.g. PC sleep/wake)
process.on('unhandledRejection', (reason) => {
  console.warn('[Process] Handled unhandled rejection:', reason && (reason.message || reason));
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err && (err.message || err));
});

// Initialize S3 Client
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  PORT: parseInt(process.env.PORT || process.env.LABDROP_PORT || '3000', 10),
  UPLOAD_DIR: path.join(__dirname, 'uploads'),
  MAX_FILE_SIZE: parseInt(process.env.LABDROP_MAX_FILE_SIZE || String(250 * 1024 * 1024), 10), // 250 MB
  MAX_FILES_PER_TRANSFER: parseInt(process.env.LABDROP_MAX_FILES || '30', 10), // 30 files
  MAX_TOTAL_SIZE: parseInt(process.env.LABDROP_MAX_TOTAL_SIZE || String(1024 * 1024 * 1024), 10), // 1 GB (1,024 MB)
  TRANSFER_EXPIRY_MINUTES: parseInt(process.env.LABDROP_EXPIRY_MINUTES || '30', 10),
  CLEANUP_INTERVAL_MS: 60 * 1000, // Check every 1 minute
};

// Dangerous file extensions that should be blocked
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1',
]);


// ============================================================
// Utility: Get best local IPv4 address
// ============================================================

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  // Prefer common interface names first
  const preferredNames = ['Wi-Fi', 'Ethernet', 'en0', 'eth0', 'wlan0'];

  for (const name of preferredNames) {
    const iface = interfaces[name];
    if (iface) {
      const v4 = iface.find(i => i.family === 'IPv4' && !i.internal);
      if (v4) return v4.address;
    }
  }

  // Fallback: pick the first external IPv4 address
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    const v4 = iface.find(i => i.family === 'IPv4' && !i.internal);
    if (v4) return v4.address;
  }

  return '127.0.0.1';
}

// ============================================================
// Utility: Sanitize filename
// ============================================================

function sanitizeFilename(filename) {
  // Remove path separators and null bytes
  let safe = filename.replace(/[/\\:\0]/g, '_');
  // Remove leading dots (prevent hidden files / dotfile tricks)
  safe = safe.replace(/^\.+/, '');
  // Collapse whitespace
  safe = safe.replace(/\s+/g, ' ').trim();
  // Fallback if empty
  if (!safe) safe = 'file';
  // Limit length
  if (safe.length > 200) {
    const ext = path.extname(safe);
    safe = safe.substring(0, 200 - ext.length) + ext;
  }
  return safe;
}

// ============================================================
// Removed generateShortCode in favor of deterministic atomic short codes

// ============================================================
// Utility: Get file icon category
// ============================================================

function getFileCategory(filename) {
  const ext = path.extname(filename).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'];
  const codeExts = ['.c', '.cpp', '.h', '.hpp', '.java', '.py', '.js', '.ts', '.rb', '.go', '.rs', '.cs', '.php', '.html', '.css', '.sql', '.sh', '.bash', '.r', '.m', '.swift', '.kt'];
  const docExts = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.odp', '.ods', '.txt', '.rtf', '.md'];
  const dataExts = ['.csv', '.json', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.log'];
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];

  if (imageExts.includes(ext)) return 'image';
  if (codeExts.includes(ext)) return 'code';
  if (docExts.includes(ext)) return 'document';
  if (dataExts.includes(ext)) return 'data';
  if (archiveExts.includes(ext)) return 'archive';
  return 'file';
}

// ============================================================
// Utility: Security & PIN Handling
// ============================================================

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function generatePin() {
  // 6 digit random PIN
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function verifyPin(req, res, transfer) {
  if (!transfer.pinHash) return true; // No PIN required

  if (transfer.failedPinAttempts >= 5) {
    res.status(429).json({ error: 'Too many incorrect PIN attempts. This transfer is locked.' });
    return false;
  }

  const providedPin = req.headers['x-transfer-pin'] || req.query.pin;
  if (!providedPin) {
    res.status(401).json({ error: 'PIN required', requirePin: true });
    return false;
  }

  if (hashPin(providedPin) !== transfer.pinHash) {
    transfer.failedPinAttempts++;
    res.status(401).json({ error: 'Incorrect PIN', requirePin: true });
    return false;
  }

  return true;
}

// ============================================================
// Ensure uploads directory exists
// ============================================================

if (!fs.existsSync(CONFIG.UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
}

// ============================================================
// Express app setup
// ============================================================

const compression = require('compression');

const app = express();
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy so req.ip returns the actual client IP instead of Render's load balancer IP
app.set('trust proxy', true);

// ============================================================
// State (Analytics)
// ============================================================

let analytics = {
  uniqueDevices: new Set(),
  totalTransfersCreated: 0,
  totalFilesUploaded: 0,
  totalDownloads: 0
};

let analyticsLoaded = false;

const RESET_MIGRATION_VERSION = 'v2_force_zero_2026_09_10_r1';

// Initialize analytics from DB
async function initAnalytics() {
  try {
    const stats = await storage.analytics.get();
    if (stats.resetMigration !== RESET_MIGRATION_VERSION) {
      console.log('⚡ Applying one-time analytics reset to zero...');
      analytics.totalTransfersCreated = 0;
      analytics.totalFilesUploaded = 0;
      analytics.totalDownloads = 0;
      analytics.uniqueDevices = new Set();
      analyticsLoaded = true;
      await storage.analytics.set({
        id: 'global',
        totalTransfersCreated: 0,
        totalFilesUploaded: 0,
        totalDownloads: 0,
        uniqueDevices: [],
        resetMigration: RESET_MIGRATION_VERSION
      });
      console.log('✅ Analytics reset to zero applied.');
    } else {
      analytics.totalTransfersCreated = stats.totalTransfersCreated || 0;
      analytics.totalFilesUploaded = stats.totalFilesUploaded || 0;
      analytics.totalDownloads = stats.totalDownloads || 0;
      analytics.uniqueDevices = new Set(stats.uniqueDevices || []);
      analyticsLoaded = true;
    }
  } catch (err) {
    console.error('Failed to load analytics from DB', err);
  }
}
initAnalytics();

let analyticsSaveTimeout = null;
function scheduleAnalyticsSave() {
  if (analyticsSaveTimeout) return;
  analyticsSaveTimeout = setTimeout(async () => {
    analyticsSaveTimeout = null;
    if (!analyticsLoaded) return;
    try {
      await storage.analytics.set({
        id: 'global',
        totalTransfersCreated: analytics.totalTransfersCreated,
        totalFilesUploaded: analytics.totalFilesUploaded,
        totalDownloads: analytics.totalDownloads,
        uniqueDevices: Array.from(analytics.uniqueDevices),
        resetMigration: RESET_MIGRATION_VERSION
      });
    } catch (err) {
      console.error('Failed to save analytics', err);
    }
  }, 5000); // Debounce save every 5 seconds
}

// Security & SEO Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Explicit SEO routes for robots.txt and sitemap.xml
app.get('/robots.txt', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// Dynamic site configuration from environment variables
function getSiteConfig() {
  return {
    contactEmail: process.env.CONTACT_EMAIL || process.env.SUPPORT_EMAIL || process.env.EMAIL || 'yuvaankaarthikeyaa.1206@gmail.com',
    portfolioUrl: (process.env.PORTFOLIO_URL || process.env.PORTFOLIO_LINK || process.env.PORTFOLIO || '').trim()
  };
}

app.get('/js/site-config.js', (req, res) => {
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`window.LABDROP_CONFIG = ${JSON.stringify(getSiteConfig())};`);
});

app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(getSiteConfig());
});

// Serve static files from public/ with optimized caching & compression
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Images, fonts, and icons: cache immutably for 1 year (Lighthouse Best Practice)
    if (/\.(png|jpe?g|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      // CSS & JS assets: immediate revalidation to prevent stale caching during updates
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.endsWith('.html') || filePath.endsWith('manifest.json')) {
      // HTML documents revalidate
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// ============================================================
// Multer configuration for file uploads
// ============================================================

const s3StorageConfig = multerS3({
  s3: s3Client,
  bucket: S3_BUCKET_NAME,
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key: function (req, file, cb) {
    const fileId = uuidv4();
    const sanitized = sanitizeFilename(file.originalname);
    // Prefix with transferId
    cb(null, `${req.transferId}/${fileId}__${sanitized}`);
  }
});

const upload = multer({
  storage: s3StorageConfig,
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,
    files: CONFIG.MAX_FILES_PER_TRANSFER,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error(`File type "${ext}" is not allowed for security reasons.`));
      return;
    }
    cb(null, true);
  },
});

// Middleware: set transferId for legacy server-relayed upload session
app.use((req, res, next) => {
  if (req.path === '/api/upload') {
    req.transferId = uuidv4();
  }
  next();
});

// In-memory multer storage for Web Share Target fallback (used when Service Worker is bypassed)
const shareTargetMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,
    files: CONFIG.MAX_FILES_PER_TRANSFER,
  }
});

// Temporary in-memory cache for shared files received directly by the server
const serverShareSessions = new Map();

// Periodic sweep of sessions older than 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of serverShareSessions.entries()) {
    if (session.expiresAt && session.expiresAt < now) {
      serverShareSessions.delete(id);
    }
  }
}, 60000);

// Fallback POST for Web Share Target (e.g. Android intent or iOS share sheet bypassing SW)
app.post('/share-target', (req, res) => {
  shareTargetMemoryUpload.any()(req, res, (err) => {
    if (err) {
      console.warn('[ShareTarget Server Fallback] Multer error:', err.message);
      return res.redirect(303, '/?share_error=1');
    }

    const files = req.files || [];
    const text = (req.body && req.body.text) ? String(req.body.text) : '';
    const title = (req.body && req.body.title) ? String(req.body.title) : '';
    const url = (req.body && req.body.url) ? String(req.body.url) : '';

    if (files.length === 0 && !text && !url) {
      return res.redirect(303, '/?shared=1');
    }

    const sessionId = uuidv4();
    const storedFiles = files.map(f => ({
      name: f.originalname || 'shared_file',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size,
      base64: f.buffer ? f.buffer.toString('base64') : ''
    }));

    serverShareSessions.set(sessionId, {
      files: storedFiles,
      text,
      title,
      url,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    console.log(`[ShareTarget Server Fallback] Received ${files.length} file(s), text length ${text.length}. Session: ${sessionId}`);
    res.redirect(303, `/?shared_session=${sessionId}`);
  });
});

app.get('/share-target', (req, res) => {
  res.redirect(303, '/?shared=1');
});

// Retrieve and consume shared session data (single-use)
app.get('/api/share-session/:id', (req, res) => {
  const sessionId = req.params.id;
  const session = serverShareSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Share session not found or expired' });
  }

  // Consume immediately so it cannot be re-fetched
  serverShareSessions.delete(sessionId);
  res.json({
    success: true,
    files: session.files,
    text: session.text,
    title: session.title,
    url: session.url
  });
});


// ============================================================
// API Routes
// ============================================================

// --- Analytics & Admin ---

// Baseline historical counters (merged prior counts)
const BASELINE_COUNTERS = {
  uniqueUsers: 123,
  totalTransfers: 133,
  totalFiles: 216,
  totalDownloads: 151
};

// Bot / crawler / uptime monitor detection pattern
const BOT_UA_REGEX = /uptimerobot|pingdom|betterstack|statuscake|uptime|bot|crawler|spider|slurp|headless|lighthouse|inspect|checker|python|curl|wget|axios|postman|node-fetch|go-http|java|ruby|httpclient/i;

app.post('/api/analytics/visit', express.json(), async (req, res) => {
  try {
    const userAgent = req.headers['user-agent'] || '';

    // Ignore bots, crawlers, uptime monitors, and headless clients
    if (!userAgent || BOT_UA_REGEX.test(userAgent)) {
      return res.json({ success: true, ignored: true });
    }

    // Ignore prefetch or preview requests
    if (req.headers['x-purpose'] === 'preview' || req.headers['purpose'] === 'prefetch') {
      return res.json({ success: true, ignored: true });
    }

    const { deviceId } = req.body;
    // Strictly validate legitimate client deviceId format (e.g. "v2_..." generated by dialogs.js)
    if (typeof deviceId === 'string' && /^v2_[a-z0-9]{10,40}$/i.test(deviceId)) {
      if (analyticsLoaded && !analytics.uniqueDevices.has(deviceId)) {
        analytics.uniqueDevices.add(deviceId);
        scheduleAnalyticsSave();
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// --- Admin Timeseries & Stock Analytics Helpers ---
function generateTimeseries(totalTransfers, totalFiles, totalDownloads, totalVisitors, activeTransfers) {
  const days = 90;
  const now = new Date();
  const history = [];

  let transferWeights = [];
  let fileWeights = [];
  let downloadWeights = [];
  let visitorWeights = [];

  for (let i = 0; i < days; i++) {
    const trend = 0.4 + (i / days) * 1.6; // Organic growth curve
    const cycle = 1 + 0.28 * Math.sin((i / 7) * 2 * Math.PI); // Weekly variation
    const noise = 0.82 + ((Math.sin(i * 997.1) + 1) * 0.18);
    const w = trend * cycle * noise;
    transferWeights.push(w);
    fileWeights.push(w * (0.85 + ((Math.cos(i * 433.7) + 1) * 0.3)));
    downloadWeights.push(w * (0.8 + ((Math.sin(i * 211.3) + 1) * 0.4)));
    visitorWeights.push(w * (0.9 + ((Math.cos(i * 123.5) + 1) * 0.2)));
  }

  const sumTW = transferWeights.reduce((a, b) => a + b, 0);
  const sumFW = fileWeights.reduce((a, b) => a + b, 0);
  const sumDW = downloadWeights.reduce((a, b) => a + b, 0);
  const sumVW = visitorWeights.reduce((a, b) => a + b, 0);

  let runT = 0, runF = 0, runD = 0, runV = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().split('T')[0];

    let tCount = (i === days - 1) ? Math.max(0, totalTransfers - runT) : Math.round((transferWeights[i] / sumTW) * totalTransfers);
    if (runT + tCount > totalTransfers && i < days - 1) tCount = Math.max(0, totalTransfers - runT);
    runT += tCount;

    let fCount = (i === days - 1) ? Math.max(0, totalFiles - runF) : Math.round((fileWeights[i] / sumFW) * totalFiles);
    if (runF + fCount > totalFiles && i < days - 1) fCount = Math.max(0, totalFiles - runF);
    runF += fCount;

    let dCount = (i === days - 1) ? Math.max(0, totalDownloads - runD) : Math.round((downloadWeights[i] / sumDW) * totalDownloads);
    if (runD + dCount > totalDownloads && i < days - 1) dCount = Math.max(0, totalDownloads - runD);
    runD += dCount;

    let vCount = (i === days - 1) ? Math.max(0, totalVisitors - runV) : Math.round((visitorWeights[i] / sumVW) * totalVisitors);
    if (runV + vCount > totalVisitors && i < days - 1) vCount = Math.max(0, totalVisitors - runV);
    runV += vCount;

    const dailyStorageMB = Number((fCount * (2.85 + Math.sin(i * 1.7) * 1.1)).toFixed(2));
    const activeCount = (i === days - 1)
      ? (activeTransfers ? activeTransfers.length : 0)
      : Math.max(0, Math.round(tCount * 0.45 + (Math.sin(i * 1.5) + 0.8)));

    history.push({
      date: dateStr,
      timestamp: d.getTime(),
      dailyTransfers: tCount,
      cumulativeTransfers: runT,
      dailyFiles: fCount,
      cumulativeFiles: runF,
      dailyDownloads: dCount,
      cumulativeDownloads: runD,
      dailyVisitors: vCount,
      cumulativeVisitors: runV,
      activeTransfers: activeCount,
      storageMB: dailyStorageMB,
      cumulativeStorageMB: Number((runF * 3.1).toFixed(2))
    });
  }

  return history;
}

function generateIntraday(todayData, currentActiveCount) {
  const hours = [];
  const now = new Date();
  const currentHour = now.getHours();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);

  const totalTodayTransfers = todayData ? todayData.dailyTransfers : 2;
  const totalTodayFiles = todayData ? todayData.dailyFiles : 3;
  const totalTodayDownloads = todayData ? todayData.dailyDownloads : 5;
  const totalTodayVisitors = todayData ? todayData.dailyVisitors : 35;

  let cumT = 0, cumF = 0, cumD = 0, cumV = 0;

  for (let h = 0; h < 24; h++) {
    const timestamp = todayStart + (h * 3600 * 1000);
    let weight = 0.02;
    if (h >= 8 && h <= 22) {
      weight = 0.045 + 0.04 * Math.sin(((h - 8) / 14) * Math.PI);
    }
    const isPastOrCurrent = h <= currentHour;
    let tCount = isPastOrCurrent ? Math.max(0, Math.round(weight * totalTodayTransfers * 1.35)) : 0;
    let fCount = isPastOrCurrent ? Math.max(0, Math.round(weight * totalTodayFiles * 1.35)) : 0;
    let dCount = isPastOrCurrent ? Math.max(0, Math.round(weight * totalTodayDownloads * 1.35)) : 0;
    let vCount = isPastOrCurrent ? Math.max(0, Math.round(weight * totalTodayVisitors * 1.35)) : 0;

    cumT += tCount;
    cumF += fCount;
    cumD += dCount;
    cumV += vCount;

    hours.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      timestamp,
      transfers: tCount,
      cumulativeTransfers: cumT,
      files: fCount,
      cumulativeFiles: cumF,
      downloads: dCount,
      cumulativeDownloads: cumD,
      visitors: vCount,
      cumulativeVisitors: cumV,
      activeTransfers: (h === currentHour) ? currentActiveCount : Math.max(0, Math.round(tCount * 0.7))
    });
  }
  return hours;
}

// Serve the Admin Dashboard (supports /admin, /admin/stats, and ?pass=...)
app.get(['/admin', '/admin/stats'], (req, res) => {
  if (req.query.format === 'legacy') {
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (req.query.pass !== adminPass) {
      return res.status(403).send('Forbidden');
    }
    return res.send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f1117;color:#fff;padding:2rem;">
      <h2>LabDrop Admin Stats</h2>
      <p>Transfers: ${(analyticsLoaded ? analytics.totalTransfersCreated : 0) + (BASELINE_COUNTERS.totalTransfers || 0)}</p>
      <p>Files: ${(analyticsLoaded ? analytics.totalFilesUploaded : 0) + (BASELINE_COUNTERS.totalFiles || 0)}</p>
      <p>Downloads: ${(analyticsLoaded ? analytics.totalDownloads : 0) + (BASELINE_COUNTERS.totalDownloads || 0)}</p>
      <p>Users: ${(analyticsLoaded ? analytics.uniqueDevices.size : 0) + (BASELINE_COUNTERS.uniqueUsers || 0)}</p>
      <p><a href="/admin?pass=${req.query.pass}" style="color:#FFD166;">Open Interactive Dashboard</a></p>
      </body></html>
    `);
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin Data API for the interactive dashboard
app.get('/api/admin/dashboard-data', async (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminKey = process.env.ADMIN_KEY || 'admin';
  const providedKey = req.query.pass || req.headers['x-admin-key'] || req.query.key;

  if (providedKey !== adminPass && providedKey !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin passkey.' });
  }

  try {
    const stats = await storage.analytics.get();
    const allTransfers = await storage.transfers.getAll();
    const now = Date.now();
    const activeTransfers = allTransfers.filter(t => now < t.expiresAt && t.status !== 'EXPIRED');
    const activeFilesCount = activeTransfers.reduce((acc, t) => acc + (t.files ? t.files.length : 0), 0);
    const activeStorageBytes = activeTransfers.reduce((acc, t) => acc + (t.totalSize || 0), 0);

    const baseUnique = BASELINE_COUNTERS.uniqueUsers || 123;
    const baseTransfers = BASELINE_COUNTERS.totalTransfers || 133;
    const baseFiles = BASELINE_COUNTERS.totalFiles || 216;
    const baseDownloads = BASELINE_COUNTERS.totalDownloads || 151;

    const totalUnique = (analyticsLoaded ? analytics.uniqueDevices.size : ((stats.uniqueDevices || []).length)) + baseUnique;
    const totalTransfers = (analyticsLoaded ? analytics.totalTransfersCreated : (stats.totalTransfersCreated || 0)) + baseTransfers;
    const totalFiles = (analyticsLoaded ? analytics.totalFilesUploaded : (stats.totalFilesUploaded || 0)) + baseFiles;
    const totalDownloads = (analyticsLoaded ? analytics.totalDownloads : (stats.totalDownloads || 0)) + baseDownloads;

    // Estimate cumulative storage transferred based on historical average file size (~3.25 MB per file)
    const cumulativeStorageMB = Number(((totalFiles * 3.25) + (activeStorageBytes / (1024 * 1024))).toFixed(2));

    // Active transfers list sanitized for admin viewing
    const activeTransfersList = activeTransfers.map(t => ({
      id: t.id,
      shortCode: t.shortCode,
      name: t.transferName || (t.files && t.files[0] ? t.files[0].originalName : 'Untitled Transfer'),
      filesCount: (t.files || []).length,
      linksCount: (t.links || []).length,
      totalSize: t.totalSize || 0,
      downloadCount: t.downloadCount || 0,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      timeLeftMs: Math.max(0, t.expiresAt - now),
      isSavedForLater: !!t.isSavedForLater,
      filesSummary: (t.files || []).slice(0, 3).map(f => ({
        name: f.originalName,
        size: f.size,
        category: f.category
      }))
    })).sort((a, b) => b.createdAt - a.createdAt);

    // Generate timeseries history for last 90 days
    const timeseries = generateTimeseries(totalTransfers, totalFiles, totalDownloads, totalUnique, activeTransfers);

    // Generate today's intraday hourly timeline (24 hours)
    const intraday = generateIntraday(timeseries[timeseries.length - 1], activeTransfers.length);

    // Calculate 24h & 7d changes / trend metrics
    const lastDay = timeseries[timeseries.length - 1] || {};
    const prevDay = timeseries[timeseries.length - 2] || {};
    const weekAgoDay = timeseries[Math.max(0, timeseries.length - 8)] || {};

    const trends = {
      transfers: {
        today: lastDay.dailyTransfers || 0,
        yesterday: prevDay.dailyTransfers || 0,
        change24h: (lastDay.dailyTransfers || 0) - (prevDay.dailyTransfers || 0),
        pct24h: prevDay.dailyTransfers ? Number(((((lastDay.dailyTransfers - prevDay.dailyTransfers) / prevDay.dailyTransfers) * 100)).toFixed(1)) : 0,
        growth7d: Number((((lastDay.cumulativeTransfers - weekAgoDay.cumulativeTransfers) / Math.max(1, weekAgoDay.cumulativeTransfers)) * 100).toFixed(1))
      },
      files: {
        today: lastDay.dailyFiles || 0,
        yesterday: prevDay.dailyFiles || 0,
        change24h: (lastDay.dailyFiles || 0) - (prevDay.dailyFiles || 0),
        pct24h: prevDay.dailyFiles ? Number(((((lastDay.dailyFiles - prevDay.dailyFiles) / prevDay.dailyFiles) * 100)).toFixed(1)) : 0,
        growth7d: Number((((lastDay.cumulativeFiles - weekAgoDay.cumulativeFiles) / Math.max(1, weekAgoDay.cumulativeFiles)) * 100).toFixed(1))
      },
      downloads: {
        today: lastDay.dailyDownloads || 0,
        yesterday: prevDay.dailyDownloads || 0,
        change24h: (lastDay.dailyDownloads || 0) - (prevDay.dailyDownloads || 0),
        pct24h: prevDay.dailyDownloads ? Number(((((lastDay.dailyDownloads - prevDay.dailyDownloads) / prevDay.dailyDownloads) * 100)).toFixed(1)) : 0,
        growth7d: Number((((lastDay.cumulativeDownloads - weekAgoDay.cumulativeDownloads) / Math.max(1, weekAgoDay.cumulativeDownloads)) * 100).toFixed(1))
      },
      visitors: {
        today: lastDay.dailyVisitors || 0,
        yesterday: prevDay.dailyVisitors || 0,
        change24h: (lastDay.dailyVisitors || 0) - (prevDay.dailyVisitors || 0),
        pct24h: prevDay.dailyVisitors ? Number(((((lastDay.dailyVisitors - prevDay.dailyVisitors) / prevDay.dailyVisitors) * 100)).toFixed(1)) : 0,
        growth7d: Number((((lastDay.cumulativeVisitors - weekAgoDay.cumulativeVisitors) / Math.max(1, weekAgoDay.cumulativeVisitors)) * 100).toFixed(1))
      }
    };

    // System stats
    const mem = process.memoryUsage();
    const system = {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memoryRssMB: Math.round(mem.rss / 1024 / 1024),
      memoryHeapMB: Math.round(mem.heapUsed / 1024 / 1024),
      mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      activeSockets: (typeof io !== 'undefined' && io && io.engine) ? io.engine.clientsCount : 0
    };

    res.json({
      success: true,
      timestamp: now,
      totals: {
        transfers: totalTransfers,
        files: totalFiles,
        downloads: totalDownloads,
        visitors: totalUnique,
        activeTransfers: activeTransfers.length,
        activeFiles: activeFilesCount,
        activeStorageBytes,
        cumulativeStorageMB
      },
      trends,
      timeseries,
      intraday,
      activeTransfers: activeTransfersList,
      system
    });
  } catch (err) {
    console.error('[Admin Dashboard Error]:', err);
    res.status(500).json({ error: 'Failed to load admin metrics: ' + err.message });
  }
});

// --- Authentication ---

function correctEmailTypos(email) {
  let [localPart, domain] = email.split('@');
  if (!domain) return email;
  
  // Safely auto-correct common typos for major providers
  const gmailTypos = ['gmai.com', 'gamil.com', 'gmail.co', 'gmail.coom', 'gmai.coom', 'gamil.coom', 'gmail.con', 'gmial.com', 'gmaill.com', 'gmal.com', 'gma.com'];
  if (gmailTypos.includes(domain)) domain = 'gmail.com';
  
  const yahooTypos = ['yaho.com', 'yahoo.co', 'yahoo.con', 'yaho.co'];
  if (yahooTypos.includes(domain)) domain = 'yahoo.com';

  const hotmailTypos = ['hotmai.com', 'hotmal.com', 'hotmail.co', 'hotmail.con'];
  if (hotmailTypos.includes(domain)) domain = 'hotmail.com';
  
  // Note: we purposefully do NOT auto-correct "mail.com" because it is a legitimate email provider.

  return `${localPart}@${domain}`;
}


// Middleware to get user from token (optional auth)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Invalid token, ignore
    }
  }
  next();
}

app.post('/api/register', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (email) {
      email = email.trim().toLowerCase();
      email = correctEmailTypos(email);
    }
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and a password of at least 6 characters required.' });
    }
    
    // Basic email validation
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (await storage.users.findOne({ email })) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await storage.users.insert({
      id: uuidv4(),
      email,
      passwordHash: hashedPassword,
      createdAt: Date.now()
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (email) {
      email = email.trim().toLowerCase();
      email = correctEmailTypos(email);
    }
    const user = await storage.users.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

// --- User's Saved Transfers ---
app.get('/api/my-transfers', optionalAuth, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const userTransfers = (await storage.transfers.find({ userId: req.user.userId }))
    .map(t => ({
      id: t.id,
      shortCode: t.shortCode,
      transferName: t.transferName,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      fileCount: t.files.length,
      totalSize: t.totalSize,
      requirePin: !!t.pinHash
    }))
    .sort((a, b) => b.createdAt - a.createdAt); // newest first

  res.json({ transfers: userTransfers });
});

// ============================================================
// Direct-to-S3 Presigned Upload API (10,000+ Concurrent Capacity)
// ============================================================

// --- 1. Initiate Direct-to-S3 Presigned Upload ---
app.post('/api/upload/initiate', optionalAuth, async (req, res) => {
  try {
    const rawFiles = Array.isArray(req.body.files) ? req.body.files : [];
    let links = [];
    if (Array.isArray(req.body.links)) {
      links = req.body.links
        .filter(link => typeof link === 'string' && link.trim() !== '')
        .slice(0, 50)
        .map(link => link.substring(0, 2000000));
    }

    if (rawFiles.length === 0 && links.length === 0) {
      return res.status(400).json({ error: 'No files or links selected.' });
    }

    if (rawFiles.length > CONFIG.MAX_FILES_PER_TRANSFER) {
      return res.status(400).json({
        error: `Too many files. Maximum is ${CONFIG.MAX_FILES_PER_TRANSFER} files per transfer.`
      });
    }

    // Validate blocked extensions and individual file sizes
    let totalSize = 0;
    for (const f of rawFiles) {
      if (!f || typeof f.name !== 'string') {
        return res.status(400).json({ error: 'Invalid file payload.' });
      }
      const ext = path.extname(f.name).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: `File type "${ext}" is not allowed for security reasons.` });
      }
      const size = Number(f.size) || 0;
      if (size > CONFIG.MAX_FILE_SIZE) {
        return res.status(413).json({
          error: `File "${f.name}" is too large. Maximum size is ${Math.round(CONFIG.MAX_FILE_SIZE / (1024 * 1024))}MB per file.`
        });
      }
      totalSize += size;
    }

    if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
      return res.status(413).json({
        error: `Total size exceeds the ${Math.round(CONFIG.MAX_TOTAL_SIZE / (1024 * 1024))}MB limit.`
      });
    }

    const transferId = uuidv4();
    const now = Date.now();
    const d = new Date(now);
    const daysSinceEpoch = Math.floor(now / (1000 * 60 * 60 * 24));
    const dayCycle = (daysSinceEpoch % 9) + 1; // 1 to 9
    
    const startOfDay = new Date(d).setHours(0,0,0,0);
    const secondsOfDay = Math.floor((now - startOfDay) / 1000);
    const timeBlock = Math.floor(secondsOfDay / 900);
    
    const timeBlockId = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-block-${timeBlock}`;
    const sequence = await storage.transfers.getNextSequence(timeBlockId);
    const shortCode = `${dayCycle}${timeBlock}${sequence}`;

    let expiresAt = now + CONFIG.TRANSFER_EXPIRY_MINUTES * 60 * 1000;
    let isSavedForLater = false;
    let userId = null;

    if (req.user && req.body.saveForLater === true) {
      expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days
      isSavedForLater = true;
      userId = req.user.userId;
    }

    const transferName = req.body.transferName ? String(req.body.transferName).trim().substring(0, 50) : null;
    let pin = null;
    let pinHash = null;

    if (req.body.requirePin === true) {
      if (req.body.customPin && req.body.customPin.length === 6 && /^\d+$/.test(req.body.customPin)) {
        pin = req.body.customPin;
      } else {
        pin = generatePin();
      }
      pinHash = hashPin(pin);
    }

    let folderStructure = {};
    if (req.body.folderStructure && typeof req.body.folderStructure === 'object') {
      for (const [k, v] of Object.entries(req.body.folderStructure)) {
        if (typeof k === 'string' && typeof v === 'string') {
          folderStructure[k.substring(0, 1000)] = v.substring(0, 100);
        }
      }
    }

    // Generate S3 presigned PUT URLs for each file
    const files = [];
    const presignedFiles = [];

    for (const f of rawFiles) {
      const fileId = uuidv4();
      const sanitized = sanitizeFilename(f.name);
      const storageName = `${fileId}__${sanitized}`;
      const s3Key = `${transferId}/${storageName}`;
      const contentType = f.type || 'application/octet-stream';

      const putCommand = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 }); // 15 mins

      files.push({
        id: fileId,
        originalName: sanitized,
        storageName,
        size: Number(f.size) || 0,
        mimetype: contentType,
        category: getFileCategory(sanitized),
      });

      presignedFiles.push({
        id: fileId,
        name: sanitized,
        storageName,
        uploadUrl,
        type: contentType,
        size: Number(f.size) || 0
      });
    }

    const isPending = files.length > 0;
    const initialStatus = isPending ? 'PENDING' : 'ACTIVE';

    const transfer = {
      id: transferId,
      shortCode,
      transferName,
      pinHash,
      failedPinAttempts: 0,
      files,
      links,
      folderStructure,
      createdAt: now,
      expiresAt,
      totalSize,
      downloadCount: 0,
      isSavedForLater,
      userId,
      status: initialStatus
    };

    await storage.transfers.set(transferId, transfer);

    // If there are no files (links only), activate immediately and return QR code
    if (!isPending) {
      analytics.totalTransfersCreated++;
      scheduleAnalyticsSave();

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      let baseUrl = `${protocol}://${host}`;
      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        const localIP = getLocalIPv4();
        if (localIP) baseUrl = `http://${localIP}:${CONFIG.PORT}`;
      } else {
        baseUrl = process.env.PUBLIC_URL || 'https://labdrop.online';
      }
      const transferUrl = `${baseUrl}/t/${transferId}`;

      const qrDataUrl = await QRCode.toDataURL(transferUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });

      return res.json({
        isComplete: true,
        transferId,
        shortCode,
        transferName: transfer.transferName,
        url: transferUrl,
        qrCode: qrDataUrl,
        files: [],
        links,
        totalSize: 0,
        fileCount: 0,
        linkCount: links.length,
        expiresAt,
        expiryMinutes: CONFIG.TRANSFER_EXPIRY_MINUTES,
        pin,
        folderStructure
      });
    }

    res.json({
      isComplete: false,
      transferId,
      shortCode,
      files: presignedFiles,
      pin,
      expiresAt
    });
  } catch (err) {
    console.error('[Upload Initiate Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate transfer.' });
  }
});

// --- 2. Complete Direct-to-S3 Presigned Upload ---
app.post('/api/upload/complete', optionalAuth, async (req, res) => {
  try {
    const { transferId, pin } = req.body;
    if (!transferId) {
      return res.status(400).json({ error: 'Missing transferId.' });
    }

    const transfer = await storage.transfers.get(transferId);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found or expired.' });
    }

    // Verify files in S3 and update actual sizes if available
    for (const f of transfer.files) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: `${transfer.id}/${f.storageName}`
        }));
        if (head.ContentLength) {
          f.size = head.ContentLength;
        }
      } catch (err) {
        console.warn(`[Upload Complete] Note: Could not head-check ${f.storageName}:`, err.message);
      }
    }

    transfer.status = 'ACTIVE';
    transfer.totalSize = transfer.files.reduce((sum, f) => sum + (f.size || 0), 0);
    await storage.transfers.set(transfer.id, transfer);

    // Update analytics
    analytics.totalTransfersCreated++;
    analytics.totalFilesUploaded += transfer.files.length;
    scheduleAnalyticsSave();

    // Generate QR code
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    let baseUrl = `${protocol}://${host}`;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const localIP = getLocalIPv4();
      if (localIP) baseUrl = `http://${localIP}:${CONFIG.PORT}`;
    } else {
      baseUrl = process.env.PUBLIC_URL || 'https://labdrop.online';
    }
    const transferUrl = `${baseUrl}/t/${transfer.id}`;

    const qrDataUrl = await QRCode.toDataURL(transferUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    res.json({
      transferId: transfer.id,
      shortCode: transfer.shortCode,
      transferName: transfer.transferName,
      url: transferUrl,
      qrCode: qrDataUrl,
      files: transfer.files.map((f) => ({
        id: f.id,
        name: f.originalName,
        size: f.size,
        category: f.category,
      })),
      links: transfer.links || [],
      totalSize: transfer.totalSize,
      fileCount: transfer.files.length,
      linkCount: transfer.links ? transfer.links.length : 0,
      expiresAt: transfer.expiresAt,
      expiryMinutes: CONFIG.TRANSFER_EXPIRY_MINUTES,
      pin: pin || null,
      folderStructure: transfer.folderStructure || {}
    });
  } catch (err) {
    console.error('[Upload Complete Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to complete transfer.' });
  }
});

// --- Legacy Server-Relayed Upload (Fallback) ---
app.post('/api/upload', optionalAuth, (req, res) => {
  const uploadHandler = upload.array('files', CONFIG.MAX_FILES_PER_TRANSFER);

  uploadHandler(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: `File too large. Maximum size is ${Math.round(CONFIG.MAX_FILE_SIZE / (1024 * 1024))}MB per file.`,
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: `Too many files. Maximum is ${CONFIG.MAX_FILES_PER_TRANSFER} files per transfer.`,
          });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    let links = [];
    if (req.body.links) {
      try {
        const parsedLinks = JSON.parse(req.body.links);
        if (Array.isArray(parsedLinks)) {
          links = parsedLinks
            .filter(link => typeof link === 'string' && link.trim() !== '')
            .slice(0, 50)
            .map(link => link.substring(0, 2000000));
        }
      } catch (e) {
        console.warn('Failed to parse links from request:', req.body.links);
      }
    }

    if ((!req.files || req.files.length === 0) && links.length === 0) {
      return res.status(400).json({ error: 'No files or links selected.' });
    }

    const transferId = req.transferId;
    
    const now = Date.now();
    const d = new Date(now);
    const daysSinceEpoch = Math.floor(now / (1000 * 60 * 60 * 24));
    const dayCycle = (daysSinceEpoch % 9) + 1; // 1 to 9
    
    const startOfDay = new Date(d).setHours(0,0,0,0);
    const secondsOfDay = Math.floor((now - startOfDay) / 1000);
    const timeBlock = Math.floor(secondsOfDay / 900);
    
    // timeBlockId uses full date so the sequence resets to 1 every day for that time block
    const timeBlockId = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-block-${timeBlock}`;
    const sequence = await storage.transfers.getNextSequence(timeBlockId);
    const shortCode = `${dayCycle}${timeBlock}${sequence}`;

    let expiresAt = now + CONFIG.TRANSFER_EXPIRY_MINUTES * 60 * 1000;
    
    let isSavedForLater = false;
    let userId = null;

    if (req.user && req.body.saveForLater === 'true') {
      expiresAt = now + (7 * 24 * 60 * 60 * 1000); // exactly 7 days
      isSavedForLater = true;
      userId = req.user.userId;
    }

    const files = await Promise.all(req.files.map(async (f) => {
      // multer-s3 puts the final path in f.key: transferId/fileId__sanitized
      const keyParts = f.key.split('/');
      const filename = keyParts[keyParts.length - 1]; // fileId__sanitized
      const parts = filename.split('__');
      const fileId = parts[0];
      const sanitized = parts.slice(1).join('__');
      
      let size = f.size;
      if (size === undefined || size === 0) {
        try {
          const headData = await s3Client.send(new HeadObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: f.key
          }));
          size = headData.ContentLength || 0;
        } catch (err) {
          console.error(`Failed to fetch file size for ${f.key}:`, err);
          size = 0;
        }
      }

      return {
        id: fileId,
        originalName: sanitized,
        storageName: filename,
        size: size,
        mimetype: f.mimetype,
        category: getFileCategory(sanitized),
      };
    }));

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Enforce total transfer size limit
    if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
      return res.status(413).json({ error: `Total size exceeds the ${Math.round(CONFIG.MAX_TOTAL_SIZE / (1024*1024))}MB limit.` });
    }

    const transferName = req.body.transferName ? req.body.transferName.trim().substring(0, 50) : null;
    let pin = null;
    let pinHash = null;

    if (req.body.requirePin === 'true') {
      if (req.body.customPin && req.body.customPin.length === 6) {
        pin = req.body.customPin;
      } else {
        pin = generatePin();
      }
      pinHash = hashPin(pin);
    }
    

    let folderStructure = {};
    if (req.body.folderStructure) {
      try {
        const parsedFS = JSON.parse(req.body.folderStructure);
        if (typeof parsedFS === 'object' && parsedFS !== null) {
          // Limit keys and values to reasonable string lengths for safety
          for (const [k, v] of Object.entries(parsedFS)) {
            if (typeof k === 'string' && typeof v === 'string') {
              folderStructure[k.substring(0, 1000)] = v.substring(0, 100);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse folderStructure from request:', req.body.folderStructure);
      }
    }

    const transfer = {
      id: transferId,
      shortCode,
      transferName,
      pinHash,
      failedPinAttempts: 0,
      files,
      links,
      folderStructure,
      createdAt: now,
      expiresAt,
      totalSize,
      downloadCount: 0,
      isSavedForLater,
      userId
    };

    await storage.transfers.set(transferId, transfer);
    
    // Update analytics
    analytics.totalTransfersCreated++;
    analytics.totalFilesUploaded += files.length;
    scheduleAnalyticsSave();

    // Generate QR code
    // Use PUBLIC_URL env var if set, otherwise infer from the request host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    let baseUrl = `${protocol}://${host}`;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const localIP = getLocalIPv4();
      if (localIP) baseUrl = `http://${localIP}:${CONFIG.PORT}`;
    } else {
      baseUrl = process.env.PUBLIC_URL || 'https://labdrop.online';
    }
    const transferUrl = `${baseUrl}/t/${transferId}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(transferUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });

      res.json({
        transferId,
        shortCode,
        transferName: transfer.transferName,
        url: transferUrl,
        qrCode: qrDataUrl,
        files: files.map((f) => ({
          id: f.id,
          name: f.originalName,
          size: f.size,
          category: f.category,
        })),
        links,
        totalSize,
        fileCount: files.length,
        linkCount: links.length,
        expiresAt,
        expiryMinutes: CONFIG.TRANSFER_EXPIRY_MINUTES,
        pin: pin // Send PIN back once so desktop UI can display it
      });
    } catch (qrErr) {
      console.error('QR code generation failed:', qrErr);
      res.status(500).json({ error: 'Failed to generate QR code.' });
    }
  });
});

// --- Get transfer details (used by mobile page) ---
app.get('/api/transfer/:id', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found or has expired.' });
  }

  if (transfer.status === 'PENDING') {
    return res.status(409).json({ error: 'Transfer upload in progress. Please wait.' });
  }

  if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
    return res.status(410).json({ error: 'This transfer has expired.' });
  }

  if (!verifyPin(req, res, transfer)) return;

  res.json({
    id: transfer.id,
    shortCode: transfer.shortCode,
    transferName: transfer.transferName,
    requirePin: !!transfer.pinHash,
    files: transfer.files.map((f) => ({
      id: f.id,
      name: f.originalName,
      originalName: f.originalName,
      customName: f.customName || f.originalName,
      size: f.size,
      category: f.category,
      mimeType: f.mimeType,
    })),
    links: transfer.links || [],
    folderStructure: transfer.folderStructure || {},
    totalSize: transfer.totalSize,
    fileCount: transfer.files.length,
    linkCount: (transfer.links || []).length,
    createdAt: transfer.createdAt,
    expiresAt: transfer.expiresAt,
  });
});

// --- Download all files as ZIP ---
// NOTE: This route MUST be defined before /download/:transferId/:fileId
// otherwise Express will match "zip" as a :fileId parameter.
app.get('/download/:transferId/zip', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.transferId);

  if (!transfer) {
    if (req.accepts('html')) return res.status(404).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(404).json({ error: 'Transfer not found or has expired.' });
  }

  if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
    if (req.accepts('html')) return res.status(410).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(410).json({ error: 'This transfer has expired.' });
  }

  if (!verifyPin(req, res, transfer)) return;

  const fsMap = transfer.folderStructure || {};

  let filesToZip = transfer.files || [];
  if (req.query.files) {
    const selectedIds = new Set(req.query.files.split(','));
    filesToZip = (transfer.files || []).filter(f => selectedIds.has(f.id));
  }

  if (!filesToZip || filesToZip.length === 0) {
    return res.status(400).json({ error: 'No files to download in this transfer.' });
  }

  // Determine ZIP filename (query param > transferName > shortCode)
  let baseName = req.query.name ? req.query.name : (transfer.transferName || transfer.shortCode);
  baseName = sanitizeFilename(baseName);
  if (baseName.toLowerCase().endsWith('.zip')) {
    baseName = baseName.slice(0, -4);
  }
  const zipFilename = `LabDrop-${baseName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 5 } });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Archiver warning:', err);
    } else {
      console.error('Archiver warning:', err);
    }
  });

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP archive.' });
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      archive.abort();
    }
  });

  archive.pipe(res);

  const usedEntryNames = new Set();

  for (const file of filesToZip) {
    const s3Key = `${transfer.id}/${file.storageName}`;
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    });

    try {
      const response = await s3Client.send(command);
      const folderName = fsMap[file.originalName];
      let entryName = file.originalName;
      if (folderName) {
         // Prevent directory traversal attacks in the ZIP structure itself
         const safeFolder = folderName.replace(/^(\.\.(\/|\\|$))+/, '');
         entryName = path.join(safeFolder, file.originalName).replace(/\\/g, '/');
      }

      // Handle duplicate entry names inside zip
      let finalEntryName = entryName;
      let counter = 1;
      const parsedPath = path.posix.parse(entryName);
      while (usedEntryNames.has(finalEntryName.toLowerCase())) {
        finalEntryName = path.posix.join(
          parsedPath.dir,
          `${parsedPath.name} (${counter})${parsedPath.ext}`
        );
        counter++;
      }
      usedEntryNames.add(finalEntryName.toLowerCase());

      archive.append(response.Body, { name: finalEntryName });
    } catch (err) {
      console.error(`Failed to fetch file from S3 for ZIP: ${s3Key}`, err);
    }
  }

  transfer.downloadCount = (transfer.downloadCount || 0) + 1;
  await storage.transfers.set(transfer.id, transfer);
  analytics.totalDownloads++;
  scheduleAnalyticsSave();
  archive.finalize();
});

// --- Download a single file ---
app.get('/download/:transferId/:fileId', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.transferId);

  if (!transfer) {
    if (req.accepts('html')) return res.status(404).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(404).json({ error: 'Transfer not found or has expired.' });
  }

  if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
    if (req.accepts('html')) return res.status(410).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(410).json({ error: 'This transfer has expired.' });
  }

  if (!verifyPin(req, res, transfer)) return;

  const file = transfer.files.find((f) => f.id === req.params.fileId);

  if (!file) {
    if (req.accepts('html')) return res.status(404).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(404).json({ error: 'File not found.' });
  }

  const s3Key = `${transfer.id}/${file.storageName}`;
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  });

  try {
    const response = await s3Client.send(command);
    
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    let downloadFilename = req.query.name ? String(req.query.name) : file.originalName;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    if (file.size) {
      res.setHeader('Content-Length', file.size);
    }
    
    response.Body.pipe(res);
    
    transfer.downloadCount++;
    await storage.transfers.set(transfer.id, transfer);
    analytics.totalDownloads++;
    scheduleAnalyticsSave();
  } catch (err) {
    console.error('S3 Download Error:', err);
    return res.status(500).json({ error: 'Download failed.' });
  }
});

// --- Look up a transfer by short code ---
app.get('/api/transfer/code/:code', async (req, res) => {
  const shortCode = req.params.code.toUpperCase();
  for (const transfer of await storage.transfers.getAll()) {
    if (transfer.shortCode === shortCode) {
      if (transfer.status === 'PENDING') {
        return res.status(409).json({ error: 'Transfer upload in progress. Please wait.' });
      }
      if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
        return res.status(410).json({ error: 'Transfer has expired.' });
      }
      return res.json({ id: transfer.id });
    }
  }
  res.status(404).json({ error: 'Transfer not found.' });
});

// --- Secret Admin Stats Route ---
app.get('/stats', async (req, res) => {
  const adminKey = process.env.ADMIN_KEY || 'admin';
  
  if (req.query.key !== adminKey) {
    return res.status(403).send('Forbidden: Invalid admin key.');
  }

  const allTransfers = await storage.transfers.getAll();
  const activeTransfers = allTransfers.filter(t => Date.now() < t.expiresAt && t.status !== 'EXPIRED');

  const baseUnique = BASELINE_COUNTERS.uniqueUsers || 123;
  const baseTransfers = BASELINE_COUNTERS.totalTransfers || 133;
  const baseFiles = BASELINE_COUNTERS.totalFiles || 216;
  const baseDownloads = BASELINE_COUNTERS.totalDownloads || 151;

  const mergedUnique = analytics.uniqueDevices.size + baseUnique;
  const mergedTransfers = analytics.totalTransfersCreated + baseTransfers;
  const mergedFiles = analytics.totalFilesUploaded + baseFiles;
  const mergedDownloads = analytics.totalDownloads + baseDownloads;

  res.json({
    activeTransfersInServer: activeTransfers.length,
    totalUniqueVisitors: mergedUnique,
    totalTransfersCreated: mergedTransfers,
    totalFilesUploaded: mergedFiles,
    totalDownloads: mergedDownloads,
    baselineCounters: BASELINE_COUNTERS,
    serverUptimeMinutes: Math.round(process.uptime() / 60)
  });
});

// --- Cancel/delete a transfer (from desktop UI) ---
app.get('/api/transfer/:id', optionalAuth, (req, res, next) => {
  if (req.method === 'DELETE') return next();
  // ... this is handled by the earlier route anyway, let's keep it safe.
  next();
});

app.delete('/api/transfer/:id', optionalAuth, async (req, res) => {
  const transfer = await storage.transfers.get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found.' });
  }

  // Security check: If it's saved for later, only the owner can delete it
  if (transfer.isSavedForLater && (!req.user || transfer.userId !== req.user.userId)) {
    return res.status(403).json({ error: 'Unauthorized to delete this transfer.' });
  }

  transfer.expiresAt = Date.now() - 1000;
  transfer.status = 'EXPIRED';
  await storage.transfers.set(transfer.id, transfer);
  
  res.json({ success: true, message: 'Transfer cancelled and files will be deleted shortly.' });
});

// --- Extend transfer expiry ---
app.post('/api/transfer/:id/extend', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found.' });
  }
  
  if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
    return res.status(410).json({ error: 'Transfer already expired.' });
  }

  if (transfer.isSavedForLater) {
    return res.status(400).json({ error: 'Saved for later transfers cannot be extended.' });
  }

  const ADD_MS = 15 * 60 * 1000;
  transfer.expiresAt += ADD_MS;

  // Max cap (e.g. 2 hours from now) to prevent infinite extensions
  const MAX_EXPIRY = Date.now() + (2 * 60 * 60 * 1000);
  if (transfer.expiresAt > MAX_EXPIRY) {
    transfer.expiresAt = MAX_EXPIRY;
  }

  await storage.transfers.set(transfer.id, transfer); // Update storage

  res.json({ success: true, expiresAt: transfer.expiresAt });
});

// Helper: fetch file text and binary payload (for PDF and image diagrams) from S3
async function fetchFilePayloadFromS3(transferId, storageName, maxBytes = 15 * 1024 * 1024, originalName = '') {
  const s3Key = `${transferId}/${storageName}`;
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  });

  const response = await s3Client.send(command);
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of response.Body) {
    chunks.push(chunk);
    totalBytes += chunk.length;
    if (totalBytes >= maxBytes) break;
  }

  const rawBuffer = Buffer.concat(chunks);
  const combinedName = `${originalName || ''} ${storageName || ''}`.toLowerCase();
  const isPdf = combinedName.includes('.pdf') || (rawBuffer.length >= 4 && rawBuffer.slice(0, 4).toString() === '%PDF');
  const isImage = /\.(png|jpe?g|webp|gif|bmp)$/i.test(combinedName);
  const isDocx = combinedName.includes('.docx') || combinedName.includes('.doc') || 
                (rawBuffer.length >= 4 && rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4B && rawBuffer[2] === 0x03 && rawBuffer[3] === 0x04 && !combinedName.includes('.zip'));

  let extractedText = '';

  // 1. PDF Document extraction
  if (isPdf) {
    try {
      const pdfLib = require('pdf-parse');
      if (typeof pdfLib === 'function') {
        const pdfData = await pdfLib(rawBuffer);
        extractedText = pdfData?.text || '';
      } else if (pdfLib.PDFParse) {
        const parser = new pdfLib.PDFParse({ data: rawBuffer });
        try {
          const res = await parser.getText();
          extractedText = res?.text || (typeof res === 'string' ? res : '');
        } finally {
          await parser.destroy();
        }
      }
    } catch (pdfErr) {
      console.warn(`[fetchFilePayloadFromS3] PDF parse warning for ${originalName || storageName}:`, pdfErr.message);
    }

    return {
      text: extractedText.trim(),
      isPdf: true,
      pdfBase64: rawBuffer.length <= 15 * 1024 * 1024 ? rawBuffer.toString('base64') : null,
      mimeType: 'application/pdf'
    };
  }

  // 2. Image files (diagrams, flowcharts, architectures)
  if (isImage) {
    let imgMime = 'image/png';
    if (combinedName.includes('.jpg') || combinedName.includes('.jpeg')) imgMime = 'image/jpeg';
    else if (combinedName.includes('.webp')) imgMime = 'image/webp';

    return {
      text: '',
      isImage: true,
      imageBase64: rawBuffer.length <= 10 * 1024 * 1024 ? rawBuffer.toString('base64') : null,
      mimeType: imgMime
    };
  }

  // 3. Word Document (.docx / .doc) extraction
  if (isDocx) {
    try {
      const mammoth = require('mammoth');
      const docxResult = await mammoth.extractRawText({ buffer: rawBuffer });
      if (docxResult && docxResult.value) {
        extractedText = docxResult.value.trim();
      }
    } catch (docxErr) {
      console.warn(`[fetchFilePayloadFromS3] DOCX parse warning for ${originalName || storageName}:`, docxErr.message);
    }
    return { text: extractedText, isDocx: true };
  }

  // 4. Plain text / code fallback
  extractedText = rawBuffer.toString('utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
  return { text: extractedText };
}

// Backward-compatible helper: fetch file text from S3
async function fetchFileTextFromS3(transferId, storageName, maxBytes = 4 * 1024 * 1024, originalName = '') {
  const payload = await fetchFilePayloadFromS3(transferId, storageName, maxBytes, originalName);
  return payload.text || '';
}

// Helper to identify media/non-academic assets
function isMediaAsset(name = '', category = '') {
  if (category === 'image' || category === 'video' || category === 'audio') return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|m4a|zip|tar|gz|rar|7z)$/i.test(name);
}

// Helper to identify non-study documents (OMR sheets, hall tickets, fee receipts, blank forms)
function isNonStudyDocument(text = '', filename = '') {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerName.includes('omr') || lower.includes('omr sheet') || lower.includes('optical mark')) return true;
  
  // OMR bubble sheet patterns:
  const bubbleMatches = text.match(/\b\d{1,3}\s+[1-4]\s+[1-4]\s+[1-4]\s+[1-4]\b/g) || text.match(/\b\d{1,3}\s*\([1-4]\)\s*\([1-4]\)\s*\([1-4]\)\s*\([1-4]\)/g);
  if (bubbleMatches && bubbleMatches.length >= 8) return true;

  // NMMS / Mental Ability / Scholastic Aptitude exam bubble sheets
  if ((lower.includes('mental ability test') || lower.includes('scholastic aptitude test') || lower.includes('director of government examinations')) &&
      (lower.includes('hall ticket') || lower.includes('name of the student') || lower.includes('part - i') || lower.includes('part - ii'))) {
    return true;
  }

  // Admit cards / Hall tickets without study content
  if ((lowerName.includes('hallticket') || lowerName.includes('admit_card') || lowerName.includes('hall_ticket') || lowerName.includes('admitcard')) &&
      (lower.includes('exam center') || lower.includes('examination center') || lower.includes('roll no') || lower.includes('reporting time'))) {
    return true;
  }

  // Fee receipts / payment challans
  if ((lowerName.includes('receipt') || lowerName.includes('fee') || lowerName.includes('challan') || lowerName.includes('invoice')) &&
      (lower.includes('payment received') || lower.includes('transaction id') || lower.includes('tuition fee') || lower.includes('amount paid'))) {
    return true;
  }

  return false;
}

// --- LabDrop AI: Instant Lab Record / Observation Generator (Zero-Transfer Required) ---
app.post('/api/ai/lab-record', async (req, res) => {
  try {
    const {
      codeContent,
      filename,
      selectedSections = [],
      studentDetails = {},
      transferId,
      fileId,
      engine = 'instant',
      contentSize = 'standard',
      pdfBase64,
      imageBase64,
      docxBase64,
      mimeType
    } = req.body;

    let targetCode = codeContent || '';
    let targetFilename = filename || 'program';
    let targetPdfBase64 = pdfBase64 || null;
    let targetImageBase64 = imageBase64 || null;
    let targetMimeType = mimeType || null;

    // Handle Word Document (.docx / .doc) direct upload via base64
    const isDocxName = /\.(docx|doc)$/i.test(targetFilename);
    if (docxBase64 || (isDocxName && targetCode && targetCode.startsWith('data:'))) {
      try {
        const rawBase64 = docxBase64 || (targetCode.includes(',') ? targetCode.split(',')[1] : targetCode);
        const docxBuf = Buffer.from(rawBase64, 'base64');
        const mammoth = require('mammoth');
        const docxResult = await mammoth.extractRawText({ buffer: docxBuf });
        if (docxResult && docxResult.value && docxResult.value.trim()) {
          targetCode = docxResult.value.trim();
        }
      } catch (docxErr) {
        console.warn('[LabDrop AI Lab Record] DOCX direct parse warning:', docxErr.message);
      }
    }

    // If transferId and fileId provided, resolve from transfer
    if ((!targetCode || !targetCode.trim() || targetCode.startsWith('[Attached')) && transferId && fileId) {
      const transfer = await storage.transfers.get(transferId);
      if (transfer) {
        const fileObj = (transfer.files || []).find(f => f.id === fileId);
        if (fileObj) {
          const payload = await fetchFilePayloadFromS3(transfer.id, fileObj.storageName, 15 * 1024 * 1024, fileObj.originalName);
          targetCode = payload.text || '';
          targetFilename = fileObj.originalName;
          targetPdfBase64 = payload.pdfBase64;
          targetImageBase64 = payload.imageBase64;
          targetMimeType = payload.mimeType;
        }
      }
    }

    if (!targetCode && !targetPdfBase64 && !targetImageBase64) {
      return res.status(400).json({ error: 'Please provide code content or upload a code/diagram file to generate a Lab Record.' });
    }

    const recordData = await aiService.generateLabRecord({
      codeContent: targetCode,
      filename: targetFilename,
      selectedSections,
      studentDetails,
      engine,
      contentSize,
      pdfBase64: targetPdfBase64,
      imageBase64: targetImageBase64,
      mimeType: targetMimeType
    });

    if (recordData && recordData.markdown) {
      recordData.markdown = aiService.stripAiAds(recordData.markdown);
    }

    return res.json({
      success: true,
      ...recordData
    });
  } catch (err) {
    console.error('[LabDrop AI Lab Record] Error, falling back to synthesizer:', err);
    try {
      const fallback = aiService.synthesizeLabRecord({
        codeContent: req.body?.codeContent || '',
        filename: req.body?.filename || 'program',
        selectedSections: req.body?.selectedSections || [],
        studentDetails: req.body?.studentDetails || {},
        contentSize: req.body?.contentSize || 'standard'
      });
      return res.json({
        success: true,
        ...fallback,
        engineUsed: 'Academic Engine (Instant Fallback)'
      });
    } catch (synthErr) {
      return res.status(500).json({ error: synthErr.message || 'Failed to generate Lab Record.' });
    }
  }
});

// --- LabDrop AI Assistant (Exam Prep, Viva, Flowchart, and Follow-up Chat) ---
app.post('/api/ai/analyze', async (req, res) => {
  const {
    transferId,
    action,
    fileId,
    fileIds,
    directFiles = [],
    examType = 'viva',
    difficulty = 'medium',
    lengthType = 'medium',
    customLines = 15,
    force = false,
    prompt,
    conversationHistory = [],
    previousOutput = ''
  } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action.' });
  }

  let transfer = null;
  if (transferId) {
    transfer = await storage.transfers.get(transferId);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found or has expired.' });
    }

    if (Date.now() > transfer.expiresAt || transfer.status === 'EXPIRED') {
      return res.status(410).json({ error: 'This transfer has expired.' });
    }

    if (!verifyPin(req, res, transfer)) return;
  } else if (action !== 'chat' && (!directFiles || directFiles.length === 0)) {
    return res.status(400).json({ error: 'Missing transferId or direct files for AI analysis.' });
  }

  try {
    if (action === 'viva' || action === 'exam_prep') {
      const filesData = [];

      // 1. Resolve files from transfer
      const targetIds = Array.isArray(fileIds) && fileIds.length > 0 
        ? fileIds 
        : (fileId ? [fileId] : []);

      let transferFilesToAnalyze = [];
      if (targetIds.length > 0) {
        transferFilesToAnalyze = (transfer.files || []).filter(f => targetIds.includes(f.id));
      } else if (!directFiles || directFiles.length === 0) {
        // Fallback: Pick all files or first file
        transferFilesToAnalyze = (transfer.files || []).slice(0, 5);
      }

      for (const tf of transferFilesToAnalyze) {
        try {
          const payload = await fetchFilePayloadFromS3(transfer.id, tf.storageName, 15 * 1024 * 1024, tf.originalName);
          const isImg = payload.isImage;
          const isPdf = payload.isPdf;

          filesData.push({
            name: tf.originalName,
            isMedia: isImg && examType !== 'summarize',
            size: tf.size,
            content: payload.text || '',
            isPdf: !!isPdf,
            pdfBase64: payload.pdfBase64,
            isImage: !!isImg,
            imageBase64: payload.imageBase64,
            mimeType: payload.mimeType
          });
        } catch (err) {
          console.warn(`[LabDrop AI] Failed to read ${tf.originalName}:`, err.message);
        }
      }

      // 2. Resolve direct files (uploaded client-side)
      if (Array.isArray(directFiles)) {
        for (const df of directFiles) {
          if (df && df.name) {
            const isPdf = df.isPdf || df.name.toLowerCase().endsWith('.pdf');
            const isImg = df.isImage || /\.(png|jpe?g|webp)$/i.test(df.name);
            const isDocx = df.isDocx || /\.(docx|doc)$/i.test(df.name);
            const pdfBase64 = df.pdfBase64 || (isPdf && df.base64 ? df.base64 : null);
            const imageBase64 = df.imageBase64 || (isImg && df.base64 ? df.base64 : null);
            const docxBase64 = df.docxBase64 || (isDocx && df.base64 ? df.base64 : null);

            let safeContent = '';
            if (isDocx && docxBase64) {
              try {
                const mammoth = require('mammoth');
                const buf = Buffer.from(docxBase64, 'base64');
                const docxRes = await mammoth.extractRawText({ buffer: buf });
                if (docxRes && docxRes.value) {
                  safeContent = docxRes.value.trim();
                }
              } catch (docxErr) {
                console.warn('[LabDrop AI] Failed to extract direct DOCX text:', docxErr.message);
              }
            } else if (!isPdf && !isImg) {
              const rawContent = (df.content || df.codeContent || '').slice(0, 35 * 1024);
              safeContent = typeof rawContent === 'string' 
                ? rawContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ') 
                : '';
            }

            filesData.push({
              name: df.name,
              isMedia: isImg && examType !== 'summarize',
              size: df.size || safeContent.length,
              content: safeContent,
              isPdf: !!isPdf,
              pdfBase64,
              isImage: !!isImg,
              imageBase64,
              mimeType: df.mimeType || (isPdf ? 'application/pdf' : 'image/png')
            });
          }
        }
      }

      if (filesData.length === 0) {
        return res.status(400).json({ error: 'No readable files selected for preparation.' });
      }

      // 3. Non-study / Media guardrails:
      const isMediaOnly = filesData.every(f => f.isMedia);
      const isNonStudyOnly = filesData.every(f => f.isMedia || isNonStudyDocument(f.content, f.name));

      // If viva/exam prep requested on non-study or media files without force
      if (examType !== 'summarize' && (isMediaOnly || isNonStudyOnly) && !force) {
        const names = filesData.map(f => f.name).join(', ');
        const reason = isMediaOnly
          ? 'images, logos, or media assets'
          : 'non-study documents (such as an OMR answer sheet, hall ticket, fee receipt, or blank form)';
        return res.json({
          needsForce: true,
          isMediaOnly,
          isNonStudyOnly,
          warning: `Selected file(s) [${names}] appear to be ${reason} that do not contain academic study material or questions.`
        });
      }

      // 4. Generate Exam/Viva prep or Summary
      const result = await aiService.generateExamPrep({
        filesData,
        examType,
        difficulty,
        lengthType,
        customLines,
        isForceful: !!force,
        isMediaOnly
      });

      return res.json({
        success: true,
        type: 'exam_prep',
        examType,
        difficulty,
        lengthType,
        result: aiService.stripAiAds(result),
        filenames: filesData.map(f => f.name)
      });

    } else if (action === 'flowchart') {
      let targetFile = null;
      if (fileId) {
        targetFile = (transfer.files || []).find(f => f.id === fileId);
      } else if (Array.isArray(fileIds) && fileIds.length > 0) {
        targetFile = (transfer.files || []).find(f => f.id === fileIds[0]);
      } else {
        targetFile = (transfer.files || []).find(f => f.category === 'code' || f.category === 'text') || (transfer.files || [])[0];
      }

      if (!targetFile) {
        return res.status(400).json({ error: 'No file selected for flowchart generation.' });
      }

      const fileContent = await fetchFileTextFromS3(transfer.id, targetFile.storageName, 4 * 1024 * 1024, targetFile.originalName);
      if (!fileContent || fileContent.trim().length === 0) {
        return res.status(400).json({ error: 'The selected file is empty or cannot be converted to flowchart.' });
      }

      const flowchartOutput = await aiService.generateFlowchart(fileContent, targetFile.originalName);
      return res.json({ success: true, type: 'flowchart', filename: targetFile.originalName, result: flowchartOutput });

    } else if (action === 'chat') {
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required for AI chat.' });
      }

      let filesContext = `Workspace: "${transfer ? (transfer.transferName || 'Lab Files') : 'Direct Lab Workspace'}"\n`;
      const targetIds = Array.isArray(fileIds) && fileIds.length > 0 
        ? fileIds 
        : (fileId ? [fileId] : []);

      let filesToRead = [];
      if (transfer) {
        if (targetIds.length > 0) {
          filesToRead = (transfer.files || []).filter(f => targetIds.includes(f.id));
        } else {
          filesToRead = (transfer.files || []).slice(0, 5);
        }
      }

      const mediaParts = [];

      for (const f of filesToRead) {
        try {
          const payload = await fetchFilePayloadFromS3(transfer.id, f.storageName, 15 * 1024 * 1024, f.originalName);
          if (payload.pdfBase64) {
            mediaParts.push({ inlineData: { mimeType: 'application/pdf', data: payload.pdfBase64 } });
            filesContext += `\n--- Attached Multimodal PDF: ${f.originalName} ---\n${(payload.text || '').slice(0, 15000)}\n`;
          } else if (payload.imageBase64) {
            mediaParts.push({ inlineData: { mimeType: payload.mimeType || 'image/png', data: payload.imageBase64 } });
            filesContext += `\n--- Attached Multimodal Image/Diagram: ${f.originalName} ---\n`;
          } else if (!isMediaAsset(f.originalName, f.category)) {
            filesContext += `\n--- Content of ${f.originalName} ---\n${(payload.text || '').slice(0, 30000)}\n`;
          } else {
            filesContext += `\n--- Media Asset: ${f.originalName} (${(f.size / 1024).toFixed(1)} KB) ---\n`;
          }
        } catch (e) {
          // ignore error
        }
      }

      // Add direct files if provided
      if (Array.isArray(directFiles)) {
        for (const df of directFiles) {
          if (df && df.name) {
            const isDocx = df.isDocx || /\.(docx|doc)$/i.test(df.name);
            const docxBase64 = df.docxBase64 || (isDocx && df.base64 ? df.base64 : null);
            let content = df.content || df.codeContent || '';

            if (isDocx && docxBase64 && (!content || content.startsWith('[Attached Word Document'))) {
              try {
                const mammoth = require('mammoth');
                const buf = Buffer.from(docxBase64, 'base64');
                const docxRes = await mammoth.extractRawText({ buffer: buf });
                if (docxRes && docxRes.value) {
                  content = docxRes.value.trim();
                }
              } catch (e) {
                console.warn('[analyze chat] Failed to extract docx:', e.message);
              }
            }

            if (df.pdfBase64) {
              mediaParts.push({ inlineData: { mimeType: 'application/pdf', data: df.pdfBase64 } });
              filesContext += `\n--- Attached Multimodal PDF: ${df.name} ---\n${(content || '').slice(0, 15000)}\n`;
            } else if (df.imageBase64) {
              mediaParts.push({ inlineData: { mimeType: df.mimeType || 'image/png', data: df.imageBase64 } });
              filesContext += `\n--- Attached Multimodal Image/Diagram: ${df.name} ---\n`;
            } else {
              filesContext += `\n--- User Uploaded: ${df.name} ---\n${(content || '').slice(0, 25000)}\n`;
            }
          }
        }
      }

      const answer = await aiService.chatWithFiles(prompt.trim(), filesContext, conversationHistory, previousOutput, mediaParts);
      return res.json({ success: true, type: 'chat', result: aiService.stripAiAds(answer) });
    } else {
      return res.status(400).json({ error: `Unsupported AI action: ${action}` });
    }
  } catch (err) {
    console.error('[LabDrop AI] Error:', err);
    return res.status(500).json({ error: err.message || 'AI processing failed.' });
  }
});

// --- Serve transfer page (mobile) ---
app.get('/t/:id', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'transfer.html'));
});

// --- Server info endpoint ---
app.get('/api/info', (req, res) => {
  res.json({
    maxFileSize: CONFIG.MAX_FILE_SIZE,
    maxFiles: CONFIG.MAX_FILES_PER_TRANSFER,
    expiryMinutes: CONFIG.TRANSFER_EXPIRY_MINUTES,
    serverIP: getLocalIPv4(),
    port: CONFIG.PORT,
  });
});

// ============================================================
// Transfer cleanup
// ============================================================

async function deleteTransferS3ObjectsPermanently(transferId) {
  try {
    let keyMarker = undefined;
    let versionIdMarker = undefined;
    do {
      const listRes = await s3Client.send(new ListObjectVersionsCommand({
        Bucket: S3_BUCKET_NAME,
        Prefix: `${transferId}/`,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
        MaxKeys: 1000
      }));

      const objectsToDelete = [];
      if (listRes.Versions) {
        for (const v of listRes.Versions) {
          objectsToDelete.push({ Key: v.Key, VersionId: v.VersionId });
        }
      }
      if (listRes.DeleteMarkers) {
        for (const dm of listRes.DeleteMarkers) {
          objectsToDelete.push({ Key: dm.Key, VersionId: dm.VersionId });
        }
      }

      if (objectsToDelete.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: S3_BUCKET_NAME,
          Delete: { Objects: objectsToDelete }
        }));
      }

      if (listRes.IsTruncated) {
        keyMarker = listRes.NextKeyMarker;
        versionIdMarker = listRes.NextVersionIdMarker;
      } else {
        break;
      }
    } while (keyMarker);

    return true;
  } catch (err) {
    console.error(`[Cleanup] Failed to permanently delete S3 files for transfer ${transferId}:`, err);
    return false; // Retry later
  }
}

async function processExpiredTransfer(transfer) {
  if (transfer.status !== 'EXPIRED') {
    transfer.status = 'EXPIRED';
    await storage.transfers.set(transfer.id, transfer);
  }

  const success = await deleteTransferS3ObjectsPermanently(transfer.id);
  if (!success) {
    return false; // Retry on next interval
  }

  await storage.transfers.delete(transfer.id);
  return true;
}

async function cleanupExpiredTransfers() {
  try {
    const now = Date.now();
    let cleaned = 0;
    
    const transfers = await storage.transfers.getAll();
    for (const transfer of transfers) {
      if (now > transfer.expiresAt || transfer.status === 'EXPIRED') {
        const success = await processExpiredTransfer(transfer);
        if (success) cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cleanup] Processed and removed ${cleaned} expired transfer(s).`);
    }
  } catch (err) {
    console.error('[Cleanup] Error during expired transfers cleanup:', err.message || err);
  }
}

// Periodic cleanup of orphaned S3 files (e.g. aborted multipart uploads or broken sessions older than 2 hours)
async function cleanupOrphanedS3Files() {
  try {
    const allTransfers = await storage.transfers.getAll();
    const activeTransferIds = new Set(allTransfers.map(t => t.id));
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

    let keyMarker = undefined;
    let versionIdMarker = undefined;
    const orphansToDelete = [];

    do {
      const listRes = await s3Client.send(new ListObjectVersionsCommand({
        Bucket: S3_BUCKET_NAME,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
        MaxKeys: 1000
      }));

      const checkItem = (item) => {
        const transferId = item.Key.split('/')[0];
        const lastMod = item.LastModified ? new Date(item.LastModified).getTime() : 0;
        if (!activeTransferIds.has(transferId) && lastMod < twoHoursAgo) {
          orphansToDelete.push({ Key: item.Key, VersionId: item.VersionId });
        }
      };

      if (listRes.Versions) listRes.Versions.forEach(checkItem);
      if (listRes.DeleteMarkers) listRes.DeleteMarkers.forEach(checkItem);

      if (listRes.IsTruncated) {
        keyMarker = listRes.NextKeyMarker;
        versionIdMarker = listRes.NextVersionIdMarker;
      } else {
        break;
      }
    } while (keyMarker);

    if (orphansToDelete.length > 0) {
      console.log(`[Cleanup] Found ${orphansToDelete.length} orphaned S3 entries older than 2 hours. Purging...`);
      for (let i = 0; i < orphansToDelete.length; i += 400) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: S3_BUCKET_NAME,
          Delete: { Objects: orphansToDelete.slice(i, i + 400) }
        }));
      }
      console.log(`[Cleanup] Orphaned S3 entries successfully purged.`);
    }
  } catch (err) {
    console.error('[Cleanup] Error during orphaned S3 cleanup:', err);
  }
}

// Run cleanup on startup, then every minute
cleanupExpiredTransfers();
setInterval(cleanupExpiredTransfers, CONFIG.CLEANUP_INTERVAL_MS);

// Run orphaned cleaner every 6 hours, and once 5 minutes after startup
setTimeout(cleanupOrphanedS3Files, 5 * 60 * 1000);
setInterval(cleanupOrphanedS3Files, 6 * 60 * 60 * 1000);

// ============================================================
// Error handling middleware
// ============================================================


  // 404 Handler
  app.use((req, res, next) => {
    if (req.accepts('html')) {
      res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      if (req.accepts('html')) {
        res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
      } else {
        res.status(500).json({ error: 'An unexpected error occurred.' });
      }
    }
  });

// ============================================================
// Start server
// ============================================================

app.listen(CONFIG.PORT, '0.0.0.0', async () => {
  const localIP = getLocalIPv4();
  let publicUrl = null;

  console.log('');
  console.log('  ╔═══════════════════════════════════════════════╗');
  console.log('  ║                                               ║');
  console.log('  ║              🧪  LabDrop  v1.0                ║');
  console.log('  ║                                               ║');
  console.log('  ║   Temporary Lab File Transfer System          ║');
  console.log('  ║                                               ║');
  console.log('  ╠═══════════════════════════════════════════════╣');
  console.log('  ║                                               ║');
  console.log(`  ║   Local:   http://localhost:${CONFIG.PORT}             ║`);
  console.log(`  ║   Network: http://${localIP}:${CONFIG.PORT}        ║`);
  
  // Attempt to start localtunnel if not running on Render
  if (!process.env.RENDER) {
    try {
      const localtunnel = require('localtunnel');
      const tunnelPromise = localtunnel({ port: CONFIG.PORT });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tunnel timeout')), 8000));
      const tunnel = await Promise.race([tunnelPromise, timeoutPromise]);
      publicUrl = tunnel.url;
      process.env.PUBLIC_URL = publicUrl;
      
      // Quick pad helper
      const padStr = `  ║   Public:  ${publicUrl}`;
      console.log(padStr + ' '.repeat(Math.max(0, 50 - padStr.length)) + '║');
      
      tunnel.on('close', () => {
        console.log('  [Info] Public tunnel closed.');
        process.env.PUBLIC_URL = '';
      });

      tunnel.on('error', (err) => {
        console.log('  [Error] Tunnel encountered an error:', err.message);
        // Do not crash the server
      });
    } catch (err) {
      console.log('  ║   Public:  [Unavailable - Tunnel failed]      ║');
    }
  } else {
    console.log('  ║   Mode:    Production (Render)               ║');
    process.env.PUBLIC_URL = 'https://labdrop.online';
    console.log(`  ║   Public:  ${process.env.PUBLIC_URL}`.padEnd(49, ' ') + '║');
  }

  console.log('  ║                                               ║');
  console.log(`  ║   Max file size:  ${Math.round(CONFIG.MAX_FILE_SIZE / (1024 * 1024))}MB                        ║`);
  console.log(`  ║   Max files:      ${CONFIG.MAX_FILES_PER_TRANSFER}                          ║`);
  console.log(`  ║   Expiry:         ${CONFIG.TRANSFER_EXPIRY_MINUTES} minutes                   ║`);
  console.log('  ║                                               ║');
  console.log('  ╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log('  Open the Local URL on this PC to start transferring files.');
  console.log('  Make sure your phone is on the same Wi-Fi/LAN network.');
  if (publicUrl) {
    console.log('  To use the WhatsApp "Share to LabDrop" feature, install the web app');
    console.log('  by visiting the Public URL on your phone.');
  }
  console.log('');
});
