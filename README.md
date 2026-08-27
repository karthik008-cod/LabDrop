# LabDrop 🧪

**Transfer lab files to your phone instantly. No login. No USB. No hassle.**

LabDrop is a temporary file transfer system designed for college students who need to quickly move files (screenshots, source code, PDFs, etc.) from shared laboratory computers to their personal phones.

## The Problem

After every lab session, students need their files (screenshots, code, results) but the lab PCs are shared machines. The current process is painful:

> Take screenshot → Open WhatsApp/Gmail/Drive → Login → Send file → Download later

**LabDrop simplifies this to:**

> Select files → Scan QR code → Download on phone → Done ✅

---

## Quick Start

### Prerequisites

- **Node.js** (v16 or later) — [Download here](https://nodejs.org/)

### Installation

```bash
# 1. Navigate to the LabDrop directory
cd LabDrop

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

That's it! The server will start and show you the local URL:

```
  ╔═══════════════════════════════════════════════╗
  ║              🧪  LabDrop  v1.0                ║
  ║                                               ║
  ║   Local:   http://localhost:3000              ║
  ║   Network: http://192.168.1.17:3000           ║
  ╚═══════════════════════════════════════════════╝
```

Open the **Local** URL on the lab PC to start transferring files.

---

## How to Use

### On the Lab Computer

1. Open `http://localhost:3000` in a browser.
2. **Select files** — drag & drop or click to browse.
3. Click **Create Transfer**.
4. A **QR code** appears on screen.

### On Your Phone

1. **Scan the QR code** with your phone's camera.
2. A mobile-friendly page opens in your browser.
3. Tap **Download All (ZIP)** or download individual files.
4. Done! 🎉

---

## Using LabDrop on a College LAN / Wi-Fi

LabDrop works over the **local network** — files transfer directly between the lab PC and your phone without needing internet.

### Requirements

- The lab PC and your phone must be on the **same Wi-Fi or LAN network**.
- The QR code will automatically contain the correct LAN IP address (e.g., `http://192.168.1.17:3000/t/abc-123`).

### Windows Firewall

If your phone cannot connect after scanning the QR code, you may need to allow Node.js through the Windows Firewall:

1. Open **Windows Security** → **Firewall & network protection**.
2. Click **Allow an app through firewall**.
3. Click **Change settings** → **Allow another app**.
4. Click **Browse** and find `node.exe` (usually at `C:\Program Files\nodejs\node.exe`).
5. Add it, and make sure both **Private** and **Public** checkboxes are checked.
6. Click **OK**.

Alternatively, run this PowerShell command as Administrator:

```powershell
netsh advfirewall firewall add rule name="LabDrop (Node.js)" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes profile=any
```

---

## Configuration

LabDrop works out of the box with sensible defaults. You can customize behavior using environment variables:

| Variable | Default | Description |
|---|---|---|
| `LABDROP_PORT` | `3000` | Server port |
| `LABDROP_MAX_FILE_SIZE` | `104857600` (100 MB) | Max file size in bytes |
| `LABDROP_MAX_FILES` | `20` | Max files per transfer |
| `LABDROP_EXPIRY_MINUTES` | `30` | Transfer expiry time in minutes |

Example:

```bash
# Windows Command Prompt
set LABDROP_PORT=8080
set LABDROP_EXPIRY_MINUTES=60
npm start

# PowerShell
$env:LABDROP_PORT = "8080"
$env:LABDROP_EXPIRY_MINUTES = "60"
npm start
```

---

## Architecture

```
┌──────────────────────────────────┐
│          Lab PC (Server)         │
│                                  │
│   Node.js + Express              │
│   ├── Serves desktop UI          │
│   ├── Handles file uploads       │
│   ├── Generates QR codes         │
│   ├── Serves mobile download UI  │
│   └── Auto-cleans expired files  │
│                                  │
│   Files stored temporarily in    │
│   ./uploads/ directory           │
└──────────────┬───────────────────┘
               │
          Local Wi-Fi / LAN
               │
┌──────────────▼───────────────────┐
│       Student's Phone            │
│                                  │
│   Scans QR code                  │
│   Opens mobile browser           │
│   Downloads files                │
│   (No app install needed)        │
└──────────────────────────────────┘
```

- **No internet required** — works purely over the local network.
- **No accounts or login** — just select, scan, download.
- **Files are temporary** — automatically deleted after 30 minutes (configurable).
- **Isolated transfers** — each transfer has a unique, unpredictable ID.

---

## Security

- ✅ Random UUID transfer tokens (unpredictable)
- ✅ No directory listings exposed
- ✅ Path traversal protection
- ✅ Filename sanitization
- ✅ Blocked dangerous file extensions (.exe, .bat, .cmd, etc.)
- ✅ File size limits
- ✅ Automatic expiration and cleanup
- ✅ No personal data stored

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| File Upload | Multer |
| QR Generation | qrcode (npm) |
| ZIP Download | archiver |
| Transfer IDs | uuid (v4) |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Storage | Temporary filesystem (in-memory index) |

---

## Project Structure

```
LabDrop/
├── server.js              # Main server (Express, API routes, cleanup)
├── package.json           # Project dependencies
├── README.md              # This file
├── uploads/               # Temporary file storage (auto-created, auto-cleaned)
└── public/                # Static frontend files
    ├── index.html         # Desktop UI (file selection + QR display)
    ├── transfer.html      # Mobile UI (file download page)
    ├── css/
    │   └── style.css      # Design system
    └── js/
        ├── main.js        # Desktop logic
        └── mobile.js      # Mobile logic
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Phone can't connect | Ensure phone and PC are on the same Wi-Fi/LAN. Check Windows Firewall (see above). |
| QR code shows `localhost` | This shouldn't happen — LabDrop auto-detects your LAN IP. If it does, check your network connection. |
| Upload fails | Check file size (max 100MB) and file count (max 20). |
| Files expired | Create a new transfer. Default expiry is 30 minutes. |
| Port already in use | Change the port: `set LABDROP_PORT=8080` then `npm start` |

---

## License

MIT
