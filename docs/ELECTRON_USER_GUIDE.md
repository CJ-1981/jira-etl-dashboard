# JIRA ETL Dashboard - Desktop Application User Guide

Complete user guide for the JIRA ETL Dashboard desktop application.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Installation](#installation)
- [First Launch](#first-launch)
- [Application Features](#application-features)
- [Data Management](#data-management)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Getting Started

### System Requirements

#### **Windows**
- **OS:** Windows 10 (version 1903) or later
- **RAM:** 4GB minimum, 8GB recommended
- **Disk Space:** 500MB for application, 2GB+ for data
- **Display:** 1280x720 minimum resolution

#### **macOS**
- **OS:** macOS 10.15 (Catalina) or later
- **RAM:** 4GB minimum, 8GB recommended
- **Disk Space:** 500MB for application, 2GB+ for data
- **Display:** 1280x720 minimum resolution

#### **Linux**
- **OS:** Ubuntu 20.04+, Fedora 35+, Debian 11+, or equivalent
- **RAM:** 4GB minimum, 8GB recommended
- **Disk Space:** 500MB for application, 2GB+ for data
- **Display:** 1280x720 minimum resolution

### Network Requirements

- **Internet Connection:** Required for JIRA API access
- **JIRA Access:** Valid JIRA credentials and API token
- **Firewall:** Allow outbound connections to your JIRA instance

---

## Installation

### Windows Installation

#### **Method 1: Installer (Recommended)**

1. Download `JIRA ETL Dashboard Setup 0.2.0.exe`
2. Double-click the installer
3. Choose installation directory (default: `C:\Users\<Username>\AppData\Local\JIRA ETL Dashboard`)
4. Select "Create desktop shortcut"
5. Click "Install"
6. Launch from desktop shortcut or Start menu

#### **Method 2: Portable**

1. Download `JIRA ETL Dashboard 0.2.0.exe`
2. Place in any directory
3. Double-click to run
4. No installation required

### macOS Installation

1. Download `JIRA ETL Dashboard-0.2.0.dmg`
2. Double-click the DMG file to mount
3. Drag "JIRA ETL Dashboard" to Applications folder
4. Eject the DMG
5. Launch from Applications folder

**Note:** You may need to right-click and select "Open" on first launch due to macOS security settings.

### Linux Installation

#### **AppImage (Universal)**

1. Download `jira-etl-dashboard-0.2.0.AppImage`
2. Make it executable:
   ```bash
   chmod +x jira-etl-dashboard-0.2.0.AppImage
   ```
3. Run directly:
   ```bash
   ./jira-etl-dashboard-0.2.0.AppImage
   ```

#### **Debian/Ubuntu (.deb)**

1. Download `jira-etl-dashboard_0.2.0_amd64.deb`
2. Install using package manager:
   ```bash
   sudo dpkg -i jira-etl-dashboard_0.2.0_amd64.deb
   ```
3. Launch from application menu

#### **Fedora/RHEL (.rpm)**

1. Download `jira-etl-dashboard-0.2.0-1.x86_64.rpm`
2. Install using package manager:
   ```bash
   sudo rpm -i jira-etl-dashboard-0.2.0-1.x86_64.rpm
   ```
3. Launch from application menu

---

## First Launch

### Initial Configuration

When you first launch the application, you'll see the **Settings** page:

1. **JIRA Instance URL**
   - Enter your JIRA instance URL (e.g., `https://yourcompany.atlassian.net`)
   - For on-premise JIRA: `https://jira.yourcompany.com`

2. **Authentication**
   - **Email:** Your JIRA login email
   - **API Token:** Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

3. **Database Selection**
   - **SQLite** (default): Embedded database, no setup required
   - **PostgreSQL:** External database for multi-user access

4. **Click "Save Settings"**

### Generating JIRA API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Label it: "JIRA ETL Dashboard"
4. Copy the token and paste it in the application settings
5. Click "Save Settings"

---

## Application Features

### Dashboard Overview

The main dashboard provides:

#### **KPI Analytics**
- **Total Issues:** Overview of all tracked issues
- **Closed Issues:** Completed work
- **In Progress:** Active work items
- **Blockers:** Critical blocking issues

#### **Filtering Options**
- **Date Range:** Select time periods for analysis
- **Issue Owner Team:** Filter by team assignments
- **Project:** Focus on specific projects
- **Issue Type:** Bugs, stories, tasks, etc.

#### **Visual Charts**
- **Trend Analysis:** Time-based charts showing issue trends
- **Team Performance:** Team-specific metrics
- **Priority Distribution:** Issue priority breakdown
- **Status Flow:** Issue status transitions

### Data Extraction

#### **Manual Extraction**
1. Navigate to **Data Extraction** page
2. Select **JIRA Extraction**
3. Configure extraction parameters:
   - **Date Range:** Start and end dates
   - **Projects:** Select specific projects or "All Projects"
   - **Issue Types:** Choose which issue types to extract
4. Click **"Start Extraction"**
5. Monitor progress in real-time
6. Data is stored in local database

#### **Scheduled Extractions**
1. Go to **Settings** → **Data Extraction**
2. Enable **Background Polling**
3. Set polling interval (default: every 15 minutes)
4. Configure extraction parameters
5. Click **"Save Schedule"**

### Saved Views

#### **Creating Saved Views**
1. Configure your desired filters and chart settings
2. Click **"Save View"** button
3. Enter view name and description
4. Click **"Save"**

#### **Loading Saved Views**
1. Navigate to **Saved Views** page
2. Select a view from the list
3. Dashboard loads with saved configuration

#### **Managing Views**
- **Edit:** Modify existing saved views
- **Delete:** Remove unwanted views
- **Export:** Share views with team members
- **Import:** Import views shared by others

### Export & Reports

#### **Generate Reports**
1. Navigate to **KPI Analytics** dashboard
2. Configure your filters
3. Click **"Export Report"**
4. Choose format:
   - **PDF:** Printable report with charts
   - **Excel:** Raw data for further analysis
   - **PowerPoint:** Presentation-ready slides

#### **Custom Reports**
1. Select date ranges and filters
2. Choose specific metrics
3. Add custom annotations
4. Generate and download

---

## Data Management

### Database Management

#### **SQLite (Default)**
- **Location:** Stored in app data directory
- **Backup:** Automatic backups before major operations
- **Restore:** Settings → Database → Restore from Backup

#### **PostgreSQL (Multi-User)**
- **Setup:** Requires PostgreSQL server configuration
- **Connection:** Configure in Settings → Database
- **Performance:** Better for large datasets and multiple users

### Data Retention

Configure automatic data cleanup:

1. Go to **Settings** → **Data Management**
2. Set **Retention Period:** (e.g., 90 days)
3. Enable **Auto Cleanup**
4. Choose cleanup frequency
5. Click **"Save Settings"**

### Data Backup & Restore

#### **Manual Backup**
1. Navigate to **Settings** → **Database**
2. Click **"Create Backup"**
3. Choose backup location
4. Application creates backup file

#### **Restore from Backup**
1. Navigate to **Settings** → **Database**
2. Click **"Restore from Backup"**
3. Select backup file
4. Confirm restoration

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New extraction |
| `Ctrl/Cmd + S` | Save current view |
| `Ctrl/Cmd + L` | Load saved view |
| `Ctrl/Cmd + D` | Go to dashboard |
| `Ctrl/Cmd + E` | Open data extraction |
| `Ctrl/Cmd + ,` | Open settings |

### Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + 1` | Dashboard |
| `Ctrl/Cmd + 2` | Data Extraction |
| `Ctrl/Cmd + 3` | Saved Views |
| `Ctrl/Cmd + 4` | Settings |

### Data Interaction

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + R` | Refresh data |
| `Ctrl/Cmd + F` | Focus search |
| `Escape` | Clear filters |
| `Ctrl/Cmd + Z` | Undo last filter change |

---

## Troubleshooting

### Common Issues

#### **Application Won't Start**

**Symptoms:** Application fails to launch or crashes immediately

**Solutions:**
1. **Check logs:** View error logs in Settings → Troubleshooting
2. **Clear cache:** Settings → Advanced → Clear Application Cache
3. **Reinstall:** Uninstall and reinstall the application
4. **Check permissions:** Ensure write access to app data directory

#### **Connection Issues**

**Symptoms:** "Cannot connect to JIRA" error

**Solutions:**
1. **Verify URL:** Check JIRA instance URL in settings
2. **Test API token:** Regenerate API token if needed
3. **Network connectivity:** Ensure internet connection is working
4. **Firewall:** Allow application through firewall
5. **VPN:** Ensure VPN is connected if using internal JIRA

#### **Data Extraction Fails**

**Symptoms:** Extraction stops or shows errors

**Solutions:**
1. **Check date range:** Ensure date range is valid
2. **Verify permissions:** Ensure JIRA account has read access
3. **API limits:** JIRA may have rate limits, try smaller date ranges
4. **Network timeout:** Increase timeout in settings
5. **Restart extraction:** Stop and restart the extraction

#### **Database Errors**

**Symptoms:** Database corruption or access errors

**Solutions:**
1. **Check disk space:** Ensure sufficient disk space
2. **Repair database:** Settings → Database → Repair Database
3. **Restore backup:** Restore from recent backup
4. **Reinitialize:** Settings → Database → Reinitialize (clears all data)

#### **Charts Not Displaying**

**Symptoms:** Charts appear blank or show errors

**Solutions:**
1. **Clear browser cache:** Settings → Advanced → Clear Cache
2. **Update application:** Check for updates
3. **Disable extensions:** Some browser extensions may interfere
4. **Check data:** Ensure data extraction completed successfully

### Performance Issues

#### **Slow Application**

**Optimization Tips:**
1. **Reduce data range:** Use smaller date ranges
2. **Clear old data:** Enable data retention cleanup
3. **Close other applications:** Free up system resources
4. **Update application:** Ensure latest version
5. **Restart application:** Clear memory by restarting

#### **High Memory Usage**

**Solutions:**
1. **Reduce cache size:** Settings → Advanced → Reduce Cache Size
2. **Limit data:** Use filters to reduce dataset
3. **Restart regularly:** Close and reopen application daily
4. **Check background processes:** Disable scheduled extractions

---

## FAQ

### General Questions

**Q: Is my data secure?**
A: Yes, all data is stored locally on your machine. JIRA API tokens are encrypted and never shared.

**Q: Can I use multiple JIRA instances?**
A: Currently, the application supports one JIRA instance. You can change the instance in settings.

**Q: Does this work with JIRA Cloud and JIRA Server?**
A: Yes, both JIRA Cloud and on-premise JIRA Server instances are supported.

**Q: How much data can I store?**
A: Limited by your disk space. SQLite can handle millions of records effectively.

**Q: Can multiple users access the same data?**
A: With SQLite, no. Use PostgreSQL for multi-user access.

### Technical Questions

**Q: What technology is this built with?**
A: Electron + Next.js + React, using SQLite or PostgreSQL for data storage.

**Q: Does it work offline?**
A: Yes, but requires internet for JIRA data extraction. Previously extracted data is available offline.

**Q: How often should I extract data?**
A: Depends on your needs. Daily or weekly extraction is typical for most teams.

**Q: Can I customize the dashboard?**
A: Yes, use Saved Views to create custom dashboard configurations.

**Q: How do I report bugs or request features?**
A: Visit [GitHub Issues](https://github.com/CJ-1981/jira-etl-dashboard/issues)

### License & Usage

**Q: Is this free to use?**
A: Yes, this is open-source software available under the MIT license.

**Q: Can I use this for commercial purposes?**
A: Yes, the MIT license allows commercial use.

**Q: Can I modify the source code?**
A: Yes, you can fork and modify the code for your needs.

---

## Getting Help

### Documentation

- **Build Guide:** See `docs/ELECTRON_BUILD_GUIDE.md` for build instructions
- **API Documentation:** Check project README for API details
- **Development Guide:** See project documentation for contributing

### Community Support

- **GitHub Issues:** Report bugs and request features
- **Discussions:** Ask questions and share ideas
- **Wiki:** Community-contributed guides and tips

### Professional Support

For enterprise support or custom development, contact the development team.

---

## Version History

### Version 0.2.0
- Initial Electron desktop application release
- Multi-platform support (Windows, macOS, Linux)
- SQLite and PostgreSQL database support
- JIRA API integration
- KPI analytics dashboard
- Saved views functionality
- Export to PDF, Excel, PowerPoint

### Future Plans
- [ ] Real-time data updates
- [ ] Advanced reporting features
- [ ] Custom dashboard widgets
- [ ] Team collaboration features
- [ ] Mobile application

---

**Application Version:** 0.2.0  
**Document Version:** 1.0  
**Last Updated:** 2025-05-15

For the latest updates and documentation, visit the [GitHub Repository](https://github.com/CJ-1981/jira-etl-dashboard).