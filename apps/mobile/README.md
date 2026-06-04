# WorkZilla Mobile

Expo-based mobile app scaffold for Android and iOS.

## Goals

- Single app for multiple WorkZilla products
- Mobile-first UI for forms, cards, lists, and product switching
- Dynamic theme from org admin branding via `/api/public/branding/`

## Start

```bash
cd apps/mobile
npm install
npm run dev
```

## Preview Options

- Expo Go on a real device
- Android Emulator
- iOS Simulator
- Web preview for quick layout checks

## Current Foundation

- Expo Router app shell
- Tabs for home, products, and profile
- SaaS admin default theme before login
- Org admin theme switch after login via `/api/auth/me`
- Mobile table/card demo
