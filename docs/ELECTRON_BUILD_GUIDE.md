# Electron App Build Guide

Complete guide for building and distributing the JIRA ETL Dashboard desktop application using Electron.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Platform-Specific Builds](#platform-specific-builds)
- [Build Configuration](#build-configuration)
- [Testing Built Applications](#testing-built-applications)
- [Distribution & Release](#distribution--release)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

---

## Prerequisites

### Required Software

**For All Platforms:**
- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Git**: For cloning and version control

### Platform-Specific Requirements

#### **Windows Builds**

**Requirements:**
- **Windows 10/11** or **Windows Server 2016+**
- **Visual Studio 2022** (Build Tools)
- **.NET Framework 4.5+**
- **Windows SDK 10.0.17134.0** or later

**Install Build Tools:**
```bash
npm install --global windows-build-tools
```

**Alternative:**
```bash
# Install Visual Studio Build Tools manually
# Download from: https://visualstudio.microsoft.com/downloads/
# Select "Desktop development with C++" workload
```

#### **macOS Builds**

**Requirements:**
- **macOS 10.15 (Catalina)** or later
- **Xcode 13.0** or later
- **Xcode Command Line Tools**

**Install Xcode Tools:**
```bash
xcode-select --install
```

**Verify Installation:**
```bash
xcode-select -p
```

#### **Linux Builds**

**Requirements:**
- **Ubuntu 20.04+** / **Fedora 35+** / **Debian 11+**
- **GCC 9+** / **Clang 10+**
- **libgtk-3-dev** and development libraries

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-dev \
  libnotify-dev \
  libgconf-2-4 \
  libnss3-dev \
  libxss1 \
  libxtst6 \
  xauth \
  xvfb
```

**Fedora/RHEL:**
```bash
sudo dnf install -y \
  gtk3-devel \
  notify-devel \
  nss-devel \
  libXScrnSaver-devel \
  libXtst-devel \
  xorg-x11-server-Xvfb \
  xauth
```

---

## Quick Start

### 1. Install Dependencies

```bash
# Clone repository (if not already done)
git clone https://github.com/CJ-1981/jira-etl-dashboard.git
cd jira-etl-dashboard

# Install Node.js dependencies
npm install
```

### 2. Build for Current Platform

```bash
# Build desktop app for your current operating system
npm run build:electron
```

**Output Location:** `dist/` directory

### 3. Test the Built Application

```bash
# Navigate to dist directory
cd dist

# Run the built application
# macOS:
open JIRA\ ETL\ Dashboard-0.2.0.dmg

# Windows:
.\JIRA\ ETL\ Dashboard\ Setup\ 0.2.0.exe

# Linux:
chmod +x jira-etl-dashboard-0.2.0.AppImage
./jira-etl-dashboard-0.2.0.AppImage
```

---

## Platform-Specific Builds

### Building for Windows

#### From Windows

```bash
# Build for Windows (x64 and ia32)
npm run build:electron -- --win

# Build for specific architecture
npm run build:electron -- --win --x64
npm run build:electron -- --win --ia32
```

**Output:**
- `JIRA ETL Dashboard Setup 0.2.0.exe` (NSIS installer)
- `JIRA ETL Dashboard 0.2.0.exe` (portable)

#### From macOS/Linux (Cross-Compile)

```bash
# Install Wine (required for Windows builds on non-Windows)
brew install wine  # macOS
sudo apt install wine  # Linux

# Build for Windows
npm run build:electron -- --win
```

### Building for macOS

#### From macOS

```bash
# Build for macOS (x64 and arm64)
npm run build:electron -- --mac

# Build for specific architecture
npm run build:electron -- --mac --x64
npm run build:electron -- --mac --arm64

# Build universal binary (x64 + arm64)
npm run build:electron -- --mac --universal
```

**Output:**
- `JIRA ETL Dashboard-0.2.0.dmg` (disk image)
- `JIRA ETL Dashboard-0.2.0-mac.zip` (archive)

#### From Linux/Windows (Cross-Compile)

⚠️ **Cross-compiling for macOS from non-macOS platforms is not supported** by electron-builder due to Apple's restrictions.

You must build on macOS hardware or use a cloud build service (MacStadium, Travis CI, GitHub Actions with macOS runners).

### Building for Linux

#### From Linux

```bash
# Build for all Linux targets
npm run build:electron -- --linux

# Build specific formats
npm run build:electron -- --linux AppImage
npm run build:electron -- --linux deb
npm run build:electron -- --linux rpm
```

**Output:**
- `jira-etl-dashboard-0.2.0.AppImage` (universal)
- `jira-etl-dashboard_0.2.0_amd64.deb` (Debian/Ubuntu)
- `jira-etl-dashboard-0.2.0-1.x86_64.rpm` (Fedora/RHEL)

#### From macOS/Windows (Cross-Compile)

```bash
# Install Docker (required for cross-compilation)
# Download from: https://www.docker.com/get-started

# Build for Linux
npm run build:electron -- --linux
```

---

## Build Configuration

### Modify Build Settings

Edit `package.json` build configuration:

```json
{
  "build": {
    "appId": "com.jira-etl.dashboard",
    "productName": "JIRA ETL Dashboard",
    "version": "0.2.0",
    "directories": {
      "output": "dist",
      "buildResources": "assets"
    },
    "files": [
      "electron/**/*",
      ".next/**/*",
      "public/**/*",
      "node_modules/**/*",
      "package.json"
    ]
  }
}
```

### Version Management

**Update Version:**
```bash
# Update version in package.json
npm version patch  # 0.2.0 → 0.2.1
npm version minor  # 0.2.0 → 0.3.0
npm version major  # 0.2.0 → 1.0.0
```

**Build with New Version:**
```bash
npm run build:electron
```

### App Icons

**Add Custom Icons:**

1. Create icon files in `assets/` directory:
   - `icon.png` (512x512px minimum)
   - `icon.ico` (256x256px) for Windows
   - `icon.icns` (1024x1024px) for macOS

2. Update `electron/main.js`:
```javascript
const mainWindow = new BrowserWindow({
  icon: path.join(__dirname, '../assets/icon.png'),
  // ... other options
});
```

3. Update `package.json`:
```json
{
  "build": {
    "win": {
      "icon": "assets/icon.ico"
    },
    "mac": {
      "icon": "assets/icon.icns"
    },
    "linux": {
      "icon": "assets/icon.png",
      "category": "Development"
    }
  }
}
```

**Generate Icons from PNG:**
```bash
# Online tool: https://electronjs.org/docs/tutorial/tutorial-icons
# Or use: https://icoconvert.com/
```

---

## Testing Built Applications

### Pre-Build Testing

1. **Test in Development Mode:**
```bash
npm run electron:dev
```

2. **Test Production Build Locally:**
```bash
npm run build
npm run electron
```

3. **Run All Tests:**
```bash
npm run test
npm run lint
```

### Post-Build Testing

#### Windows Testing

```bash
# Test installer installation
.\JIRA\ ETL\ Dashboard\ Setup\ 0.2.0.exe

# Test portable version
.\JIRA\ ETL\ Dashboard\ 0.2.0.exe

# Verify:
# - App launches correctly
# - All features work
# - Database connectivity works
# - JIRA API integration works
# - No console errors (open DevTools)
```

#### macOS Testing

```bash
# Test DMG installation
hdiutil attach JIRA\ ETL\ Dashboard-0.2.0.dmg
cp -R /Volumes/JIRA\ ETL\ Dashboard/JIRA\ ETL\ Dashboard.app /Applications/
hdiutil detach /Volumes/JIRA\ ETL\ Dashboard

# Launch and test
open /Applications/JIRA\ ETL\ Dashboard.app

# Verify app signature and notarization (for distribution)
codesign -dv --verbose=4 /Applications/JIRA\ ETL\ Dashboard.app
```

#### Linux Testing

```bash
# Test AppImage
chmod +x jira-etl-dashboard-0.2.0.AppImage
./jira-etl-dashboard-0.2.0.AppImage

# Test deb package
sudo dpkg -i jira-etl-dashboard_0.2.0_amd64.deb
jira-etl-dashboard

# Test rpm package
sudo rpm -i jira-etl-dashboard-0.2.0-1.x86_64.rpm
jira-etl-dashboard
```

### Automated Testing

**Create test script:** `scripts/test-build.sh`
```bash
#!/bin/bash
echo "Testing Electron build..."

# Check if build exists
if [ ! -d "dist" ]; then
  echo "❌ Build directory not found. Run build first."
  exit 1
fi

# Run tests based on platform
case "$(uname -s)" in
  Darwin)
    echo "Testing macOS build..."
    hdiutil attach dist/JIRA*.dmg
    # Add tests here
    hdiutil detach /Volumes/JIRA*
    ;;
  Linux)
    echo "Testing Linux build..."
    chmod +x dist/*.AppImage
    dist/*.AppImage --version
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "Testing Windows build..."
    dist/*.exe --version
    ;;
esac

echo "✅ Build tests complete"
```

---

## Distribution & Release

### GitHub Release Workflow

1. **Build for All Platforms:**
```bash
npm run build:electron -- --mac --win --linux
```

2. **Create Release Tag:**
```bash
git tag -a v0.2.0 -m "Release version 0.2.0"
git push origin v0.2.0
```

3. **Upload to GitHub:**
- Go to GitHub Releases page
- Create new release
- Upload all files from `dist/` directory
- Add release notes

### Automated Release (CI/CD)

**GitHub Actions Workflow:** `.github/workflows/release.yml`
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Build for ${{ matrix.os }}
        run: npm run build:electron

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: dist/*
```

### Code Signing

#### Windows Code Signing

```bash
# Install signing certificate
# Configure in package.json:
{
  "build": {
    "win": {
      "certificateFile": "path/to/cert.pfx",
      "certificatePassword": "password"
    }
  }
}
```

#### macOS Code Signing

```bash
# Request signing certificate from Apple Developer account
# Configure in package.json:
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}

# Notarize app (required for macOS 10.15+)
npm install --save-dev electron-notarize
```

---

## Troubleshooting

### Common Build Issues

#### Issue: "gyp ERR! stack Error: `EACCES`"

**Cause:** Missing build tools or permissions

**Solution:**
```bash
# Windows
npm install --global windows-build-tools

# Linux
sudo apt-get install build-essential

# macOS
xcode-select --install
```

#### Issue: "Cannot find module 'electron-builder'"

**Cause:** Missing dependencies

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

#### Issue: "File too large" error

**Cause:** Build output exceeds GitHub limits (100MB)

**Solution:**
```bash
# Add to .gitignore
dist/
*.dmg
*.exe
*.AppImage
```

#### Issue: macOS app "is damaged" warning

**Cause:** Missing code signature or notarization

**Solution:**
```bash
# Remove quarantine attribute
xattr -cr "JIRA ETL Dashboard.app"

# Proper solution: Code sign and notarize
```

#### Issue: Linux AppImage won't run

**Cause:** Missing execute permissions

**Solution:**
```bash
chmod +x *.AppImage
./jira-etl-dashboard-*.AppImage
```

### Platform-Specific Issues

#### Windows

**Problem:** Antivirus blocks the app
**Solution:** Add build directory to antivirus exclusions

**Problem:** Windows Defender SmartScreen warning
**Solution:** Code sign the application with trusted certificate

#### macOS

**Problem:** App won't open on macOS 10.15+
**Solution:** Notarize the application with Apple

**Problem:** "Unidentified Developer" warning
**Solution:** Right-click → Open, or disable Gatekeeper for testing

#### Linux

**Problem:** Missing dependencies
**Solution:** Install required libraries (see Prerequisites)

**Problem:** AppImage doesn't integrate with system
**Solution:** Use AppImageLauncher or install deb/rpm package

### Build Size Optimization

**Reduce application size:**

```json
{
  "build": {
    "files": [
      "electron/**/*",
      ".next/**/*",
      "public/**/*",
      "node_modules/**/*",
      "!node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
      "!node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
      "!node_modules/*.d.ts",
      "!node_modules/.bin",
      "!*/*.{iml,o,hprof,orig,pyc,swp,csproj,sln,xproj}",
      "!.editorconfig",
      "!**/._*",
      "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
      "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
      "!**/{appveyor.yml,.travis.yml,circle.yml}",
      "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
    ],
    "compression": "maximum",
    "asar": true
  }
}
```

---

## Advanced Configuration

### Custom Build Scripts

**Create custom build script:** `scripts/build-electron.js`
```javascript
const { spawn } = require('child_process');
const fs = require('fs');

