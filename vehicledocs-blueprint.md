# VehicleDocs — Full Project Blueprint
> This document is the single source of truth for building the VehicleDocs web application. It covers every requirement, data model, API contract, integration detail, and build phase needed for a complete implementation. Use this file as the primary reference when generating code with GitHub Copilot.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Confirmed Requirements](#2-confirmed-requirements)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Authentication](#5-authentication)
6. [Database Schema](#6-database-schema)
7. [Google Drive Integration](#7-google-drive-integration)
8. [QR Code System](#8-qr-code-system)
9. [Access Control Model](#9-access-control-model)
10. [Pages & Routes](#10-pages--routes)
11. [API Endpoints](#11-api-endpoints)
12. [UI & Component Plan](#12-ui--component-plan)
13. [Environment Variables](#13-environment-variables)
14. [Build Phases](#14-build-phases)
15. [Security Checklist](#15-security-checklist)
16. [Edge Cases & Error Handling](#16-edge-cases--error-handling)

---

## 1. Project Overview

**VehicleDocs** is a multi-user SaaS web application that allows registered users to:

- Sign in using their Google account
- Register their vehicles (Car, Truck, or Bike) with a type, nickname, and license plate
- Automatically create a dedicated folder in their own Google Drive for each vehicle
- Generate a unique, printable QR code for each vehicle
- Share vehicle document access with specific other registered users
- Allow authorized users to scan the QR code, log in, and be redirected directly to the Google Drive folder containing that vehicle's documents

The app does **not** store any documents itself. It acts as an **access gateway** — documents live in the user's own Google Drive, and the app manages identity, access control, and QR-based navigation.

**Audience:** Multiple independent users (SaaS model)
**Pricing:** Free for all users
**Goal:** MVP that is fully functional, secure, and deployable to Vercel

---

## 2. Confirmed Requirements

### 2.1 Authentication
- Users sign in exclusively via **Google OAuth (Sign in with Google)**
- No email/password registration — Google is the only auth provider
- On first sign-in, a new user record is created in the database
- On subsequent sign-ins, the existing user record is updated with fresh tokens
- Users must be authenticated to access any part of the app (no public pages except the QR landing page logic, which redirects to login if unauthenticated)

### 2.2 Vehicle Registration
- Each registered user can add one or more vehicles
- Vehicle fields collected at registration:
  - **Type** — dropdown with exactly three options: `Car`, `Truck`, `Bike`
  - **Nickname** — free text, user-defined label (e.g. "My White Toyota")
  - **License Plate** — free text (no format enforcement at MVP stage)
- No additional vehicle fields are required at MVP
- A user can delete their own vehicles
- A user can view a list of all their registered vehicles on their dashboard

### 2.3 Google Drive Integration
- Each user connects their own Google Drive account (via OAuth scopes during sign-in)
- When a vehicle is registered, the app **automatically creates a new folder** in that user's Google Drive — the user does not pick an existing folder
- The folder is named using the format: `VehicleDocs — [Nickname] ([License Plate])`
  - Example: `VehicleDocs — My White Toyota (MH12AB1234)`
- The folder is kept **completely private** — no "anyone with link" permission is set. Only the app (using the owner's OAuth credentials server-side) can read and write to it
- The folder ID is saved in the database linked to that vehicle. The raw Drive folder URL is **never exposed** to the frontend or to any user directly
- **All document uploads go through the app.** Users upload files via the app's UI; the server receives the file and writes it to the owner's Drive folder using the owner's stored OAuth credentials
- **All document access goes through the app.** When a user wants to view or download a document, the server fetches it from Drive using the owner's credentials and either streams it to the user or generates a short-lived signed URL. No one accesses Drive directly
- Supported upload file types: PDF, JPG, JPEG, PNG, and common document formats (DOCX, XLSX). Maximum file size: 20 MB per file
- Document metadata (Drive file ID, file name, mime type, size, upload date) is stored in a `documents` table in the app database, linked to the vehicle

### 2.4 QR Code Generation
- A unique QR code is generated for each vehicle at the time of registration
- The QR code encodes the URL: `https://[APP_DOMAIN]/v/[vehicleId]`
  - `vehicleId` is the internal UUID of the vehicle record
- The QR code is generated as a **PNG image**
- The PNG is stored (Vercel Blob or equivalent) and its URL is saved in the `vehicles` table
- The owner can **download** the QR code PNG from their dashboard at any time
- The downloaded file should be named: `qr-[nickname]-[plate].png`
- The QR code does **not** expire

### 2.5 QR Scan & View Flow
- When the QR code URL (`/v/[vehicleId]`) is opened in a browser:
  - If the user is **not authenticated**: redirect to the login page, preserving the `vehicleId` so that after login they are returned to `/v/[vehicleId]`
  - If the user **is authenticated**:
    - Check if they are the vehicle owner OR have an entry in `access_grants` for this vehicle
    - If **authorized**: render the vehicle info page (see Section 10.3)
    - If **not authorized**: render a 403 "Access Denied" page
- After scanning and logging in, **all users — including the vehicle owner — see the same experience:**
  - Vehicle type (with an icon: car / truck / bike)
  - Vehicle nickname
  - License plate
  - Owner's full name
  - A **dropdown** listing all uploaded documents for that vehicle (showing file name and type)
  - A **"View Document"** button that becomes active once a document is selected from the dropdown
  - Clicking "View Document" opens the selected file in a new browser tab, streamed from the server via `/api/vehicles/[vehicleId]/documents/[documentId]/view`
  - If no documents have been uploaded yet, the dropdown is replaced with the message: *"No documents have been uploaded for this vehicle yet."*
- The QR scan page is intentionally minimal — it is a viewing-only experience for everyone. Document uploading and management for the owner happens separately on their dashboard manage page (`/vehicles/[vehicleId]`)
- Documents are fetched from the app's database and served from Drive via the server using the owner's credentials — no direct Drive URL is ever exposed
- The scan event is **logged** in an `access_logs` table (vehicle_id, scanned_by_user_id, timestamp)

### 2.6 Driving License (Personal Document)
- Each user can upload **one driving license document** tied to their own account — it is not linked to any vehicle
- The driving license is stored in a dedicated folder inside the user's own Google Drive, separate from all vehicle folders. The folder is named: `VehicleDocs — My Driving License`
- The document is **completely private** — only the authenticated user themselves can view it. No shared user, no vehicle access grant, and no other person can ever access it
- The user can replace the driving license at any time by uploading a new file — the old file is deleted from Drive and the database record is updated
- The user can also delete the driving license entirely
- Supported file types and size limit are the same as vehicle documents: PDF, JPG, JPEG, PNG, DOCX, XLSX — maximum 20 MB
- The driving license is accessible from a dedicated **"My License"** section on the user's dashboard — clearly separated from the vehicle list
- There is no QR code for the driving license. It is only accessible when the user is logged in to their own account through the dashboard

### 2.7 Access Sharing
- The vehicle owner can share a vehicle with any other **registered user** by entering their email address
- The app looks up the email in the `users` table — if no account exists for that email, an error message is shown: *"No account found for that email. The user must sign up first."*
- If found, an `access_grants` record is created: `{ vehicle_id, granted_to_user_id, granted_by_user_id }`
- The owner can see the list of users they have shared each vehicle with
- The owner can **revoke** access at any time, which deletes the `access_grants` record

**Shared users have strictly read-only access:**
- They can view the vehicle info page (type, nickname, plate, owner name)
- They can view the list of uploaded documents for that vehicle
- They can view (open in-browser) or download individual documents via the app — the server fetches the file from Drive using the owner's credentials and streams it to the shared user
- They **cannot** upload new documents
- They **cannot** delete any documents
- They **cannot** rename or modify any documents
- They **cannot** access Google Drive directly — all document interaction is mediated through the app's API
- They **cannot** share the vehicle further with other users
- They **cannot** edit any vehicle details (nickname, plate, type)

### 2.8 General
- The app is **free** — no subscription, no payment logic at MVP
- The app is **multi-user** — complete data isolation between users (a user only sees their own vehicles)
- The app must work on both **desktop and mobile** browsers (responsive design)
- All pages require authentication except: the landing/sign-in page and the `/v/[vehicleId]` route (which handles its own auth redirect)

---

## 3. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 14 (App Router) | Full-stack: handles frontend, API routes, and SSR in one repo |
| Auth | NextAuth.js v5 (Auth.js) | Native Google OAuth, session management, token handling |
| Database | PostgreSQL | Relational, handles access control well |
| DB Client | Prisma ORM | Type-safe queries, schema migrations, works with Next.js |
| DB Hosting | Supabase (free tier) | Managed PostgreSQL, easy setup, no server to maintain |
| Drive API | `googleapis` npm package | Official Google SDK for Drive API calls server-side |
| QR Generation | `qrcode` npm package | Server-side PNG generation, no external service needed |
| File Storage | Vercel Blob | Store QR code PNGs, free tier available |
| Styling | Tailwind CSS | Utility-first, fast to build responsive UIs |
| Hosting | Vercel | Native Next.js deployment, free tier, automatic HTTPS |
| Language | TypeScript | Type safety across the full stack |

### 3.1 Package List

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "next-auth": "^5.0.0",
    "@auth/prisma-adapter": "^1.0.0",
    "@prisma/client": "^5.0.0",
    "googleapis": "^140.0.0",
    "qrcode": "^1.5.3",
    "@vercel/blob": "^0.23.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/qrcode": "^1.5.5",
    "typescript": "^5.0.0"
  }
}
```

---

## 4. Project Structure

```
vehicledocs/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx               # Google Sign-In page
│   ├── (dashboard)/
│   │   ├── layout.tsx                 # Dashboard layout with nav
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Vehicle list + add vehicle
│   │   └── vehicles/
│   │       └── [vehicleId]/
│   │           ├── page.tsx           # Vehicle detail & manage page
│   │           └── share/
│   │               └── page.tsx       # Share management page
│   ├── v/
│   │   └── [vehicleId]/
│   │       └── page.tsx               # QR scan landing page (public route)
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts           # NextAuth handler
│   │   ├── vehicles/
│   │   │   ├── route.ts               # GET list, POST create
│   │   │   └── [vehicleId]/
│   │   │       ├── route.ts           # GET detail, DELETE
│   │   │       ├── qr/
│   │   │       │   └── route.ts       # GET QR PNG download
│   │   │       └── share/
│   │   │           ├── route.ts       # POST grant, GET list
│   │   │           └── [grantId]/
│   │   │               └── route.ts   # DELETE revoke
│   │   └── user/
│   │       └── route.ts               # GET current user info
│   ├── layout.tsx                     # Root layout
│   └── globals.css
├── components/
│   ├── auth/
│   │   └── SignInButton.tsx
│   ├── vehicles/
│   │   ├── VehicleCard.tsx
│   │   ├── AddVehicleForm.tsx
│   │   ├── VehicleTypeIcon.tsx
│   │   └── ShareManager.tsx
│   ├── qr/
│   │   └── QRDownloadButton.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       └── Badge.tsx
├── lib/
│   ├── auth.ts                        # NextAuth config
│   ├── prisma.ts                      # Prisma client singleton
│   ├── drive.ts                       # Google Drive API helpers
│   ├── qr.ts                          # QR code generation helpers
│   └── utils.ts                       # Shared utility functions
├── prisma/
│   └── schema.prisma                  # Database schema
├── types/
│   └── index.ts                       # Shared TypeScript types
├── middleware.ts                      # Route protection
├── .env.local                         # Environment variables (never commit)
├── .env.example                       # Template for env vars
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## 5. Authentication

### 5.1 NextAuth Configuration (`lib/auth.ts`)

- Provider: **Google** only
- Scopes required:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive.file`
    - This scope allows the app to create and manage only the files/folders it creates — it does **not** give access to the user's entire Drive
- After sign-in, store the `access_token` and `refresh_token` in the `users` table (encrypted)
- Use the `@auth/prisma-adapter` to sync NextAuth sessions with the Prisma `User` model
- Enable `account` and `session` strategies as needed by the adapter

### 5.2 Session Strategy

- Use **JWT sessions** (default for App Router) or **database sessions** via Prisma adapter
- The session object must expose: `user.id`, `user.email`, `user.name`, `user.image`
- The `user.id` must be the internal database UUID, not the Google ID

### 5.3 Route Protection (`middleware.ts`)

- Protect all routes under `/dashboard` and `/vehicles/*` and `/api/*` (except `/api/auth/*`)
- The `/v/[vehicleId]` route is **not** blocked by middleware — it handles its own auth redirect logic in the page component
- The `/login` page is always public
- Use NextAuth's `auth()` helper in the middleware to check session presence

### 5.4 Token Refresh

- Google access tokens expire after 1 hour
- When making Drive API calls, always attempt to refresh the access token using the stored `refresh_token` via the `googleapis` OAuth2 client before making the API call
- If refresh fails (e.g. user revoked app permissions), catch the error and prompt the user to reconnect their Google account

---

## 6. Database Schema

### 6.1 Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String    @id @default(cuid())
  googleId          String    @unique
  email             String    @unique
  name              String
  image             String?
  googleAccessToken  String?  // encrypted at rest
  googleRefreshToken String?  // encrypted at rest
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  vehicles          Vehicle[]           @relation("owner")
  accessGrants      AccessGrant[]       @relation("grantedTo")
  grantsGiven       AccessGrant[]       @relation("grantedBy")
  accessLogs        AccessLog[]
  drivingLicense    DrivingLicense?     // one-to-one, optional until uploaded

  // NextAuth required fields
  accounts          Account[]
  sessions          Session[]
}

model Vehicle {
  id              String    @id @default(cuid())
  ownerId         String
  owner           User      @relation("owner", fields: [ownerId], references: [id], onDelete: Cascade)

  type            VehicleType
  nickname        String
  licensePlate    String
  driveFolderId   String    // Google Drive folder ID — never exposed to frontend directly
  qrCodeUrl       String?   // URL of stored QR PNG in Vercel Blob

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  documents       Document[]
  accessGrants    AccessGrant[]
  accessLogs      AccessLog[]

  @@index([ownerId])
}

enum VehicleType {
  CAR
  TRUCK
  BIKE
}

model Document {
  id              String    @id @default(cuid())
  vehicleId       String
  vehicle         Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  driveFileId     String    // Google Drive file ID — used server-side only, never sent to client
  fileName        String    // Original file name as uploaded
  mimeType        String    // e.g. application/pdf, image/jpeg
  sizeBytes       Int       // File size in bytes
  uploadedAt      DateTime  @default(now())
  uploadedById    String    // User who uploaded (always the owner at MVP)

  @@index([vehicleId])
}

model DrivingLicense {
  id              String    @id @default(cuid())
  userId          String    @unique          // one license per user
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  driveFileId     String    // Google Drive file ID — server-side only, never sent to client
  driveFolderId   String    // Google Drive folder ID for the license folder — server-side only
  fileName        String    // Original file name as uploaded
  mimeType        String
  sizeBytes       Int
  uploadedAt      DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

  id              String    @id @default(cuid())
  vehicleId       String
  vehicle         Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  grantedToId     String
  grantedTo       User      @relation("grantedTo", fields: [grantedToId], references: [id], onDelete: Cascade)
  grantedById     String
  grantedBy       User      @relation("grantedBy", fields: [grantedById], references: [id], onDelete: Cascade)
  createdAt       DateTime  @default(now())

  @@unique([vehicleId, grantedToId])
  @@index([vehicleId])
  @@index([grantedToId])
}

model AccessLog {
  id              String    @id @default(cuid())
  vehicleId       String
  vehicle         Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  scannedById     String
  scannedBy       User      @relation(fields: [scannedById], references: [id], onDelete: Cascade)
  scannedAt       DateTime  @default(now())

  @@index([vehicleId])
  @@index([scannedById])
}

// NextAuth required models
model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
}
```

### 6.2 Key Indexes to Add

```prisma
// Add these to the Vehicle model
@@index([ownerId])

// Add to AccessGrant model
@@index([vehicleId])
@@index([grantedToId])

// Add to AccessLog model
@@index([vehicleId])
@@index([scannedById])
```

### 6.3 Migration Commands

```bash
# Initial setup
npx prisma migrate dev --name init

# After any schema change
npx prisma migrate dev --name <describe_change>

# Push schema to production
npx prisma migrate deploy

# Open Prisma Studio (local DB browser)
npx prisma studio
```

---

## 7. Google Drive Integration

### 7.1 Drive Helper (`lib/drive.ts`)

This file exports functions used by the API routes. All functions are **server-side only**. The raw Drive folder ID and file IDs are **never sent to the frontend** — they are internal implementation details.

#### `getOAuthClient(userId: string)`
- Fetch the user's `googleAccessToken` and `googleRefreshToken` from the database
- Initialize a `google.auth.OAuth2` client with the app's client ID and secret
- Set credentials: `oauth2Client.setCredentials({ access_token, refresh_token })`
- Return the configured OAuth2 client

#### `refreshAndSaveToken(userId: string, oauth2Client)`
- Call `oauth2Client.refreshAccessToken()`
- Save the new `access_token` (and new `refresh_token` if provided) back to the database for that user
- Return the refreshed OAuth2 client

#### `createLicenseFolder(userId: string)`

Called once the first time a user uploads their driving license — only if the folder doesn't already exist.

Steps:
1. Call `getOAuthClient(userId)` with token refresh on failure
2. Initialize the Drive service
3. Create the folder:
```javascript
const folder = await drive.files.create({
  requestBody: {
    name: `VehicleDocs — My Driving License`,
    mimeType: 'application/vnd.google-apps.folder',
  },
  fields: 'id',
});
```
4. **No sharing permissions are set.** The folder is completely private
5. Return `{ folderId: folder.data.id }`

#### `createVehicleFolder(userId: string, vehicleNickname: string, licensePlate: string)`

Steps:
1. Call `getOAuthClient(userId)` and wrap in try/catch with token refresh on 401
2. Initialize the Drive service: `google.drive({ version: 'v3', auth: oauth2Client })`
3. Create the folder:
```javascript
const folder = await drive.files.create({
  requestBody: {
    name: `VehicleDocs — ${vehicleNickname} (${licensePlate})`,
    mimeType: 'application/vnd.google-apps.folder',
  },
  fields: 'id',
});
```
4. **Do NOT set any sharing permissions.** The folder remains private, accessible only via the owner's OAuth credentials through the app server
5. Return `{ folderId: folder.data.id }`

#### `uploadFileToDrive(ownerUserId: string, folderId: string, file: Buffer, fileName: string, mimeType: string)`

Steps:
1. Call `getOAuthClient(ownerUserId)` with token refresh on failure
2. Initialize the Drive service
3. Upload the file into the specified folder:
```javascript
const uploaded = await drive.files.create({
  requestBody: {
    name: fileName,
    parents: [folderId],
  },
  media: {
    mimeType: mimeType,
    body: Readable.from(file),   // convert Buffer to readable stream
  },
  fields: 'id, name, mimeType, size',
});
```
4. Return `{ driveFileId: uploaded.data.id, fileName: uploaded.data.name, mimeType: uploaded.data.mimeType, sizeBytes: Number(uploaded.data.size) }`

#### `streamFileFromDrive(ownerUserId: string, driveFileId: string): Promise<Readable>`

Used to proxy a file to the requesting user without exposing Drive URLs.

Steps:
1. Call `getOAuthClient(ownerUserId)` with token refresh on failure
2. Initialize the Drive service
3. Fetch the file as a stream:
```javascript
const response = await drive.files.get(
  { fileId: driveFileId, alt: 'media' },
  { responseType: 'stream' }
);
return response.data;  // This is a Readable stream
```
4. The calling API route pipes this stream directly into the HTTP response

#### `deleteFileFromDrive(ownerUserId: string, driveFileId: string)`

Steps:
1. Call `getOAuthClient(ownerUserId)` with token refresh on failure
2. Initialize the Drive service
3. Call `drive.files.delete({ fileId: driveFileId })`
4. Return `{ success: true }`

#### `listFilesInFolder(ownerUserId: string, folderId: string)`

Used for reconciliation or admin purposes — not used in main app flow (the app uses its own `documents` table for listing). Optional helper.

### 7.2 OAuth Scope

The scope `https://www.googleapis.com/auth/drive.file` allows the app to:
- Create folders and files in the user's Drive
- Read, update, and delete those same files

It does **not** allow reading any files the app did not create. This is the correct, minimal-permission scope.

Because the app manages all uploads and reads using the owner's credentials server-side, **shared users never need their own Drive scope** — they authenticate to the app, and the app fetches the files on their behalf using the owner's credentials.

### 7.3 Google Cloud Console Setup (for developer reference)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Drive API**
3. Configure the **OAuth consent screen** (External, add `drive.file` scope, add app name and logo)
4. Create **OAuth 2.0 credentials** (Web application type)
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.vercel.app/api/auth/callback/google` (production)
6. Copy the `Client ID` and `Client Secret` to environment variables

---

## 8. QR Code System

### 8.1 QR Helper (`lib/qr.ts`)

#### `generateVehicleQR(vehicleId: string, appDomain: string): Promise<Buffer>`

```typescript
import QRCode from 'qrcode';

export async function generateVehicleQR(vehicleId: string, appDomain: string): Promise<Buffer> {
  const url = `https://${appDomain}/v/${vehicleId}`;
  const buffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',  // High — tolerates up to 30% damage (important for printed stickers)
    type: 'png',
    width: 400,                  // 400x400px — good quality for printing
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
  return buffer;
}
```

### 8.2 QR Storage Flow

When a vehicle is created (POST `/api/vehicles`):

1. Generate the QR PNG buffer using `generateVehicleQR(newVehicle.id, process.env.NEXT_PUBLIC_APP_DOMAIN)`
2. Upload to Vercel Blob:
```typescript
import { put } from '@vercel/blob';

const blob = await put(`qr/${newVehicle.id}.png`, qrBuffer, {
  access: 'public',
  contentType: 'image/png',
});
```
3. Save `blob.url` to `vehicles.qrCodeUrl` in the database

### 8.3 QR Download Endpoint

`GET /api/vehicles/[vehicleId]/qr`

- Verify the requester is the vehicle owner
- Fetch the `qrCodeUrl` from the database
- Stream or redirect to the blob URL
- Set header: `Content-Disposition: attachment; filename="qr-[nickname]-[plate].png"`

---

## 9. Access Control Model

### 9.1 Access Rules (enforced server-side on every request)

| Action | Owner | Shared user |
|--------|-------|-------------|
| View own vehicle list (dashboard) | ✅ | ❌ (only see vehicles shared with them via scan) |
| Add a vehicle | ✅ | ❌ |
| View vehicle detail & manage page | ✅ | ❌ |
| Delete a vehicle | ✅ | ❌ |
| Share a vehicle with another user | ✅ | ❌ |
| Revoke a share | ✅ | ❌ |
| View shared users list | ✅ | ❌ |
| Upload driving license | ✅ | ❌ |
| View own driving license | ✅ | ❌ |
| Download own driving license | ✅ | ❌ |
| Replace own driving license | ✅ | ❌ |
| Delete own driving license | ✅ | ❌ |
| View another user's driving license | ❌ | ❌ |
| Delete a document from a vehicle | ✅ | ❌ |
| View vehicle info page (via QR) | ✅ | ✅ |
| View document list (via QR page) | ✅ | ✅ |
| View (stream) a document in-browser | ✅ | ✅ |
| Download a document | ✅ | ✅ |
| Download QR code | ✅ | ❌ |
| View access log | ✅ | ❌ |

### 9.2 Access Check Helper

Create a reusable server-side function:

```typescript
// lib/utils.ts
export async function canAccessVehicle(userId: string, vehicleId: string): Promise<boolean> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { accessGrants: true },
  });

  if (!vehicle) return false;
  if (vehicle.ownerId === userId) return true;

  return vehicle.accessGrants.some((grant) => grant.grantedToId === userId);
}
```

### 9.3 Share Flow Detail

1. Owner opens the Share page for a vehicle
2. Owner enters an email address and clicks "Share"
3. API call: `POST /api/vehicles/[vehicleId]/share` with body `{ email }`
4. Server:
   a. Verify requester is the vehicle owner
   b. Look up `email` in `users` table
   c. If not found: return `404` with message `"No account found for that email. The user must sign up first."`
   d. If found but already shared: return `409` with message `"Access already granted to this user."`
   e. If owner tries to share with themselves: return `400` with message `"You already have access as the owner."`
   f. Otherwise: create `AccessGrant` record and return `201`

---

## 10. Pages & Routes

### 10.1 Login Page (`/login`)

- Clean, centered card layout
- App logo + tagline: *"Manage your vehicle documents, anywhere."*
- Single **"Continue with Google"** button using Google's branded sign-in button guidelines
- On successful sign-in, redirect to `/dashboard`
- If user was redirected here from a QR scan, redirect back to `/v/[vehicleId]` after login (preserve the `callbackUrl` parameter in the NextAuth sign-in call)

### 10.2 Dashboard (`/dashboard`)

- Shows a **"My Driving License"** section at the top of the page — private to the logged-in user only:
  - If no license has been uploaded: a prompt to upload one
  - If a license exists: file name, type, size, upload date, View / Download / Replace / Delete buttons
- Below that, shows a grid/list of all vehicles owned by the authenticated user
- Each vehicle card shows:
  - Vehicle type icon (car / truck / bike)
  - Nickname (large, prominent)
  - License plate (badge)
  - "Open Drive" button → opens `driveFolderUrl` in new tab
  - "Download QR" button → calls `/api/vehicles/[vehicleId]/qr`
  - "Manage" link → goes to `/vehicles/[vehicleId]`
- **"Add Vehicle"** button opens an inline form or modal
- Empty state: show a friendly illustration + "Register your first vehicle" CTA
- Navbar: App logo, user avatar (from Google), sign-out button

### 10.3 Vehicle Info Page — QR Scan Landing (`/v/[vehicleId]`)

This is the page a user sees **after** scanning the QR code and logging in.

Layout (identical for both the vehicle owner and shared users):
- App logo header (minimal, no full nav)
- Vehicle type icon (large, centered — car / truck / bike)
- **Nickname** — large heading
- **License plate** — styled badge
- **Vehicle type** — label
- **Owner name** — "Documents owned by [Full Name]"
- **Document selector section:**
  - A labelled dropdown (`<select>`) populated with all uploaded documents for the vehicle. Each option shows the file name. The list is fetched from `GET /api/vehicles/[vehicleId]/documents` on page load
  - A **"View Document"** button — disabled until a document is selected from the dropdown. On click, opens `/api/vehicles/[vehicleId]/documents/[selectedDocumentId]/view` in a new browser tab
  - If the document list is empty: hide the dropdown and button entirely, show the message *"No documents have been uploaded for this vehicle yet."* instead
- Small footer: "Powered by VehicleDocs"

This page is intentionally the same for everyone — it is a clean, minimal viewing experience. The owner's document management tools (upload, delete, full list) live exclusively on the dashboard manage page at `/vehicles/[vehicleId]`, which is only accessible when logged in as the owner through the dashboard — not via QR scan.

**Important:** The dropdown option values are the internal `document.id` (CUID), not the `driveFileId`. The server resolves the Drive file from the document ID internally. No raw Drive data is ever in the page HTML.

This page must:
- Check session on the server side (`auth()` call in the page component)
- If unauthenticated: redirect to `/login?callbackUrl=/v/[vehicleId]`
- If authenticated but not authorized: render a 403 page
- If authorized: render the vehicle info and document list
- Log the scan event in `access_logs`

### 10.4 Vehicle Manage Page (`/vehicles/[vehicleId]`)

Owner-only page. Shows:
- Vehicle details (editable nickname and license plate in future, read-only at MVP)
- QR code preview image
- Download QR button
- **Shared with** section: list of users with access (name + email + revoke button)
- **Share with someone** form: email input + "Grant Access" button
- Access log: last 10 scan events (who scanned, when)
- **Delete vehicle** button (with confirmation dialog)

### 10.5 403 / Access Denied Page

- Clean error page
- Message: *"You don't have permission to view this vehicle's documents."*
- Sub-message: *"If you believe this is a mistake, ask the vehicle owner to share access with your Google account email: [user's email]"*
- Button: "Go to your Dashboard"

---

## 11. API Endpoints

All API routes are under `/app/api/`. All routes except `/api/auth/*` require an authenticated session. Return JSON. Use standard HTTP status codes. **Raw Drive file IDs and folder IDs are never included in API responses.**

### `GET /api/license`
- Returns the authenticated user's driving license metadata
- Response if exists: `{ id, fileName, mimeType, sizeBytes, uploadedAt }`
- Response if none uploaded yet: `{ license: null }`
- Only the authenticated user can call this — no access by any other user under any condition

### `POST /api/license`
- Uploads or replaces the user's driving license
- Request: `multipart/form-data` with a `file` field
- Server actions:
  1. Validate: max 20 MB, allowed mime types only
  2. Check if a `DrivingLicense` record already exists for this user
  3. If a record exists: delete the old file from Drive using `deleteFileFromDrive()`, then proceed
  4. If no `DrivingLicense` record exists AND no `driveFolderId` is stored: call `createLicenseFolder(userId)` to create the Drive folder once, save the `driveFolderId` in the new record
  5. Upload the new file using `uploadFileToDrive(userId, driveFolderId, fileBuffer, fileName, mimeType)`
  6. Create or update the `DrivingLicense` record in the database with the new `driveFileId`, `fileName`, `mimeType`, `sizeBytes`
  7. Return `201` with the license metadata (no `driveFileId` or `driveFolderId` in response)

### `GET /api/license/view`
- Streams the driving license file for in-browser viewing
- Only the authenticated user can call this
- Server actions:
  1. Fetch the user's `DrivingLicense` record
  2. If none: return `404`
  3. Call `streamFileFromDrive(userId, driveFileId)` using the user's own credentials
  4. Pipe the stream to the response with `Content-Disposition: inline`

### `GET /api/license/download`
- Same as `/api/license/view` but sets `Content-Disposition: attachment; filename="[fileName]"` to force a download

### `DELETE /api/license`
- Deletes the user's driving license from both Drive and the database
- Server actions:
  1. Fetch the user's `DrivingLicense` record — return `404` if none
  2. Call `deleteFileFromDrive(userId, driveFileId)`
  3. Delete the `DrivingLicense` record from the database
  4. Return `204`
  - Note: the Drive folder (`VehicleDocs — My Driving License`) is kept even after deletion so the user doesn't need a new folder created if they re-upload later

### `GET /api/vehicles`
- Returns all vehicles owned by the authenticated user
- Response: `{ vehicles: [{ id, type, nickname, licensePlate, qrCodeUrl, documentCount, createdAt }] }`

### `POST /api/vehicles`
- Creates a new vehicle
- Request body:
```json
{
  "type": "CAR" | "TRUCK" | "BIKE",
  "nickname": "string (required, max 50 chars)",
  "licensePlate": "string (required, max 20 chars)"
}
```
- Server actions:
  1. Validate input (all fields required, type must be valid enum)
  2. Call `createVehicleFolder(userId, nickname, licensePlate)` from `lib/drive.ts`
  3. Create `Vehicle` record in DB with `driveFolderId` (stored internally, not returned)
  4. Generate QR code PNG and upload to Vercel Blob
  5. Update `Vehicle` record with `qrCodeUrl`
  6. Return `201` with the new vehicle object (no `driveFolderId` in response)
- Error cases:
  - `400` if validation fails
  - `500` if Drive API call fails (include user-friendly message, rollback vehicle record)

### `GET /api/vehicles/[vehicleId]`
- Returns a single vehicle (owner only)
- Includes: vehicle fields (no `driveFolderId`) + document list (no `driveFileId`) + list of access grants + last 10 access logs
- Returns `403` if requester is not the owner

### `DELETE /api/vehicles/[vehicleId]`
- Deletes the vehicle record (cascades to documents, access grants, and logs)
- **Also deletes all files inside the Drive folder** using `deleteFileFromDrive()` for each document, then deletes the folder itself
- Owner only; returns `403` otherwise

### `GET /api/vehicles/[vehicleId]/qr`
- Returns the QR PNG for download
- Sets `Content-Disposition: attachment; filename="qr-[nickname]-[plate].png"`
- Owner only

### `GET /api/vehicles/[vehicleId]/documents`
- Returns the list of documents for a vehicle
- Accessible by: vehicle owner OR users with an `access_grants` record for this vehicle
- Response:
```json
{
  "documents": [
    {
      "id": "cuid",
      "fileName": "insurance.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 204800,
      "uploadedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```
- Note: `driveFileId` is **never** included in the response

### `POST /api/vehicles/[vehicleId]/documents`
- Uploads a new document to the vehicle's Drive folder
- **Owner only** — shared users receive `403`
- Request: `multipart/form-data` with a `file` field
- Server actions:
  1. Verify requester is the vehicle owner
  2. Parse the uploaded file (use `formidable` or Next.js built-in form parsing)
  3. Validate: max 20 MB, allowed mime types only (`application/pdf`, `image/jpeg`, `image/png`, `image/jpg`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
  4. Fetch vehicle's `driveFolderId` from DB
  5. Call `uploadFileToDrive(ownerId, driveFolderId, fileBuffer, fileName, mimeType)`
  6. Save `Document` record to DB: `{ vehicleId, driveFileId, fileName, mimeType, sizeBytes, uploadedById }`
  7. Return `201` with the new document object (no `driveFileId`)
- Error cases:
  - `400` if file is missing, too large, or wrong type
  - `403` if requester is not the owner
  - `500` if Drive upload fails

### `GET /api/vehicles/[vehicleId]/documents/[documentId]/view`
- Streams the document content for in-browser viewing
- Accessible by: vehicle owner OR users with `access_grants` for this vehicle
- Server actions:
  1. Run `canAccessVehicle(userId, vehicleId)` check
  2. Fetch `driveFileId` from the `Document` record (owner's DB lookup)
  3. Fetch the vehicle's `ownerId` to get the correct OAuth credentials
  4. Call `streamFileFromDrive(ownerId, driveFileId)` using the **owner's** credentials
  5. Pipe the stream to the response with the correct `Content-Type` header
  6. Set `Content-Disposition: inline` so the browser renders it in-tab
- Returns `403` if access check fails

### `GET /api/vehicles/[vehicleId]/documents/[documentId]/download`
- Same as `/view` but forces a file download
- Set `Content-Disposition: attachment; filename="[fileName]"` instead of `inline`
- Accessible by: vehicle owner OR users with `access_grants` for this vehicle

### `DELETE /api/vehicles/[vehicleId]/documents/[documentId]`
- Deletes a document from both the Drive folder and the database
- **Owner only** — shared users receive `403`
- Server actions:
  1. Verify requester is the vehicle owner
  2. Fetch `driveFileId` from the `Document` record
  3. Call `deleteFileFromDrive(ownerId, driveFileId)`
  4. Delete the `Document` record from the DB
  5. Return `204`

### `GET /api/vehicles/[vehicleId]/share`
- Returns list of users the vehicle is shared with
- Owner only

### `POST /api/vehicles/[vehicleId]/share`
- Grants access to a user by email
- Request body: `{ "email": "string" }`
- Owner only
- Returns `201` on success, `404` if email not found, `409` if already shared, `400` if owner tries to share with themselves

### `DELETE /api/vehicles/[vehicleId]/share/[grantId]`
- Revokes access for a specific grant
- Owner only
- Returns `204` on success

### `GET /api/user`
- Returns the authenticated user's profile info
- Response: `{ id, name, email, image, createdAt }`

---

## 12. UI & Component Plan

### 12.1 Design Principles
- Clean, minimal interface
- Mobile-first responsive design using Tailwind CSS
- Color scheme: white background, dark text, a single brand accent color (suggest indigo or blue)
- No heavy animations at MVP

### 12.2 Key Components

#### `VehicleCard`
Props: `vehicle: Vehicle`
Displays: type icon, nickname, license plate badge, document count badge, "Download QR" button, "Manage" link
Note: No direct "Open Drive" button — document access happens through the app only

#### `AddVehicleForm`
- Form with three fields: Type (select), Nickname (text input), License Plate (text input)
- Submit calls `POST /api/vehicles`
- Show loading state while Drive folder is being created (this takes 1–3 seconds)
- On success: add new card to dashboard list
- On error: show inline error message

#### `DocumentList` (owner dashboard — manage page only)
Props: `vehicleId: string`
- Fetches documents from `GET /api/vehicles/[vehicleId]/documents`
- Renders a table of documents with file name, type badge, size, upload date
- Each row has a "View" button and a "Delete" button (with confirmation)
- Shows the `UploadButton` component at the top
- Only rendered on the owner's Vehicle Manage page (`/vehicles/[vehicleId]`) — never on the QR scan page

#### `DocumentViewer` (QR scan page — used by everyone including the owner)
Props: `vehicleId: string`
- Fetches document list from `GET /api/vehicles/[vehicleId]/documents` on mount
- Renders a labelled `<select>` dropdown populated with document file names; option `value` is the document's internal CUID
- Renders a **"View Document"** button, disabled until a selection is made
- On button click: opens `/api/vehicles/[vehicleId]/documents/[selectedDocumentId]/view` in a new tab
- If document list is empty: renders the message *"No documents have been uploaded for this vehicle yet."* with no dropdown or button
- This component has **no upload, delete, or download controls** — it is view-only for everyone, including the owner, when accessed via QR scan

#### `UploadButton`
Props: `vehicleId: string, onSuccess: () => void`
- File input (hidden, triggered by a styled button click)
- Accepts: PDF, JPG, JPEG, PNG, DOCX, XLSX — max 20 MB
- Shows upload progress bar while uploading
- On success: calls `onSuccess()` to refresh the document list
- On error: shows inline error message (file too large, wrong type, Drive error)
- Calls `POST /api/vehicles/[vehicleId]/documents` with `multipart/form-data`

#### `VehicleTypeIcon`
Props: `type: 'CAR' | 'TRUCK' | 'BIKE'`
Renders an SVG icon or emoji for the vehicle type

#### `QRDownloadButton`
Props: `vehicleId: string, nickname: string, plate: string`
Calls the QR download endpoint and triggers browser download

#### `LicenseSection`
Props: none (fetches from `/api/license` on mount)
- Displayed on the dashboard, clearly separated from the vehicle list under a heading like "My Driving License"
- If no license uploaded: shows an upload prompt — *"You haven't uploaded your driving license yet."* with an `UploadLicenseButton`
- If a license exists: shows the file name, file type badge, size, upload date, a **"View"** button (opens in new tab via `/api/license/view`), a **"Download"** button, a **"Replace"** button (triggers a new file upload, replaces the existing one), and a **"Delete"** button with confirmation
- This component is only ever rendered inside the authenticated owner's dashboard — never on any QR scan page, never visible to any other user
Props: `vehicleId: string`
Shows current shares list + add new share form
Handles revoke with confirmation

### 12.3 Vehicle Type Icons (suggestions)
- CAR → 🚗 or a simple SVG car silhouette
- TRUCK → 🚛 or a simple SVG truck silhouette
- BIKE → 🏍️ or a simple SVG motorcycle silhouette

---

## 13. Environment Variables

Create `.env.local` (never commit to git) based on this template:

```bash
# App
NEXT_PUBLIC_APP_DOMAIN=yourdomain.vercel.app
NEXTAUTH_URL=https://yourdomain.vercel.app
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Database
DATABASE_URL=<Supabase PostgreSQL connection string>

# Vercel Blob (auto-set when Blob store is connected in Vercel dashboard)
BLOB_READ_WRITE_TOKEN=<from Vercel Blob settings>
```

For local development:
```bash
NEXT_PUBLIC_APP_DOMAIN=localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

Create `.env.example` with all keys but no values — commit this file so other developers know what variables are needed.

---

## 14. Build Phases

### Phase 1 — Project Setup & Auth (Week 1)
**Goal:** A user can sign in with Google and see an empty dashboard.

Tasks:
- [ ] Initialize Next.js 14 project with TypeScript and Tailwind CSS
- [ ] Set up Prisma with Supabase PostgreSQL
- [ ] Configure NextAuth.js with Google provider and Prisma adapter
- [ ] Request `drive.file` scope during Google sign-in
- [ ] Store `access_token` and `refresh_token` in the `User` model after sign-in
- [ ] Build the Login page (`/login`) with Google Sign-In button
- [ ] Build the Dashboard layout with navbar (user avatar, sign-out)
- [ ] Configure `middleware.ts` to protect all dashboard routes
- [ ] Run initial Prisma migration

Deliverable: Authenticated user sees an empty dashboard. Non-authenticated user is redirected to `/login`.

---

### Phase 2 — Vehicle Registration & Drive Integration (Week 2)
**Goal:** A user can add a vehicle and the Drive folder is auto-created privately.

Tasks:
- [ ] Build `createVehicleFolder()` Drive helper in `lib/drive.ts` — folder created with no public sharing permissions
- [ ] Implement token refresh logic in the Drive helper
- [ ] Build `POST /api/vehicles` route (validate → create private Drive folder → save folder ID to DB → do not expose folder ID in response)
- [ ] Build `GET /api/vehicles` route (return vehicle list without `driveFolderId`)
- [ ] Build `AddVehicleForm` component (type select, nickname, plate fields)
- [ ] Build `VehicleCard` component (type icon, nickname, plate, document count)
- [ ] Show vehicle cards on the dashboard
- [ ] Handle Drive API errors gracefully (show user-friendly error, clean up partial state)
- [ ] Test: Add a vehicle and verify private Drive folder appears in owner's Google Drive

Deliverable: User can register a vehicle. A private Drive folder is created. No Drive link is exposed anywhere.

---

### Phase 3 — Document Upload, Management & Driving License (Week 3)
**Goal:** Owners can upload vehicle documents and their personal driving license through the app.

Tasks:
- [ ] Build `uploadFileToDrive()` Drive helper in `lib/drive.ts`
- [ ] Build `deleteFileFromDrive()` Drive helper
- [ ] Build `createLicenseFolder()` Drive helper in `lib/drive.ts`
- [ ] Add `formidable` (or use Next.js built-in) for multipart form parsing
- [ ] Build `POST /api/vehicles/[vehicleId]/documents` upload endpoint (owner only)
- [ ] Build `GET /api/vehicles/[vehicleId]/documents` list endpoint (owner + shared)
- [ ] Build `DELETE /api/vehicles/[vehicleId]/documents/[documentId]` endpoint (owner only)
- [ ] Build `DocumentList` component (file name, type badge, size, date, view/download/delete buttons)
- [ ] Build `UploadButton` component (file picker, progress bar, error messages)
- [ ] Show `DocumentList` on the Vehicle Manage page (with upload button for owner)
- [ ] Build `GET /api/license`, `POST /api/license`, `GET /api/license/view`, `GET /api/license/download`, `DELETE /api/license` endpoints
- [ ] Confirm all `/api/license/*` endpoints return `403` for any user other than the authenticated owner
- [ ] Build `LicenseSection` component (upload prompt when empty; file name, type, size, date, View / Download / Replace / Delete when a license exists)
- [ ] Add `LicenseSection` to the dashboard above the vehicle list
- [ ] Validate all uploads: file size ≤ 20 MB, allowed mime types only
- [ ] Test: Upload a vehicle document → confirm it appears in Drive and the document list
- [ ] Test: Upload a driving license → view it → replace it → delete it → confirm no other user can access it

Deliverable: Owner can upload and delete vehicle documents. Owner can upload, view, replace, and delete their private driving license. No other user can see the license under any condition.

---

### Phase 4 — QR Code Generation & Download (Week 4)
**Goal:** A unique, downloadable QR code exists for every vehicle.

Tasks:
- [ ] Build `generateVehicleQR()` helper in `lib/qr.ts`
- [ ] Add Vercel Blob integration for storing QR PNGs
- [ ] Update `POST /api/vehicles` to generate + store QR after vehicle creation
- [ ] Build `GET /api/vehicles/[vehicleId]/qr` download endpoint
- [ ] Build `QRDownloadButton` component
- [ ] Add QR preview thumbnail to `VehicleCard` and manage page
- [ ] Test: Download QR code, scan it with phone, confirm it opens the correct URL

Deliverable: Every vehicle has a downloadable QR code that encodes `/v/[vehicleId]`.

---

### Phase 5 — QR Scan & View Flow (Week 5)
**Goal:** Scanning the QR code leads to an authenticated vehicle info page with the document list.

Tasks:
- [ ] Build `streamFileFromDrive()` Drive helper in `lib/drive.ts`
- [ ] Build `GET /api/vehicles/[vehicleId]/documents/[documentId]/view` streaming endpoint
- [ ] Build `GET /api/vehicles/[vehicleId]/documents/[documentId]/download` endpoint
- [ ] Build `/v/[vehicleId]` page (server component, checks auth and access)
- [ ] Implement `canAccessVehicle()` helper in `lib/utils.ts`
- [ ] Handle unauthenticated case: redirect to `/login?callbackUrl=/v/[vehicleId]`
- [ ] Handle unauthorized case: render 403 page
- [ ] Handle authorized case: render vehicle info page with `DocumentViewer` component (dropdown + "View Document" button) — identical experience for owner and shared users
- [ ] Log scan event to `access_logs` table on authorized view
- [ ] Test callbackUrl flow: scan QR while logged out → login → land on vehicle page
- [ ] Test as owner: scan own QR → see dropdown → view a document → confirm no upload or delete controls on this page
- [ ] Test as shared user: same dropdown + view button experience as the owner on the QR scan page
- [ ] Build the 403 Access Denied page

Deliverable: Full QR scan flow works end-to-end. The QR scan page is a clean, identical viewing experience for everyone.

---

### Phase 6 — Access Sharing, Logs & Cleanup (Week 6)
**Goal:** Owners can share and unshare vehicle access; app is production-ready.

Tasks:
- [ ] Build Vehicle Manage page (`/vehicles/[vehicleId]`)
- [ ] Build `POST /api/vehicles/[vehicleId]/share` endpoint (email lookup, grant creation)
- [ ] Build `GET /api/vehicles/[vehicleId]/share` endpoint (list grants)
- [ ] Build `DELETE /api/vehicles/[vehicleId]/share/[grantId]` endpoint (revoke)
- [ ] Build `ShareManager` component (email input, shared users list, revoke buttons)
- [ ] Show error when sharing with unregistered email
- [ ] Show error when sharing with self
- [ ] Update `DELETE /api/vehicles/[vehicleId]` to also delete all Drive files and the folder before removing DB record
- [ ] Show last 10 scan events (who, when) on the Vehicle Manage page
- [ ] Add delete vehicle button with confirmation dialog (warn that Drive files will be deleted)
- [ ] Add empty states for: no vehicles on dashboard, no documents, no shares, no logs
- [ ] Ensure full mobile responsiveness on all pages
- [ ] Handle token expiry edge case: prompt user to reconnect Google account
- [ ] Add loading skeletons for vehicle card list and document list
- [ ] Validate all form inputs on both client and server
- [ ] Add `robots.txt` to disallow indexing of `/v/*` routes
- [ ] Audit all API routes: confirm ownership/access is verified before every response; confirm no `driveFileId` or `driveFolderId` leaks into any response body
- [ ] Deploy to Vercel and confirm production Google OAuth redirect URIs are set

Deliverable: Production deployment on Vercel. App is stable, secure, and fully functional.

---

## 15. Security Checklist

- [ ] **OAuth tokens stored securely:** `googleAccessToken` and `googleRefreshToken` must be encrypted at rest. Use application-layer encryption before writing to DB (e.g. encrypt with `AES-256-GCM` using `NEXTAUTH_SECRET` as the key material).
- [ ] **Ownership verified on every API route:** Every route that touches a vehicle or document must confirm the requesting user owns it, or has an explicit `access_grants` record for read-only operations. Never trust the client to send its own `userId`.
- [ ] **No Drive IDs in API responses:** `driveFolderId` and `driveFileId` are internal server-side values only. They must never appear in any JSON response, HTML page source, or URL visible to the client.
- [ ] **No raw Drive URLs exposed:** Shared users never receive a direct Google Drive file or folder URL. All document access is proxied through the app's `/view` and `/download` endpoints, which enforce the access check on every request.
- [ ] **Shared users are strictly read-only at the API level:** The `POST`, `DELETE` endpoints for documents return `403` if the requester is not the vehicle owner — even if they have an `access_grants` record. This is enforced server-side and cannot be bypassed by the client.
- [ ] **Owner's credentials used to serve shared user requests:** When a shared user requests a document view or download, the server fetches the file using the **vehicle owner's** stored OAuth credentials, not the shared user's. The shared user never needs Drive scope themselves.
- [ ] **File upload validation is server-side:** Mime type and file size checks happen on the server using the actual file buffer, not just the client-supplied `Content-Type` header (which can be spoofed). Use a library like `file-type` to verify the true mime type from the file bytes.
- [ ] **No QR code URL contains sensitive info:** The QR encodes only `/v/[vehicleId]`. The `vehicleId` is a non-guessable CUID. No Drive folder URLs, tokens, file IDs, or user IDs are embedded in the QR.
- [ ] **HTTPS only:** All production traffic goes over HTTPS. Vercel enforces this by default.
- [ ] **NEXTAUTH_SECRET is a strong random value:** Generated with `openssl rand -base64 32`. Never reuse between environments.
- [ ] **Rate limiting (future):** Add rate limiting to `POST /api/vehicles`, `POST /api/vehicles/[vehicleId]/documents`, and `POST /api/vehicles/[vehicleId]/share` to prevent abuse.
- [ ] **Audit logs are append-only:** The `access_logs` table is written to by the server only; no API endpoint allows deleting or modifying log entries.
- [ ] **No `.env.local` in git:** Confirm `.env.local` is in `.gitignore`.
- [ ] **Drive folder deletion on vehicle delete:** When an owner deletes a vehicle, all Drive files are deleted first (using `deleteFileFromDrive()` for each document), then the folder is deleted. This prevents orphaned Drive data.

---

## 16. Edge Cases & Error Handling

### Google Drive Errors
- **Drive API returns 401 (invalid credentials):** Attempt token refresh. If refresh also fails, return a user-facing error: *"Your Google Drive connection has expired. Please sign out and sign back in."*
- **Drive API returns 403 (insufficient permissions):** The `drive.file` scope was not granted. Show error: *"Please reconnect your Google account and allow Drive access when prompted."*
- **File upload to Drive fails mid-way:** Do not save the `Document` record to the database. Return a `500` with a user-friendly message. No partial state is written.
- **File streaming fails (Drive file deleted externally):** If `streamFileFromDrive()` returns a 404, respond with `410 Gone` and show: *"This document is no longer available. The owner may have deleted it from Google Drive."* Also delete the stale `Document` record from the database.
- **Owner deletes the Drive folder manually:** The app's document list will show files that no longer exist on Drive. Handle gracefully by catching 404 errors during view/download and displaying the message above.

### Driving License Edge Cases
- **User uploads a new license when one already exists:** The old file is deleted from Drive first, then the new one is uploaded. The `DrivingLicense` record is updated in place. There is never more than one license file per user in Drive.
- **Drive delete of old license fails before new one is uploaded:** Do not proceed with the upload. Return a `500` with message: *"Could not replace your license. Please try again."* The old file remains intact.
- **User deletes their account (future):** The `DrivingLicense` record cascades-deletes from the database. The Drive folder and file are left in the user's Drive (since the account is being deleted, there is no longer an authenticated session to make Drive API calls with).
- **Another user somehow calls `/api/license`:** Returns `403` immediately. The server checks that `session.user.id` matches the record owner before doing anything — there is no scenario where user B can retrieve user A's license.
- **File too large (> 20 MB):** Return `400` with message: *"File is too large. Maximum size is 20 MB."*
- **Unsupported file type:** Return `400` with message: *"File type not supported. Please upload a PDF, image, or Office document."*
- **Mime type mismatch (spoofed header):** Detect using `file-type` library on the raw buffer. If the detected type doesn't match the extension or isn't in the allowed list, reject with `400`.

### Access Control Edge Cases
- **Shared user tries to call an owner-only endpoint:** Always return `403`, never `404`. A `404` would leak information that the resource exists.
- **QR code URL is shared externally (forwarded via message, email, etc.):** The recipient still must log in and must have an `access_grants` record. Without both conditions, they see the login page or a 403.
- **Vehicle ID in URL is a valid CUID but doesn't exist:** Return a 404 page: *"This vehicle could not be found. The QR code may be outdated."*
- **Owner revokes their own Google account access:** Token refresh will fail. On the owner's next Drive API call, catch the error and redirect them to reconnect. Meanwhile, shared users will receive Drive errors when trying to view documents — show the "no longer available" message.

### Form Validation Rules (enforce on both client and server)
- **Nickname:** Required, max 50 characters, no HTML tags
- **License plate:** Required, max 20 characters, no HTML tags
- **Vehicle type:** Required, must be one of `CAR`, `TRUCK`, `BIKE`
- **Share email:** Required, must be a valid email format (use Zod: `z.string().email()`)
- **Uploaded file:** Required when calling upload endpoint, max 20 MB, allowed mime types only

---

*End of VehicleDocs Blueprint — Version 1.1*
*Updated to reflect app-managed document uploads and strictly enforced read-only access for shared users.*
*Generated for use with GitHub Copilot. Feed this document as context when prompting Copilot to generate each section of the codebase.*
