# Citation Shield: AI Verify — Design Plan

## App Concept
An AI-powered legal citation verification tool. Users upload or paste legal documents, and the app scans citations for accuracy, identifies broken or fabricated references, and returns a detailed verification report.

---

## Color Palette

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `primary` | `#1A3C6E` | `#4A7FC1` | Deep navy — authority, trust, legal |
| `background` | `#F7F8FA` | `#0F1117` | Off-white / near-black |
| `surface` | `#FFFFFF` | `#1A1D27` | Cards, panels |
| `foreground` | `#0D1B2A` | `#E8EDF5` | Primary text |
| `muted` | `#6B7A8D` | `#8A96A8` | Secondary text |
| `border` | `#DDE3EC` | `#2A3347` | Dividers |
| `success` | `#16A34A` | `#4ADE80` | Valid citations |
| `warning` | `#D97706` | `#FBBF24` | Questionable citations |
| `error` | `#DC2626` | `#F87171` | Invalid / hallucinated citations |
| `accent` | `#C8A84B` | `#E2C97E` | Gold accent — premium, legal prestige |

---

## Screen List

1. **Onboarding** — 3-slide value prop carousel + CTA to start
2. **Home (Dashboard)** — Recent scans, quick upload button, usage stats
3. **Upload / Input** — Document picker, camera scan, or paste text
4. **Processing** — Animated scanning indicator with progress
5. **Results** — Citation-by-citation breakdown with status badges
6. **Citation Detail** — Deep dive on a single citation: source, verdict, suggested fix
7. **Paywall** — Subscription tiers (Free / Pro / Law Firm)
8. **Settings** — Account, subscription status, theme, about

---

## Primary Content & Functionality

### Home (Dashboard)
- Header: "Citation Shield" logo + greeting
- Quick action card: "Scan New Document" (primary CTA)
- Recent scans list (FlatList): document name, date, citation count, pass/fail badge
- Usage meter: "X of Y free scans used this month"
- Upgrade banner if on free tier

### Upload / Input
- Three input methods via segmented control:
  - **File** — expo-document-picker (PDF, DOCX, TXT)
  - **Camera** — expo-camera for scanning printed documents
  - **Paste** — multi-line TextInput for raw text
- "Scan Citations" primary button
- Character/page count indicator

### Processing
- Full-screen animated shield icon with pulse effect
- Progress bar with status messages: "Extracting citations…", "Verifying sources…", "Generating report…"
- Cancel button

### Results
- Summary card: total citations, valid count, warning count, error count
- FlatList of citations, each showing:
  - Citation text (truncated)
  - Status badge: Valid (green) / Questionable (amber) / Invalid (red)
  - Tap to expand detail
- Share / Export button (PDF report)
- "Scan Another" button

### Citation Detail
- Full citation text
- AI verdict with confidence score
- Source URL (if found) with "Open" button
- Suggested correction (if invalid)
- "Mark as Reviewed" toggle

### Paywall
- Three-tier card layout: Free / Pro ($9.99/mo) / Law Firm ($49.99/mo)
- Feature comparison table
- Apple IAP purchase button
- Restore purchases link

### Settings
- Profile section (name, email)
- Subscription status + manage
- Theme toggle (light/dark)
- Notification preferences
- Privacy Policy / Terms of Service links
- App version

---

## Key User Flows

### Flow 1: First-time User
Onboarding slide 1 → slide 2 → slide 3 → "Get Started" → Home

### Flow 2: Scan a Document
Home → tap "Scan New Document" → Upload screen → select file → tap "Scan Citations" → Processing → Results → tap citation → Citation Detail

### Flow 3: Hit Free Limit
Results → "You've used all free scans" → Paywall → select Pro → Apple IAP → confirmation → Results unlocked

### Flow 4: Export Report
Results → tap Share → system share sheet → save PDF or send via email

---

## Navigation Structure

```
Tab Bar:
  - Home (house.fill)
  - History (clock.fill)
  - Settings (gearshape.fill)

Modal Stacks:
  - Upload → Processing → Results → Citation Detail
  - Paywall (presented as modal sheet)
```

---

## Branding Notes
- Shield icon with a checkmark — conveys protection and verification
- Navy + gold color scheme — evokes legal authority and premium quality
- Clean, minimal typography — SF Pro (system font) for iOS-native feel
- No rounded bubbly elements — sharp, professional card corners (radius 12)
