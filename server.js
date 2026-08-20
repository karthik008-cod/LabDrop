require('dotenv').config();
// ============================================================
// LabDrop — Temporary Lab File Transfer System
// server.js — Main application entry point
// ============================================================

const express = require('express');
const multer = require('multer');
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

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  PORT: parseInt(process.env.PORT || process.env.LABDROP_PORT || '3000', 10),
  UPLOAD_DIR: path.join(__dirname, 'uploads'),
  MAX_FILE_SIZE: parseInt(process.env.LABDROP_MAX_FILE_SIZE || String(50 * 1024 * 1024), 10), // 50 MB
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
// Utility: Generate short code (human-readable transfer code)
// ============================================================

function generateShortCode() {
  // 4-digit random code
  return Math.floor(1000 + Math.random() * 9000).toString();
}

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

const analytics = {
  uniqueVisitors: new Set(),
  totalTransfersCreated: 0,
  totalFilesUploaded: 0,
  totalDownloads: 0
};

// Middleware to track unique visitors
app.use((req, res, next) => {
  if (req.ip) {
    analytics.uniqueVisitors.add(req.ip);
  }
  next();
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// Multer configuration for file uploads
// ============================================================

const diskStorageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    // Each transfer gets its own subdirectory (created in the route handler)
    cb(null, req.transferDir);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const sanitized = sanitizeFilename(file.originalname);
    // Prefix with fileId to prevent collisions
    cb(null, `${fileId}__${sanitized}`);
  },
});

const upload = multer({
  storage: diskStorageConfig,
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

// Middleware: create transfer directory before multer processes files
app.use('/api/upload', (req, res, next) => {
  const transferId = uuidv4();
  const transferDir = path.join(CONFIG.UPLOAD_DIR, transferId);
  fs.mkdirSync(transferDir, { recursive: true });
  req.transferId = transferId;
  req.transferDir = transferDir;
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
      // Clean up the created directory on error
      const dir = req.transferDir;
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }

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
            .filter(link => typeof link === 'string' && (link.startsWith('http://') || link.startsWith('https://')))
            .slice(0, 20)
            .map(link => link.substring(0, 1000));
        }
      } catch (e) {
        console.warn('Failed to parse links from request:', req.body.links);
      }
    }

    if ((!req.files || req.files.length === 0) && links.length === 0) {
      // Clean up empty directory
      const dir = req.transferDir;
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return res.status(400).json({ error: 'No files or links selected.' });
    }

    const transferId = req.transferId;
    
    // Generate a unique 4-digit short code
    let shortCode;
    let attempts = 0;
    while (attempts < 50) {
      shortCode = generateShortCode();
      const existing = await storage.transfers.getAll();
      if (!existing.some(t => t.shortCode === shortCode && Date.now() < t.expiresAt)) {
        break; // Found a unique one
      }
      attempts++;
    }
    if (attempts >= 50) {
      // Fallback in case of absolute saturation
      shortCode = generateShortCode() + '-' + generateShortCode();
    }
    const now = Date.now();
    let expiresAt = now + CONFIG.TRANSFER_EXPIRY_MINUTES * 60 * 1000;
    
    let isSavedForLater = false;
    let userId = null;

    if (req.user && req.body.saveForLater === 'true') {
      expiresAt = now + (7 * 24 * 60 * 60 * 1000); // exactly 7 days
      isSavedForLater = true;
      userId = req.user.userId;
    }

    const files = req.files.map((f) => {
      const parts = f.filename.split('__');
      const fileId = parts[0];
      const sanitized = parts.slice(1).join('__');
      return {
        id: fileId,
        originalName: sanitized,
        storageName: f.filename,
        size: f.size,
        mimetype: f.mimetype,
        category: getFileCategory(sanitized),
      };
    });

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Enforce total transfer size limit
    if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
      const dir = req.transferDir;
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
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

    // Generate QR code
    // Use PUBLIC_URL env var if set, otherwise infer from the request host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    let baseUrl = `${protocol}://${host}`;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const localIP = getLocalIPv4();
      if (localIP) baseUrl = `http://${localIP}:${CONFIG.PORT}`;
    } else if (process.env.PUBLIC_URL) {
      baseUrl = process.env.PUBLIC_URL;
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
    return res.status(404).json({ error: 'Transfer not found or has expired.' });
  }

  if (Date.now() > transfer.expiresAt) {
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
    const filePath = path.join(CONFIG.UPLOAD_DIR, transfer.id, file.storageName);
    const resolvedPath = path.resolve(filePath);
    const uploadsResolved = path.resolve(CONFIG.UPLOAD_DIR);

    if (resolvedPath.startsWith(uploadsResolved) && fs.existsSync(filePath)) {
      const folderName = fsMap[file.originalName];
      // Note: we can't easily sanitize folder names comprehensively here without
      // risk of collisions, but simple path sanitization is good practice.
      let entryName = file.originalName;
      if (folderName) {
         // Prevent directory traversal attacks in the ZIP structure itself
         const safeFolder = folderName.replace(/^(\.\.(\/|\\|$))+/, '');
         entryName = path.join(safeFolder, file.originalName).replace(/\\/g, '/');
      }
      archive.file(filePath, { name: entryName });
    }
  }

  transfer.downloadCount++;
  await storage.transfers.set(transfer.id, transfer);
  analytics.totalDownloads++;
  archive.finalize();
});

