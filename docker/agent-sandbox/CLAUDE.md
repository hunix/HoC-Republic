# HoC Agent Sandbox — Claude Code Project Memory

You are operating inside the **HoC Agent Sandbox** — a Docker container for autonomous software development.

## Environment

- **OS**: Ubuntu 22.04
- **Node.js**: 22.x (npm, pnpm available)
- **Python**: 3.x (pip, venv available)
- **Claude Code**: Anthropic's agentic CLI
- **Supabase CLI**: Full-stack backend management
- **Deno**: Supabase Edge Functions runtime
- **Browser**: Chromium via Playwright (headless)
- **Working Directory**: `/workspace`
- **Preview Server**: Port 8080 (accessible from host)

## Project Conventions

### Frontend (React + Vite + Tailwind)
```bash
npm create vite@latest . -- --template react-ts
npm install -D tailwindcss @tailwindcss/vite
```

**vite.config.ts** — always bind to 0.0.0.0:8080:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', port: 8080 },
})
```

### Supabase Integration
```bash
npm install @supabase/supabase-js
```

**lib/supabase.ts**:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
```

### Auth Patterns
```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({ email, password })

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

// OAuth
const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })

// Auth state listener
supabase.auth.onAuthStateChange((event, session) => { /* handle */ })

// Protected routes — check session
const { data: { session } } = await supabase.auth.getSession()
```

### Database Patterns
```sql
-- Always enable RLS on tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policy examples
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Foreign key to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Storage Patterns
```typescript
// Upload file
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file, { contentType: 'image/png' })

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.png`)
```

### Realtime Subscriptions
```typescript
const channel = supabase.channel('messages')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => { /* handle new message */ }
  )
  .subscribe()
```

### Edge Functions (Deno)
```typescript
// supabase/functions/hello/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  return new Response(JSON.stringify({ hello: 'world' }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### TypeScript Type Generation
```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```

## PWA Setup

Install the PWA Vite plugin:
```bash
npm install -D vite-plugin-pwa
```

**vite.config.ts**:
```typescript
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

## Premium UI/UX Guidelines

### Design Principles
- **Dark mode first** — use slate/zinc color palette, glass morphism cards
- **Micro-animations** — Framer Motion for page transitions, hover effects, loading states
- **Responsive** — mobile-first, use Tailwind breakpoints (sm, md, lg, xl)
- **Typography** — Google Fonts (Inter, Plus Jakarta Sans), proper hierarchy
- **Spacing** — consistent 4/8-point grid system
- **Color** — curated palette, never raw hex — use CSS variables or Tailwind config

### Essential Packages
```bash
npm install framer-motion lucide-react @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install -D @fontsource-variable/inter
```

### Component Patterns
- Glass cards: `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl`
- Gradient text: `bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent`
- Smooth transitions: `transition-all duration-300 ease-out`
- Loading skeletons: `animate-pulse bg-white/10 rounded`
- Hover lift: `hover:scale-[1.02] hover:shadow-xl transition-transform`

### Quality Standards
- TypeScript strict mode
- No `any` types
- Error boundaries on every route
- Loading states for all async operations
- Empty states for lists
- Toast notifications for user actions
- Form validation with clear error messages
- Semantic HTML + ARIA attributes
