# Citation Shield: AI Verify — TODO

## Branding & Setup
- [x] Generate app icon (shield with checkmark, navy/gold)
- [x] Update theme.config.js with navy/gold palette
- [x] Update app.config.ts with app name and logo URL
- [x] Update tailwind.config.js colors

## Navigation
- [x] Configure 3-tab layout: Home, History, Settings
- [x] Add icon mappings: house.fill, clock.fill, gearshape.fill
- [x] Create modal stack for Upload → Processing → Results → Detail

## Screens
- [x] Onboarding screen (3-slide carousel)
- [x] Home / Dashboard screen
- [x] Upload / Input screen (file, camera, paste)
- [x] Processing / scanning screen
- [x] Results screen with citation list
- [x] Citation Detail screen
- [x] Paywall screen (Pro + Law Firm tiers)
- [x] Settings screen

## Core Features
- [x] Document picker integration (PDF, DOCX, TXT)
- [x] Text paste input
- [x] AI citation extraction and verification (server LLM via tRPC)
- [x] Citation status badges (valid/warning/invalid)
- [x] Share report via system share sheet
- [x] Usage tracking (free tier limit: 3 scans/month)
- [x] AsyncStorage for scan history

## Monetization
- [x] Paywall UI with Pro ($29/mo) and Law Firm ($99/mo) tiers
- [ ] Apple IAP integration (react-native-purchases / RevenueCat)
- [x] Subscription status tracking (AsyncStorage)

## EAS & Deployment
- [ ] Configure eas.json for iOS production build
- [ ] Set Apple Team ID and App Store Connect App ID
- [ ] Push to GitHub (ChristopherSwofford418/flostudio)
- [ ] Trigger EAS build via exp.dev
- [ ] Submit to App Store Connect (App ID: 6780260927)
