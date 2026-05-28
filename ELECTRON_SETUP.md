# Electron Desktop App Setup

This directory contains the Electron desktop application setup for the JIRA ETL Dashboard.

## 🚀 Quick Start

### Development Mode
```bash
# Start Electron with Next.js dev server
npm run electron:dev
```

This will:
1. Start the Next.js development server on port 3000
2. Wait for the server to be ready
3. Launch the Electron app automatically

### Production Build
```bash
# Build the desktop app for your current platform
npm run build:electron
```

This creates distributable packages in the `dist/` directory:
- **Windows**: `.exe` installer + portable executable
- **macOS**: `.dmg` disk image + `.app` bundle
- **Linux**: `.AppImage`, `.deb`, and `.rpm` packages

## 📦 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run electron` | Launch Electron app (requires Next.js running on port 3000) |
| `npm run electron:dev` | Start Next.js dev server + Electron (recommended for development) |
| `npm run build:electron` | Build production desktop app for current platform |
| `npm run build` | Build Next.js for production (web) |
| `npm run dev` | Start Next.js development server (web only) |

## 🎯 Platform-Specific Builds

### Windows
```bash
# Build for Windows (from Windows or macOS/Linux)
npm run build:electron -- --win
```

Creates:
- `dist/JIRA ETL Dashboard Setup 0.2.0.exe` (installer)
- `dist/JIRA ETL Dashboard 0.2.0.exe` (portable)

### macOS
```bash
# Build for macOS (from macOS only)
npm run build:electron -- --mac
```

Creates:
- `dist/JIRA ETL Dashboard-0.2.0.dmg` (disk image)
- `dist/JIRA ETL Dashboard-0.2.0-mac.zip` (archive)

### Linux
```bash
# Build for Linux (from Linux or macOS/Windows)
npm run build:electron -- --linux
```

Creates:
- `dist/jira-etl-dashboard-0.2.0.AppImage` (universal)
- `dist/jira-etl-dashboard_0.2.0_amd64.deb` (Debian/Ubuntu)
- `dist/jira-etl-dashboard-0.2.0-1.x86_64.rpm` (Fedora/RHEL)

## 🔧 Configuration

### App Metadata
Edit `package.json` to customize:
- `name` - Application identifier
- `version` - Version number
- `description` - App description
- `author` - Developer name
- `build.appId` - Unique app ID (com.yourcompany.app)

### Electron Settings
Edit `electron/main.js` to customize:
- Window size (`width`, `height`)
- App icon
- Security settings
- Platform-specific behavior

## 📁 File Structure

```
├── electron/
│   ├── main.js           # Electron main process
│   └── preload.js        # Preload script for security
├── assets/
│   └── ICON_README.md    # Instructions for adding app icons
├── dist/                 # Generated distributables (created after build)
└── package.json          # App configuration + build scripts
```

## 🔒 Security Features

- **Context Isolation**: Enabled (renderer processes isolated from main)
- **Node Integration**: Disabled (secure default)
- **Content Security**: Preload script for controlled API exposure
- **Electron API**: Exposed via contextBridge for safe renderer access

## 🎨 Customization

### Add App Icons
1. Create icon files:
   - `assets/icon.png` (512x512px)
   - `assets/icon.ico` (256x256px) for Windows
   - `assets/icon.icns` (1024x1024px) for macOS

2. Update `electron/main.js`:
```javascript
icon: path.join(__dirname, '../assets/icon.png')
```

### Customize Window
Edit `electron/main.js`:
```javascript
const mainWindow = new BrowserWindow({
  width: 1400,           // Window width
  height: 900,           // Window height
  minWidth: 800,         // Minimum width
  minHeight: 600,        // Minimum height
  resizable: true,       // Allow resizing
  fullscreen: false,     // Start in fullscreen
  backgroundColor: '#fff' // Window background
});
```

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
# Kill existing process on port 3000
npx kill-port 3000
# Or use a different port
PORT=3001 npm run electron:dev
```

### Build Fails
```bash
# Clean build artifacts
npm run clean
# Rebuild
npm run build:electron
```

### Missing Dependencies
```bash
# Reinstall all dependencies
rm -rf node_modules package-lock.json
npm install
```

### macOS: "App is damaged" Error
```bash
# Remove quarantine attribute
xattr -cr dist/JIRA\ ETL\ Dashboard.app
```

## 📚 Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder Documentation](https://www.electron.build/)
- [Next.js with Electron Guide](https://nextjs.org/docs/deployment#electron-renderer)

## 🚀 Deployment

### GitHub Releases
1. Build for all platforms:
```bash
npm run build:electron -- --mac --win --linux
```

2. Upload files from `dist/` to GitHub Releases

### Auto-Updates
For automatic updates, integrate with `electron-updater`:
```bash
npm install electron-updater
```

Add to `electron/main.js`:
```javascript
const { autoUpdater } = require('electron-updater');

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

## 🎉 Development Tips

- Use DevTools in development (automatically opened)
- Test on multiple platforms during development
- Keep your Electron version updated
- Follow security best practices
- Test distribution packages before release

---

Built with ❤️ using Electron + Next.js