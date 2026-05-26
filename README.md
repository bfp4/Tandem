# Tandem

Tandem is a cross-platform mobile app for coordinating recurring rides between riders and drivers. It combines role-based onboarding, schedule-aware matching, live ride coordination, in-app messaging, ratings, and Firebase-backed automation into one mobile-first experience.

## Project Highlights

- Built a full-stack React Native application with Expo Router, TypeScript, Firebase Auth, Firestore, Storage, and Cloud Functions.
- Designed rider and driver workflows for profile setup, availability management, ride requests, confirmations, cancellations, ride history, and ratings.
- Implemented a custom matching engine that ranks candidates by overlapping schedules, proximity, ride count, and user ratings.
- Added real-time product features with Firestore listeners, including pending ride requests, conversations, unread message counts, and notification state.
- Integrated mobile-native functionality through maps, location permissions, image picking, haptics, and Expo development builds.

## Tech Stack

**Mobile:** Expo, React Native, Expo Router, React Navigation, TypeScript  
**Backend:** Firebase Authentication, Cloud Firestore, Firebase Storage, Cloud Functions  
**Maps and Location:** React Native Maps, Expo Location, GeoFire, OSRM route estimates  

## Core Features

### Rider and Driver Profiles

Users can create an account, choose rider or driver roles, complete profile details, add profile photos, and maintain role-specific information such as vehicle details and schedule preferences.

### Schedule-Aware Matching

Tandem compares rider commute needs against driver availability windows, filters out conflicting confirmed rides, applies a distance threshold, and ranks matches with a weighted score.

### Ride Request Lifecycle

Riders and drivers can create, accept, deny, cancel, and track ride requests. Confirmed requests generate ride confirmation records that support active ride coordination and historical ride tracking.

### Real-Time Messaging

Matched users can start conversations, exchange messages, see unread message counts, and keep chat previews synchronized through Firestore subscriptions.

### Ratings and History

After rides, users can submit ratings and comments. Firebase Cloud Functions maintain aggregate rating and ride count fields so profiles stay up to date without client-side trust in derived data.

### Backend Automation

Cloud Functions handle lifecycle work such as user document creation and cleanup, rating aggregation, ride request updates, ride confirmation updates, expired schedule blocks, and scheduled ride activation.

## Architecture

```text
app/            Expo Router screens and navigation
components/     Reusable forms, cards, maps, inputs, and display components
config/         Firebase client initialization
context/        App-wide React context
functions/      Firebase Cloud Functions and scheduled backend jobs
services/       Firestore data access and domain workflows
types/          Shared TypeScript models
utils/          Routing, drive-time, and formatting helpers
```

The app keeps screen components focused on UI and delegates business logic to service modules. Firestore stores the primary application state, while Cloud Functions enforce backend-owned updates for derived user and ride data.

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm
- Android Studio for Android development
- Xcode for iOS development on macOS
- A Firebase project with Auth, Firestore, Storage, and Cloud Functions configured
- A Google Maps API key for native map support

This project uses native modules such as `react-native-maps` and `expo-dev-client`, so a development build is recommended instead of Expo Go.

### Installation

```bash
npm install
```

Create a local environment file with the Firebase and Maps values used by `config/firebase.ts` and `app.config.ts`:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

### Run the App

```bash
npm run android
```

```bash
npm run ios
```

Start Metro without launching a native build:

```bash
npm start
```

Run the limited web target:

```bash
npm run web
```

### Firebase Functions

```bash
cd functions
npm install
npm run build
```

Run locally with Firebase emulators:

```bash
npm run serve
```

Deploy functions:

```bash
npm run deploy
```

## Quality Checks

```bash
npm run lint
```

```bash
cd functions
npm run lint
npm run build
```

## Status

Tandem is a portfolio project focused on demonstrating end-to-end mobile product development: authenticated user flows, real-time data synchronization, geospatial matching, native mobile integrations, and serverless backend automation.
