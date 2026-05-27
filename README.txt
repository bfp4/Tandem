# Tandem

Tandem is a cross-platform mobile application built with **Expo** and **React Native** for coordinating rides.

---

## Prerequisites

Install the following before running the app:

| Tool | Notes |
|------|--------|
| **Node.js** | Use an [LTS release](https://nodejs.org/) (v18 or newer recommended). |
| **npm** | Included with Node.js. |
| **Android Studio** | Required to run on an Android emulator or device via USB debugging ([Expo Android setup](https://docs.expo.dev/workflow/android-studio-emulator/)). |
| **Xcode** (macOS only) | Required for the iOS Simulator ([Expo iOS setup](https://docs.expo.dev/workflow/ios-simulator/)). |

This project includes **`expo-dev-client`** and native modules such as **`react-native-maps`**. Those features are **not fully supported in the Expo Go sandbox**. Plan to use a **development build** (see below) or a physical device with the dev client installed.

---

## 1. Install dependencies

From the repository root:

```bash
npm install
```

---

## 2. Run the mobile application

### Option A — Development build (recommended)

Build and launch the app on a simulator or connected device (installs the dev client the first time):

**Android**

```bash
npm run android
```

**iOS** (macOS only)

```bash
npm run ios
```

### Option B — Start the Metro bundler only

```bash
npm start
```

Equivalent:

```bash
npx expo start
```

Then:

- Press **`a`** for Android emulator / device (with dev client installed).
- Press **`i`** for iOS simulator (macOS, with dev client installed).
- Scan the QR code with a device that has your **development build** installed (not Expo Go, for full native support).

### Option C — Web (limited)

Some flows may differ on web (maps and other native pieces are mobile-first):

```bash
npm run web
```

---

## 3. Linting

```bash
npm run lint
```

---

## 4. Production builds (EAS)

This app includes an `eas.json` profile for [EAS Build](https://docs.expo.dev/build/introduction/). Building release binaries requires an Expo account and EAS CLI configuration; use `eas build` when you are ready to distribute installable packages.

---

## Repository layout (high level)

| Path | Purpose |
|------|--------|
| `app/` | Expo Router screens and navigation |
| `services/` | Data and domain logic used by the UI |
| `components/` | Reusable UI pieces |

---

## Troubleshooting

- **Metro / bundler errors after pulling changes:** Delete `node_modules` and run `npm install` again from the root.
- **Maps or native modules fail in Expo Go:** Use a **development build** (`npm run android` / `npm run ios`) instead of Expo Go.

For general Expo workflow questions, see the [Expo documentation](https://docs.expo.dev/).