const platforms = process.argv.slice(2);

if (platforms.length === 0) {
  console.log('Usage: node build-electon.js [mac|win|linux]');
  process.exit(1);
}

console.log(`Building for: ${platforms.join(', ')}`);

// Build Next.js first
console.log('Building Next.js...');
spawn('npm', ['run', 'build'], { stdio: 'inherit' });

// Build Electron apps
platforms.forEach(platform => {
  console.log(`Building Electron for ${platform}...`);
  spawn('npx', ['electron-builder', `--${platform}`], {
    stdio: 'inherit'
  });
});

console.log('✅ Build complete!');
```

**Usage:**
```bash
node scripts/build-electon.js mac win linux
```

### Environment-Specific Builds

**Development Build:**
```bash
NODE_ENV=development npm run build:electron
```

**Production Build:**
```bash
NODE_ENV=production npm run build:electron
```

**Custom Configuration:**
```bash
ELECTRON_BUILDER_CACHE=~/electron-cache npm run build:electron
```

### Multi-Version Builds

**Build multiple versions:**
```bash
# Build version 0.2.0
npm version 0.2.0
npm run build:electron
mv dist dist-0.2.0

# Build version 0.3.0
npm version 0.3.0
npm run build:electron
mv dist dist-0.3.0
```

### Automated Testing Pipeline

**Create test pipeline:** `scripts/test-pipeline.sh`
```bash
#!/bin/bash
set -e

