# Electron App Quick Reference

Quick reference guide for building and troubleshooting the JIRA ETL Dashboard desktop application.

## 🚀 Quick Build Commands

### Development
```bash
# Start desktop app with hot reload
npm run electron:dev

# Start Electron only (requires Next.js running on port 3000)
npm run electron
```

### Production Builds
```bash
# Build for current platform
npm run build:electron

# Build for all platforms
npm run build:electron -- --mac --win --linux

# Platform-specific builds
npm run build:electron -- --mac       # macOS only
npm run build:electron -- --win       # Windows only  
npm run build:electron -- --linux     # Linux only

# Architecture-specific builds
npm run build:electron -- --mac --x64      # macOS Intel
npm run build:electron -- --mac --arm64    # macOS Apple Silicon
npm run build:electron -- --win --x64      # Windows 64-bit
npm run build:electron -- --win --ia32     # Windows 32-bit
```

## 📦 Output Files

### Windows
- `JIRA ETL Dashboard Setup 0.2.0.exe` - Installer
- `JIRA ETL Dashboard 0.2.0.exe` - Portable

### macOS
- `JIRA ETL Dashboard-0.2.0.dmg` - Disk image
- `JIRA ETL Dashboard-0.2.0-mac.zip` - Archive

### Linux
- `jira-etl-dashboard-0.2.0.AppImage` - Universal
- `jira-etl-dashboard_0.2.0_amd64.deb` - Debian/Ubuntu
- `jira-etl-dashboard-0.2.0-1.x86_64.rpm` - Fedora/RHEL

## 🛠️ Common Issues & Fixes

### Build Fails
```bash
# Clean and rebuild
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build:electron
```

### Port 3000 Already in Use
```bash
# Kill process on port 3000
npx kill-port 3000

# Or use different port
PORT=3001 npm run electron:dev
```

### Missing Dependencies
```bash
# Windows: Install build tools
npm install --global windows-build-tools

# macOS: Install Xcode tools
xcode-select --install

# Linux: Install required libraries
sudo apt-get install -y libgtk-3-dev libnotify-dev libnss3-dev
```

### macOS "App is Damaged"
```bash
# Remove quarantine attribute
xattr -cr "JIRA ETL Dashboard.app"
```

### Linux AppImage Won't Run
```bash
# Add execute permission
chmod +x jira-etl-dashboard-0.2.0.AppImage
./jira-etl-dashboard-0.2.0.AppImage
```

### Large Build Size
```bash
# Optimize build (add to package.json build config)
"compression": "maximum",
"asar": true
```

## 🔧 Configuration

### Update Version
```bash
# Update version in package.json
npm version patch  # 0.2.0 → 0.2.1
npm version minor  # 0.2.0 → 0.3.0
npm version major  # 0.2.0 → 1.0.0
```

### Add App Icons
1. Place icons in `assets/`:
   - `icon.png` (512x512px)
   - `icon.ico` (256x256px) for Windows
   - `icon.icns` (1024x1024px) for macOS

2. Update `electron/main.js`:
```javascript
icon: path.join(__dirname, '../assets/icon.png')
```

### Custom Window Size
Edit `electron/main.js`:
```javascript
const mainWindow = new BrowserWindow({
  width: 1400,     // Window width
  height: 900,     // Window height
  minWidth: 800,   // Minimum width
  minHeight: 600,  // Minimum height
});
```

## 📋 Pre-Build Checklist

- [ ] Tests pass: `npm test`
- [ ] No lint errors: `npm run lint`
- [ ] Version updated in package.json
- [ ] App icons added to assets/
- [ ] Documentation updated
- [ ] Tested in development mode
- [ ] Git tag created (for release)

## 🚀 Release Process

### Create Release
```bash
# 1. Update version
npm version minor

# 2. Build for all platforms
npm run build:electron -- --mac --win --linux

# 3. Create git tag
git tag -a v0.2.0 -m "Release version 0.2.0"

# 4. Push to GitHub
git push origin main --tags

# 5. Upload files from dist/ to GitHub Releases
```

### Test Release
```bash
# Test built applications
# macOS:
open dist/JIRA\ ETL\ Dashboard-0.2.0.dmg

# Windows:
.\dist\JIRA\ ETL\ Dashboard\ Setup\ 0.2.0.exe

# Linux:
chmod +x dist/jira-etl-dashboard-0.2.0.AppImage
./dist/jira-etl-dashboard-0.2.0.AppImage
```

## 📁 Important Files

```
jira-etl-dashboard/
├── electron/
│   ├── main.js           # Main Electron process
│   └── preload.js        # Preload script
├── assets/
│   └── icon.png          # App icon (512x512px)
├── docs/
│   ├── ELECTRON_BUILD_GUIDE.md      # Detailed build guide
│   ├── ELECTRON_USER_GUIDE.md       # User documentation
│   └── ELECTRON_QUICK_REFERENCE.md  # This file
├── dist/                 # Built applications (created after build)
└── package.json          # Build configuration
```

## 🔒 Security Best Practices

### Code Signing
```bash
# Windows: Add to package.json
"certificateFile": "path/to/cert.pfx",
"certificatePassword": "password"

# macOS: Add to package.json  
"identity": "Developer ID Application: Your Name (TEAMID)"
```

### Environment Variables
```bash
# Set secure environment variables
export ELECTRON_BUILDER_CACHE=~/electron-cache
export CSC_LINK=path/to/cert.pfx
export CSC_KEY_PASSWORD=password
```

## 📞 Support

**Documentation:**
- Build Guide: `docs/ELECTRON_BUILD_GUIDE.md`
- User Guide: `docs/ELECTRON_USER_GUIDE.md`

**Community:**
- Issues: [GitHub Issues](https://github.com/CJ-1981/jira-etl-dashboard/issues)
- Discussions: [GitHub Discussions](https://github.com/CJ-1981/jira-etl-dashboard/discussions)

**Resources:**
- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Version:** 0.2.0  
**Last Updated:** 2025-05-15