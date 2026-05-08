# PaySeal Desktop

Seal payslips directly from your desktop. Right-click any PDF → Open with PaySeal.

## Setup

```bash
npm install
npm start       # Run in development
```

## Build

```bash
npm run build:win   # Windows .exe installer
npm run build:mac   # Mac .dmg
```

The built installer will be in the `dist/` folder.

## Register as default PDF handler (Windows)

After installing, right-click any PDF → "Open with" → "Choose another app" → select PaySeal → check "Always use this app".

Or run the installer — it registers automatically.

## How it works

1. Login with your PaySeal employer account
2. Drop a PDF payslip onto the window (or click to browse)
3. Enter the employee's email
4. Click Seal — the payslip is certified and the employee is notified

The app calls the same API as payseal.io — no separate backend needed.

## Assets needed

Before building, add icons to the `assets/` folder:
- `assets/icon.png` — 512x512 PNG
- `assets/icon.ico` — Windows icon
- `assets/icon.icns` — Mac icon

You can generate .ico and .icns from a PNG using:
- https://www.icoconverter.com/ (Windows)
- https://cloudconvert.com/png-to-icns (Mac)
