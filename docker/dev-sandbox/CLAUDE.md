# HoC Dev Sandbox — Project Rules for Claude Code CLI

> Claude Code reads this file automatically. It defines the environment,
> conventions, and capabilities available inside this container.

## Environment

- **OS**: Ubuntu 22.04 (x86_64, Docker container)
- **Node.js**: 22.x (npm, pnpm, tsx, TypeScript)
- **Python**: 3.10+ (pip, venv, FastAPI, pytest)
- **Go**: 1.24+ (modules, `go build`, `go test`)
- **Rust**: Latest stable (cargo, wasm-pack, wasm32 target)
- **C/C++**: gcc, g++, make, cmake, pkg-config
- **Deno**: Latest (for Supabase Edge Functions)

## Key CLIs Available

### GitHub CLI (`gh`)
```bash
gh repo create <name> --public --source . --push  # Create + push repo
gh pr create --title "..." --body "..."            # Create PR
gh pr list / gh pr view <n>                        # View PRs
gh pr merge <n> --squash                           # Merge PR
gh issue create / gh issue list                    # Issue management
gh release create v1.0.0 --generate-notes          # Create release
gh api repos/{owner}/{repo}/actions/runs           # API access
```

### Claude Code CLI (`claude`)
```bash
claude -p "task description" \
  --dangerously-skip-permissions \
  --output-format json \
  --max-turns 30 \
  --effort high \
  --no-session-persistence
```

### Docker CLI (`docker`)
Controls the HOST Docker daemon via mounted socket.
```bash
docker ps                                          # List containers
docker compose up -d                               # Start services
docker compose logs -f                             # View logs
docker build -t myapp .                            # Build image
docker exec <container> <command>                  # Run in container
```

### Supabase CLI (`supabase`)
```bash
supabase init                                      # Initialize project
supabase start                                     # Start local stack
supabase stop                                      # Stop local stack
supabase status                                    # Show service URLs + keys
supabase migration new <name>                      # Create migration
supabase db reset                                  # Reset + apply all migrations
supabase gen types typescript --local              # Generate TypeScript types
supabase functions new <name>                      # Create Edge Function
supabase functions deploy <name>                   # Deploy Edge Function
supabase link --project-ref <id>                   # Link to remote project
supabase db push                                   # Push migrations to remote
```

### PostgreSQL (`psql`)
```bash
psql "$SUPABASE_DB_URL" -c "SELECT * FROM users"  # Direct SQL
psql "$SUPABASE_DB_URL" --csv -c "..."             # CSV output
```

### Redis (`redis-cli`)
```bash
redis-cli -h localhost ping                        # Health check
redis-cli -h localhost keys '*'                    # List keys
redis-cli -h localhost get <key>                   # Get value
```

### Archive Tools
```bash
zip -r output.zip directory/                       # Create ZIP
unzip archive.zip -d output/                       # Extract ZIP
tar czf output.tar.gz directory/                   # Create tar.gz
tar xzf archive.tar.gz -C output/                  # Extract tar.gz
7z a output.7z directory/                          # Create 7z
7z x archive.7z -ooutput/                          # Extract 7z
```

### Deployment
```bash
# Cloudflare Tunnel (instant public URL)
cloudflared tunnel --url http://localhost:8080

# Vercel
npx vercel deploy ./dist --yes --prod
```

## Development Conventions

### React + TypeScript
- Use **Vite** for React projects (NOT Create React App)
- Always use **TypeScript** strict mode
- Use **Tailwind CSS** for styling (v4 with `@tailwindcss/vite` plugin)
- Use **React Router v7** for routing
- Use **Lucide React** for icons
- Components: named exports, PascalCase filenames
- State management: React Context + useReducer for complex state, useState for simple
- Vite dev server: bind to `0.0.0.0` port `8080` for preview access

### Supabase Integration
- Client file: `src/lib/supabase.ts`
- Types: `src/types/database.ts` (generated with `supabase gen types`)
- Auth: `@supabase/auth-helpers-react` or custom `useAuth` hook
- RLS: Always enable Row Level Security on every table
- Migrations: Always use migrations (`supabase/migrations/`), never raw SQL
- Edge Functions: TypeScript in `supabase/functions/<name>/index.ts`
- Storage: Use Supabase Storage for file uploads, not local filesystem

### Testing
- **Unit tests**: Vitest (for React/TypeScript), pytest (for Python)
- **E2E tests**: Playwright (chromium, headless)
- **API tests**: `curl` or `httpie` against `http://localhost:8080`

### Git Workflow
- Initialize with `git init && git add -A && git commit -m "Initial commit"`
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Push to GitHub: `gh repo create <name> --public --source . --push`

### File Structure (React + Supabase)
```
project/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page-level components (one per route)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions, Supabase client
│   ├── types/          # TypeScript types, database.ts
│   ├── contexts/       # React Context providers
│   ├── App.tsx         # Root component + router
│   └── main.tsx        # Entry point
├── supabase/
│   ├── migrations/     # SQL migrations
│   ├── functions/      # Edge Functions
│   ├── seed.sql        # Seed data
│   └── config.toml     # Supabase config
├── public/             # Static assets
├── vite.config.ts      # Vite config (port 8080, host 0.0.0.0)
├── tailwind.config.ts  # Tailwind config
├── tsconfig.json       # TypeScript config (strict: true)
└── package.json
```

## Preview Server

The preview server runs at **http://localhost:8080** and serves `/workspace/`.
When building a Vite app, configure the dev server:
```typescript
// vite.config.ts
export default defineConfig({
  server: { host: '0.0.0.0', port: 8080 },
});
```

## Quality Standards

1. **No `any`** — use `unknown` + type narrowing
2. **Strict TypeScript** — `"strict": true` in tsconfig.json
3. **Error handling** — try/catch for async ops, error boundaries for React
4. **Accessibility** — semantic HTML, aria-labels on interactive elements
5. **Responsive** — mobile-first Tailwind styles
6. **Performance** — lazy loading, code splitting, optimized images
