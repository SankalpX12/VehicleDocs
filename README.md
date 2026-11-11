# VehicleDocs

A full-stack web application that helps users manage and share vehicle documents securely using Google Drive.

## About the Project

VehicleDocs is a multi-user SaaS application where users can:

- Sign in with their Google account
- Register their vehicles (Car, Truck, Bike)
- Upload and manage vehicle-related documents
- Generate QR codes for easy access and sharing
- Control who can view their documents

Documents stay in the user's own Google Drive. The app only manages access and identity.

## Tech Stack

- **Frontend & Backend**: Next.js (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (via Prisma)
- **Authentication**: NextAuth.js (Google Provider)
- **Styling**: Tailwind CSS
- **Other**: Google Drive API, QR Code generation

## Features

- Google OAuth login
- Vehicle registration and management
- Secure document upload and access control
- QR code generation for sharing
- Clean and responsive UI

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A Google Cloud project with OAuth credentials
- PostgreSQL database (or Supabase)

### Installation

1. Clone the repository
```bash
git clone https://github.com/SankalpX12/first-project.git
cd first-project
```

2. Install dependencies
```bash
npm install
```

3. Create a .env file based on .env.example and add your credentials

4. Database Setup
```bash
npx prisma generate
npx prisma migrate dev
```

5. Start the development server
```bash
npm run dev
```
