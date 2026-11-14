# 🏛️ Srujaan Institute Management System (`SSMI CRM V3`)
### Luxury Enterprise Multi-Theme PWA Suite • 100% Offline-First Architecture

---

## 🌟 Executive Overview
**SSMI CRM V3** is an ultra-premium, full-stack, sovereign Institute Management Platform designed to benchmark fintech leaders like Stripe, Linear, and Mercury. Built with an offline-first philosophy, it operates completely standalone using native **HTML5 IndexedDB v5** as its primary source of truth, requiring zero npm dependencies, build steps, or internet connectivity to execute.

---

## 📁 Segregated Modular Project Structure

The codebase is organized into cleanly segregated, decoupled modules:

```text
SSMI CRM V3/
├── index.html                   # Clean, high-performance HTML5 entry shell
├── manifest.json                # PWA Web Application Manifest (Standalone display)
├── sw.js                        # Service Worker featuring Cache-First offline strategy
├── README.md                    # System documentation and operational manual
│
├── css/                         # Segregated Design System & Styling Engine
│   ├── themes.css               # 4-Theme Token Engine (Premium White, Royal Dark, Midnight, Custom Accent)
│   ├── layout.css               # Application shell, grid system, responsive breakpoints, mobile bottom dock
│   ├── components.css           # Luxury cards, buttons, badges, tables, modals, calendar grids, variable chips
│   └── print.css                # Precision A4 print stylesheets for tax receipts, certificates & dossiers
│
└── js/                          # Segregated JavaScript Architecture (Clean Dependency Order)
    ├── config.js                # System constants, i18n trilingual dictionary, 46 WhatsApp preset scenarios
    ├── data.js                  # Consolidated factory seed datasets (Pune branches, sample students, courses)
    ├── db.js                    # Native IndexedDB v5 transactional storage engine (11 object stores) & sync queues
    ├── utils.js                 # Formatting (INR currency), XSS sanitization, UPI QR, toasts, modals, CSV exports
    ├── app.js                   # Application lifecycle controller, tab routing, theme/language orchestrator
    └── modules/                 # Dedicated Business Domain Modules
        ├── dashboard.js         # Command Dashboard: dynamic greeting, 8 live KPIs, pipeline velocity charts
        ├── students.js          # Student directory, debounced search, faceted filters, 360° student dossier
        ├── batches.js           # Courses, batches, lecture timetables, and batch student rosters
        ├── attendance.js        # Attendance hub: 1-click date navigation, batch register, "Mark All Present"
        ├── leads.js             # Visual CRM: 10-stage drag-and-drop Kanban pipeline + high-density table
        ├── whatsapp.js          # WhatsApp click-to-chat studio, variable interpolator toolbar, media attachments
        ├── daily_updates.js     # Daily broadcast queue, duplicate prevention, recipient generator
        ├── fees.js              # Financial ledger, installment calculator, print-ready A4 tax receipts
        ├── certificates.js      # Certificate issuance, live preview, printable templates & QR verification
        ├── staff_portal.js      # Faculty directory, permission matrices, and student self-service portal
        ├── ai_center.js         # Deterministic offline natural-language query assistant & predictive corpus
        ├── settings.js          # 12-Pillar Master Settings, live letterhead preview, media library, cloud DB tester
        └── lectures_and_reports.js # Calendar grids (Day/Week/Month), conflict detector, executive SVG charts
```

---

## 🚀 How to Run the Application

### Option 1: Direct One-Click Browser Launch (Recommended)
Simply double-click `index.html` in Windows Explorer or open:
```text
file:///c:/Users/Admin/Downloads/SSMI%20CRM%20V3/index.html
```
- **Zero build tools required**: Runs immediately in Google Chrome, Microsoft Edge, Brave, Mozilla Firefox, or Safari.
- **Zero CORS friction**: All scripts use clean browser-native dependency ordering.

### Option 2: Run via Any Local HTTP Server
If you prefer running via a local web server (e.g. for PWA installation):
```powershell
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# VS Code
Right-click index.html -> "Open with Live Server"
```
Navigate to `http://localhost:8080` in your browser.

---

## 🎨 Multi-Theme Token Engine
The application provides 4 switchable luxury design themes configured via `data-theme` on the root document:
1. **Premium White (Default)**: Bright ivory backdrop (`#F7F8FA`), pure white elevated cards, rich charcoal text, and micro-neon electric blue accents.
2. **Royal Dark**: Obsidian surfaces (`#0D1117`), graphite cards (`#161B22`), and crisp hairline borders (`rgba(255,255,255,0.08)`).
3. **Midnight**: Saturated navy-slate (`#0B0F19`), electric cyan accents (`#06B6D4`), and subtle blue-glow elevations.
4. **Custom Accent**: Real-time interactive brand color picker dynamically populating `--user-brand-hue` across buttons, pills, active states, and focus rings.

---

## 💾 Database & Offline Persistence
- **Primary Engine**: Native HTML5 IndexedDB (`SrujaanIMS_IndexedDB_v5`, Version 5).
- **11 Object Stores**:
  - `app_state_store` — Core application settings and preferences
  - `students` — Enrolled student records, course history, fee ledgers
  - `batches` — Active batches, timetables, and student enrollments
  - `courses` — Curriculum, pricing, and duration metadata
  - `leads` — CRM inquiries, stages, notes, and follow-up schedules
  - `certificates` — Issued completion certificates with unique serials
  - `templates` — 46 trilingual WhatsApp communication templates
  - `auditLogs` — Immutable chronological compliance log
  - `syncQueue` — Offline mutation queue for cloud reconciliation
  - `mediaLibrary` — Brochures, syllabi, fee receipts, and branding images
  - `branches` — Multi-branch infrastructure (Shivajinagar, Kothrud, Hadapsar, Hinjewadi)
- **Synchronous Mirror**: Real-time secondary backup mirrored to `localStorage` for instant boot hydration.

---

## 🛡️ Verified Backups
- Baseline Untouched Backup: `srujaan_institute_management_system_backup_v4.html`
- Pre-Overhaul Monolith Backup: `srujaan_institute_management_system_backup_v5_pre_overhaul.html`
- Complete Monolith Snapshot: `index_monolithic_v5_complete.html`

---
*Developed with Advanced Agentic Coding by Google DeepMind.*
