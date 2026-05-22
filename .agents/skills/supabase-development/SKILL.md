---
name: supabase-development
description: Full-stack development with Supabase — PostgreSQL, Auth, Storage, Realtime, Edge Functions. Use for any app requiring a database, authentication, or file storage.
---

# Supabase Development Skill

## When to Use

Use Supabase when the task involves:
- User authentication (email/password, OAuth, magic links)
- Database with row-level security
- File storage (uploads, downloads, public URLs)
- Realtime subscriptions (WebSocket-based live updates)
- Serverless edge functions (Deno runtime)
- Any full-stack web application

## Sandbox Integration

The sandbox has Supabase CLI pre-installed. Use the `supabase_project` tool:

```
supabase_project(action="start")      → spin up local Postgres + Auth + Storage + Studio
supabase_project(action="migration", migration_name="create_users", migration_sql="...")
supabase_project(action="gen-types")  → TypeScript types from DB schema
supabase_project(action="seed", seed_sql="...")
supabase_project(action="status")     → connection URLs and keys
supabase_project(action="reset")      → wipe and reapply all migrations + seed
supabase_project(action="stop")       → shut down local stack
```

## CLI Reference

### Project Lifecycle
```bash
npx supabase init                    # Create supabase/ directory
npx supabase start                   # Start local Docker stack
npx supabase status                  # Show URLs, keys, status
npx supabase stop                    # Stop local stack
```

### Database Migrations
```bash
npx supabase migration new <name>    # Create empty migration file
npx supabase db reset                # Reset DB, reapply migrations + seed
npx supabase db push                 # Push migrations to remote
npx supabase db pull                 # Pull remote schema as migration
npx supabase db diff                 # Diff local vs remote schema
npx supabase db dump                 # Dump schema/data
npx supabase db lint                 # Lint SQL for issues
```

### Type Generation
```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

### Edge Functions
```bash
npx supabase functions new <name>    # Create new edge function
npx supabase functions serve         # Start local dev server
npx supabase functions deploy <name> # Deploy to Supabase Cloud
```

### Storage
```bash
npx supabase storage ls ss:///bucket/path
npx supabase storage cp local.txt ss:///bucket/path/file.txt
npx supabase storage rm ss:///bucket/path/file.txt
```

### Testing
```bash
npx supabase test db                 # Run pgTAP tests
npx supabase test new <name>         # Create new test file
```

### Inspection
```bash
npx supabase inspect db bloat        # Check table bloat
npx supabase inspect db locks        # Show active locks
npx supabase inspect db outliers     # Slow query analysis
```

## Local Stack Ports

| Service | Port | URL |
|---|---|---|
| API (PostgREST) | 54321 | http://localhost:54321 |
| Studio (Admin UI) | 54323 | http://localhost:54323 |
| PostgreSQL | 54322 | postgresql://postgres:postgres@localhost:54322/postgres |
| Mailpit (Email testing) | 54324 | http://localhost:54324 |
| Edge Functions | 54321/functions/v1 | http://localhost:54321/functions/v1/<name> |

## React Integration

### Setup
```bash
npm install @supabase/supabase-js
```

### Client (`src/lib/supabase.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
```

### Auth
```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({ email, password })

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

// OAuth (Google, GitHub, etc.)
const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  // Handle: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
})

// Get current session
const { data: { session } } = await supabase.auth.getSession()
```

### Database (CRUD)
```typescript
// Insert
const { data, error } = await supabase.from('posts').insert({ title, content, user_id })

// Select
const { data, error } = await supabase.from('posts').select('*, profiles(display_name)').order('created_at', { ascending: false })

// Update
const { data, error } = await supabase.from('posts').update({ title }).eq('id', postId)

// Delete
const { data, error } = await supabase.from('posts').delete().eq('id', postId)
```

### Storage
```typescript
// Upload
const { data, error } = await supabase.storage.from('avatars').upload(`${userId}/avatar.png`, file)

// Get public URL
const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar.png`)

// Download
const { data, error } = await supabase.storage.from('files').download('path/to/file.pdf')
```

### Realtime
```typescript
const channel = supabase.channel('room1')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    console.log('New message:', payload.new)
  })
  .subscribe()
```

## SQL Patterns

### RLS (Row Level Security) — ALWAYS enable
```sql
-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users read own data" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users update own data" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Public read, authenticated write
CREATE POLICY "Public read" ON public.posts
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Auth write" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### Common Schema Pattern
```sql
-- User profiles linked to auth
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

### Storage Bucket Policies
```sql
-- Create a public bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Policy: users can upload to their own folder
CREATE POLICY "User avatar upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

## Edge Functions (Deno)

### Template
```typescript
// supabase/functions/hello/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.from('posts').select('*')

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### Call from client
```typescript
const { data, error } = await supabase.functions.invoke('hello', {
  body: { name: 'world' },
})
```

## PWA Setup (with Vite)

```bash
npm install -D vite-plugin-pwa
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'My App',
        short_name: 'App',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
```