echo "🚀 Starting automated build pipeline..."

# 1. Run tests
echo "📋 Running tests..."
npm test

# 2. Build for current platform
echo "🔨 Building Electron app..."
npm run build:electron

# 3. Test built application
echo "🧪 Testing built application..."
./scripts/test-build.sh

# 4. Package for distribution
echo "📦 Creating distribution packages..."
./scripts/create-release.sh

echo "✅ Pipeline complete!"
```

---

## Best Practices

### Pre-Build Checklist

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Version number updated in `package.json`
- [ ] Changelog updated
- [ ] App icons added
- [ ] Documentation updated
- [ ] Tested on development machine
- [ ] Backward compatibility verified

### Release Checklist

- [ ] Built for all target platforms
- [ ] Tested on each platform
- [ ] Code signed (if applicable)
- [ ] Virus scanned (Windows)
- [ ] Notarized (macOS)
- [ ] Release notes written
- [ ] Git tag created
- [ ] Uploaded to distribution channel
- [ ] Announcement prepared

### Build Optimization Tips

1. **Use compression:** `"compression": "maximum"`
2. **Exclude unnecessary files:** Configure `files` array
3. **Use ASAR archives:** `"asar": true`
4. **Minimize dependencies:** Remove unused packages
5. **Enable source maps:** For debugging only (`"compression": "store"`)

---

## Support & Resources

**Official Documentation:**
- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder Documentation](https://www.electron.build/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

**Community Resources:**
- [Electron GitHub Discussions](https://github.com/electron/electron/discussions)
- [Stack Overflow - Electron](https://stackoverflow.com/questions/tagged/electron)
- [Reddit - r/electronjs](https://www.reddit.com/r/electronjs/)

**Build Tools:**
- [electron-forge](https://www.electronforge.io/)
- [electron-packager](https://github.com/electron/electron-packager)
- [AppImage](https://appimage.org/)

---

**Last Updated:** 2025-05-15  
**Electron Version:** 42.1.0  
**electron-builder Version:** 26.8.1  
**Node.js Version:** 18+