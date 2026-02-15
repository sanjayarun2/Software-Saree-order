# Saree Order App

A mobile-first Android and web application for managing saree orders. Built with Next.js 15, Tailwind CSS, Capacitor, and Supabase.

## Features

- **Authentication**: Email/password login, registration, forgot password
- **Order Management**: Add orders, view by status (PENDING/DESPATCHED), filter by date
- **Dashboard**: Quick access to Orders, Add Order, Reports
- **Bento Grid UI**: 16px rounded corners, Inter font, high-contrast typography
- **Responsive**: Bottom nav on mobile, rail nav on desktop

## Prerequisites

- Node.js 18+
- npm
- Supabase account (free tier)
- Android Studio (for APK/AAB build)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. In SQL Editor, run the contents of `supabase/schema.sql`
   - For existing projects, also run: `supabase/migrations/add_quantity.sql`, then `supabase/migrations/add_user_profiles_email_and_trigger.sql` (adds email column + trigger to store mobile/email at signup)
3. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run locally (web)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Android

```bash
npm run build
npx cap add android
npx cap sync
npx cap open android
```

In Android Studio: Build > Build Bundle(s) / APK(s) > Build Bundle(s) for Play Store

## Project Structure

```
src/
├── app/           # Next.js App Router pages
├── components/    # UI components
├── lib/           # Supabase, auth, types
```

## Tech Stack

- **Framework**: Next.js 15 (static export)
- **Styling**: Tailwind CSS
- **Native**: Capacitor 6 (Android)
- **Backend**: Supabase (Auth + PostgreSQL)
- **Font**: Inter