// --- Download a single file ---
app.get('/download/:transferId/:fileId', async (req, res) => {
  const transfer = await storage.transfers.get(req.params.transferId);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found or has expired.' });
  }

  if (Date.now() > transfer.expiresAt) {
    return res.status(410).json({ error: 'This transfer has expired.' });
  }

  if (!verifyPin(req, res, transfer)) return;

  const file = transfer.files.find((f) => f.id === req.params.fileId);

  if (!file) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const filePath = path.join(CONFIG.UPLOAD_DIR, transfer.id, file.storageName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on server.' });
  }

  // Ensure the resolved path is within the uploads directory (prevent path traversal)
  const resolvedPath = path.resolve(filePath);
  const uploadsResolved = path.resolve(CONFIG.UPLOAD_DIR);
  if (!resolvedPath.startsWith(uploadsResolved)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  transfer.downloadCount++;
  await storage.transfers.set(transfer.id, transfer);
  analytics.totalDownloads++;

  res.download(filePath, file.originalName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Download failed.' });
    }
  });
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
app.get('/admin/stats', async (req, res) => {
  const adminKey = 'super-secret-labdrop-key';
  
  if (req.query.key !== adminKey) {
    return res.status(403).send('Forbidden: Invalid admin key.');
  }

  res.json({
    activeTransfersInServer: await storage.transfers.getAll().length,
    totalUniqueVisitors: analytics.uniqueVisitors.size,
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

  const dir = path.join(CONFIG.UPLOAD_DIR, transferId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to delete transfer directory ${dir}:`, e.message);
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
      deleteTransfer(transfer.id);
      cleaned++;
    }
  }

  // 2. Clean up orphaned directories (in case server crashed or upload failed)
  if (fs.existsSync(CONFIG.UPLOAD_DIR)) {
    const dirs = fs.readdirSync(CONFIG.UPLOAD_DIR);
    for (const dirName of dirs) {
      const fullPath = path.join(CONFIG.UPLOAD_DIR, dirName);
      if (fs.statSync(fullPath).isDirectory() && !await storage.transfers.get(dirName)) {
        // Only delete if it's been around for more than 1 hour to be safe against in-progress uploads
        const stats = fs.statSync(fullPath);
        if (now - stats.birthtimeMs > 60 * 60 * 1000) {
           fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    }
  }

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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'An unexpected error occurred.' });
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
