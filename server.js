require('dotenv').config();
// ============================================================
// LabDrop — Temporary Lab File Transfer System
// server.js — Main application entry point
// ============================================================

const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, GetObjectCommand, DeleteObjectsCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
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

const JWT_SECRET = process.env.JWT_SECRET || 'labdrop-super-secret-jwt-key';

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
  MAX_FILE_SIZE: parseInt(process.env.LABDROP_MAX_FILE_SIZE || String(100 * 1024 * 1024), 10), // 100 MB
  MAX_FILES_PER_TRANSFER: parseInt(process.env.LABDROP_MAX_FILES || '20', 10),
  MAX_TOTAL_SIZE: parseInt(process.env.LABDROP_MAX_TOTAL_SIZE || String(500 * 1024 * 1024), 10), // 500 MB
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

const app = express();
app.use(express.json());

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

// Initialize analytics from DB
async function initAnalytics() {
  try {
    const stats = await storage.analytics.get();
    analytics.totalTransfersCreated = stats.totalTransfersCreated || 0;
    analytics.totalFilesUploaded = stats.totalFilesUploaded || 0;
    analytics.totalDownloads = stats.totalDownloads || 0;
    analytics.uniqueDevices = new Set(stats.uniqueDevices || []);
    analyticsLoaded = true;
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
        totalTransfersCreated: analytics.totalTransfersCreated,
        totalFilesUploaded: analytics.totalFilesUploaded,
        totalDownloads: analytics.totalDownloads,
        uniqueDevices: Array.from(analytics.uniqueDevices)
      });
    } catch (err) {
      console.error('Failed to save analytics', err);
    }
  }, 5000); // Debounce save every 5 seconds
}

function parseCookies(cookieStr) {
  if (!cookieStr) return {};
  return cookieStr.split(';').reduce((res, c) => {
    const [key, val] = c.trim().split('=').map(decodeURIComponent);
    try {
      return Object.assign(res, { [key]: JSON.parse(val) });
    } catch (e) {
      return Object.assign(res, { [key]: val });
    }
  }, {});
}

// Middleware to track unique visitors using device cookies
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  if (userAgent.toLowerCase().includes('uptimerobot')) {
    return next(); // Skip tracking for UptimeRobot
  }

  const cookies = parseCookies(req.headers.cookie);
  let deviceId = cookies['labdrop_device_id'];
  
  if (!deviceId) {
    deviceId = uuidv4();
    // Set cookie for 1 year
    res.cookie('labdrop_device_id', deviceId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
  }

  if (analyticsLoaded && !analytics.uniqueDevices.has(deviceId)) {
    analytics.uniqueDevices.add(deviceId);
    scheduleAnalyticsSave();
  }
  next();
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

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

// Middleware: set transferId for this upload session
app.use('/api/upload', (req, res, next) => {
  req.transferId = uuidv4();
  next();
});

// ============================================================
// API Routes
// ============================================================

// --- Authentication ---

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
    const { email, password } = req.body;
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
    const { email, password } = req.body;
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

// --- Upload files and create a transfer ---
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
            .slice(0, 20)
            .map(link => link.substring(0, 5000));
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
    const dayOfMonth = d.getDate();
    const startOfDay = new Date(d).setHours(0,0,0,0);
    const secondsOfDay = Math.floor((now - startOfDay) / 1000);
    const timeBlock = Math.floor(secondsOfDay / 900);
    
    const timeBlockId = `${d.getFullYear()}-${d.getMonth() + 1}-${dayOfMonth}-block-${timeBlock}`;
    const sequence = await storage.transfers.getNextSequence(timeBlockId);
    const shortCode = `${dayOfMonth}${timeBlock}${sequence}`;

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
      pin = generatePin();
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

  if (Date.now() > transfer.expiresAt) {
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
      size: f.size,
      category: f.category,
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

  if (Date.now() > transfer.expiresAt) {
    if (req.accepts('html')) return res.status(410).sendFile(path.join(__dirname, 'public', 'expired.html'));
    return res.status(410).json({ error: 'This transfer has expired.' });
  }

  if (!verifyPin(req, res, transfer)) return;

  // Determine ZIP filename (query param > transferName > shortCode)
  let baseName = req.query.name ? req.query.name : (transfer.transferName || transfer.shortCode);
  baseName = sanitizeFilename(baseName);
  const zipFilename = `LabDrop-${baseName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 5 } });

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP archive.' });
    }
  });

  archive.pipe(res);

  const fsMap = transfer.folderStructure || {};

  for (const file of transfer.files) {
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
      archive.append(response.Body, { name: entryName });
    } catch (err) {
      console.error(`Failed to fetch file from S3 for ZIP: ${s3Key}`, err);
    }
  }

  transfer.downloadCount++;
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

  if (Date.now() > transfer.expiresAt) {
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
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
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
      if (Date.now() > transfer.expiresAt) {
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

  res.json({
    activeTransfersInServer: await storage.transfers.getAll().length,
    totalUniqueVisitors: analytics.uniqueDevices.size,
    totalTransfersCreated: analytics.totalTransfersCreated,
    totalFilesUploaded: analytics.totalFilesUploaded,
    totalDownloads: analytics.totalDownloads,
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

  await deleteTransfer(transfer.id);
  res.json({ success: true, message: 'Transfer cancelled and files deleted.' });
});

// --- Extend transfer expiry ---
app.post('/api/transfer/:id/extend', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found.' });
  }
  
  if (Date.now() > transfer.expiresAt) {
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

// --- Serve transfer page (mobile) ---
app.get('/t/:id', (req, res) => {
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

async function deleteTransfer(transferId) {
  const transfer = await storage.transfers.get(transferId);
  if (!transfer) return;

  if (transfer.files && transfer.files.length > 0) {
    const objectsToDelete = transfer.files.map(f => ({
      Key: `${transferId}/${f.storageName}`
    }));
    
    try {
      const command = new DeleteObjectsCommand({
        Bucket: S3_BUCKET_NAME,
        Delete: { Objects: objectsToDelete }
      });
      await s3Client.send(command);
    } catch (err) {
      console.error(`Failed to delete S3 files for transfer ${transferId}:`, err);
    }
  }

  await storage.transfers.delete(transferId);
}

async function cleanupExpiredTransfers() {
  const now = Date.now();
  let cleaned = 0;
  
  // 1. Clean up from storage
  for (const transfer of await storage.transfers.getAll()) {
    if (now > transfer.expiresAt) {
      await deleteTransfer(transfer.id);
      cleaned++;
    }
  }

  // Note: Orphaned file cleanup is typically handled by Cloud Storage lifecycle rules in a production S3 setup.

  if (cleaned > 0) {
    console.log(`[Cleanup] Removed ${cleaned} expired transfer(s).`);
  }
}

// Run cleanup on startup, then every minute
cleanupExpiredTransfers();
setInterval(cleanupExpiredTransfers, CONFIG.CLEANUP_INTERVAL_MS);

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
      const tunnel = await localtunnel({ port: CONFIG.PORT });
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
    if (process.env.RENDER_EXTERNAL_URL) {
      process.env.PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;
      console.log(`  ║   Public:  ${process.env.PUBLIC_URL}`.padEnd(49, ' ') + '║');
    }
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
