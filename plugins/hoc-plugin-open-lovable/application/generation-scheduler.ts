/**
 * Application — Generation Scheduler
 *
 * FIFO job queue for Open Lovable website cloning and generation.
 */

import type { CloneRequest, GenerationJob, LovableConfig } from "../domain/types.ts";
import { cloneWebsite } from "../infrastructure/lovable-engine.ts";

const jobs = new Map<string, GenerationJob>();
let running = false;
let config: LovableConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: LovableConfig): void {
  config = cfg;
}

export function submitCloneJob(params: {
  citizenId: string;
  citizenName: string;
  request: CloneRequest;
}): GenerationJob {
  const id = `lovable-${Date.now()}-${nextId++}`;
  const job: GenerationJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    mode: "clone",
    sourceUrl: params.request.url,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  drainQueue();
  return job;
}

function drainQueue(): void {
  if (running || !config) {
    return;
  }
  const next = Array.from(jobs.values()).find((j) => j.status === "queued");
  if (!next) {
    return;
  }
  runJob(next);
}

function runJob(job: GenerationJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "scraping";
  job.progress = 20;

  cloneWebsite(
    config,
    job.sourceUrl ?? "",
    undefined,
    (deployUrl) => {
      job.status = "completed";
      job.progress = 100;
      job.deployUrl = deployUrl;
      job.completedAt = Date.now();
      running = false;
      drainQueue();
    },
    (err) => {
      job.status = "failed";
      job.error = err;
      job.completedAt = Date.now();
      running = false;
      drainQueue();
    },
  );
}

export function getJob(id: string): GenerationJob | undefined {
  return jobs.get(id);
}

export function listAllJobs(): GenerationJob[] {
  return Array.from(jobs.values());
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== "queued") {
    return false;
  }
  job.status = "cancelled";
  job.completedAt = Date.now();
  return true;
}

export function getQueueStatus(): {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(jobs.values());
  return {
    total: all.length,
    queued: all.filter((j) => j.status === "queued").length,
    running: all.filter(
      (j) => j.status === "scraping" || j.status === "generating" || j.status === "deploying",
    ).length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
  };
}

// ─── Demo Seed ──────────────────────────────────────────────────

const CITIZEN_NAMES = [
  { id: "cit_demo_01", name: "Aria Shadowmere" },
  { id: "cit_demo_02", name: "Nova Nightbloom" },
  { id: "cit_demo_03", name: "Silas Ironforge" },
  { id: "cit_demo_04", name: "Ember Brighthollow" },
  { id: "cit_demo_05", name: "Kai Goldleaf" },
  { id: "cit_demo_06", name: "Rune Frostpeak" },
];

export function seedDemoData(): void {
  if (jobs.size > 0) {
    return; // already seeded
  }
  const now = Date.now();

  // ── Completed: Hacker News clone (Gemini + Vercel) ──
  const hnGeneratedCode = `// --- FILE: src/App.tsx ---
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import StoryList from './components/StoryList';
import StoryDetail from './components/StoryDetail';
import { stories } from './data/stories';

function App() {
  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'Verdana, Geneva, sans-serif', background: '#f6f6ef', minHeight: '100vh' }}>
        <Header />
        <Routes>
          <Route path="/" element={<StoryList stories={stories} />} />
          <Route path="/story/:id" element={<StoryDetail stories={stories} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

// --- FILE: src/components/Header.tsx ---
import React from 'react';

export default function Header() {
  return (
    <header style={{ background: '#ff6600', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src="/hn-logo.png" alt="Y Combinator" width={18} height={18} style={{ borderRadius: 2 }} />
      <b style={{ color: '#fff', fontSize: 13 }}>Hacker News</b>
      <nav style={{ marginLeft: 8, fontSize: 13 }}>
        <a href="/" style={{ color: '#fff', marginRight: 8 }}>new</a>
        <a href="/past" style={{ color: '#fff', marginRight: 8 }}>past</a>
        <a href="/comments" style={{ color: '#fff', marginRight: 8 }}>comments</a>
        <a href="/ask" style={{ color: '#fff', marginRight: 8 }}>ask</a>
        <a href="/show" style={{ color: '#fff', marginRight: 8 }}>show</a>
        <a href="/jobs" style={{ color: '#fff', marginRight: 8 }}>jobs</a>
        <a href="/submit" style={{ color: '#fff' }}>submit</a>
      </nav>
    </header>
  );
}

// --- FILE: src/components/StoryList.tsx ---
import React from 'react';
import { Link } from 'react-router-dom';
import type { Story } from '../data/stories';

export default function StoryList({ stories }: { stories: Story[] }) {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '8px 0' }}>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {stories.map((story, idx) => (
          <li key={story.id} style={{ display: 'flex', gap: 4, padding: '4px 2px', fontSize: 13, borderBottom: '1px solid #f0ede0' }}>
            <span style={{ color: '#999', minWidth: 24, textAlign: 'right' }}>{idx + 1}.</span>
            <div>
              <Link to={'/story/' + story.id} style={{ color: '#000', fontWeight: 500 }}>{story.title}</Link>
              {story.domain && <span style={{ color: '#999', fontSize: 11, marginLeft: 4 }}>({story.domain})</span>}
              <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>
                {story.score} points by <b>{story.by}</b> | {story.comments} comments
              </div>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

// --- FILE: src/data/stories.ts ---
export interface Story {
  id: number; title: string; url?: string; domain?: string;
  by: string; score: number; comments: number; time: number;
}
export const stories: Story[] = [
  { id: 1, title: 'Ask HN: What are you working on?', by: 'citizen_aria', score: 892, comments: 341, time: Date.now() - 3600000 },
  { id: 2, title: 'Open-source AI model achieves GPT-4 level performance', url: 'https://arxiv.org/abs/example', domain: 'arxiv.org', by: 'citizen_nova', score: 1247, comments: 203, time: Date.now() - 7200000 },
  { id: 3, title: 'The Art of Readable Code', url: 'https://books.com', domain: 'books.com', by: 'citizen_kai', score: 445, comments: 87, time: Date.now() - 14400000 },
];

// --- FILE: src/index.tsx ---
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
const root = createRoot(document.getElementById('root')!);
root.render(<App />);`;

  const hnClone: GenerationJob = {
    id: "lovable-demo-hn-001",
    citizenId: CITIZEN_NAMES[0].id,
    citizenName: CITIZEN_NAMES[0].name,
    mode: "clone",
    sourceUrl: "https://news.ycombinator.com/",
    status: "completed",
    progress: 100,
    scrapedContent:
      "<!DOCTYPE html><html><!-- Scraped 47 elements, 3 navigation sections, 30 story items -->",
    generatedCode: hnGeneratedCode,
    deployUrl: "https://hn-clone-demo.vercel.app",
    createdAt: now - 7200000,
    completedAt: now - 6900000,
  };
  jobs.set(hnClone.id, hnClone);

  // ── Currently generating: Stripe Dashboard (Anthropic + E2B) ──
  const stripeClone: GenerationJob = {
    id: "lovable-demo-stripe-002",
    citizenId: CITIZEN_NAMES[1].id,
    citizenName: CITIZEN_NAMES[1].name,
    mode: "clone",
    sourceUrl: "https://dashboard.stripe.com/",
    status: "generating",
    progress: 55,
    scrapedContent:
      "<!DOCTYPE html><html><!-- Scraped 124 elements, 8 chart components, 15 table rows, 4 navigation panes -->",
    createdAt: now - 300000,
  };
  jobs.set(stripeClone.id, stripeClone);

  // ── Currently scraping: Linear landing page (OpenAI + Vercel) ──
  const linearClone: GenerationJob = {
    id: "lovable-demo-linear-003",
    citizenId: CITIZEN_NAMES[2].id,
    citizenName: CITIZEN_NAMES[2].name,
    mode: "clone",
    sourceUrl: "https://linear.app/",
    status: "scraping",
    progress: 15,
    createdAt: now - 120000,
  };
  jobs.set(linearClone.id, linearClone);

  // ── Completed: Portfolio site (Groq, fast generation) ──
  const portfolioGeneratedCode = `// --- FILE: src/App.tsx ---
import React, { useState } from 'react';
import Hero from './components/Hero';
import Projects from './components/Projects';
import About from './components/About';
import Contact from './components/Contact';
import './styles.css';

export default function App() {
  const [activeSection, setActiveSection] = useState('hero');
  return (
    <div className="portfolio">
      <nav className="sidebar">
        {['hero','projects','about','contact'].map(s => (
          <button key={s} onClick={() => setActiveSection(s)} className={activeSection === s ? 'active' : ''}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </nav>
      <main className="content">
        {activeSection === 'hero' && <Hero />}
        {activeSection === 'projects' && <Projects />}
        {activeSection === 'about' && <About />}
        {activeSection === 'contact' && <Contact />}
      </main>
    </div>
  );
}

// --- FILE: src/components/Hero.tsx ---
import React from 'react';
export default function Hero() {
  return (
    <section style={{ textAlign: 'center', padding: '80px 40px' }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🌟</div>
      <h1 style={{ fontSize: 48, fontWeight: 800, background: 'linear-gradient(135deg,#667eea,#764ba2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Aria Shadowmere
      </h1>
      <p style={{ fontSize: 20, color: '#64748b', marginTop: 8 }}>Full-Stack Engineer · AI Specialist · Open Source Contributor</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
        <a href="#projects" style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>View Projects</a>
        <a href="#contact" style={{ padding: '12px 28px', border: '2px solid #667eea', color: '#667eea', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Contact Me</a>
      </div>
    </section>
  );
}

// --- FILE: src/components/Projects.tsx ---
import React from 'react';
const projects = [
  { name: 'AI Poetry Generator', tech: ['Python', 'GPT-4', 'React'], stars: 2847, desc: 'Generates personalized poems using fine-tuned language models.' },
  { name: 'Open Source LLM Router', tech: ['TypeScript', 'Node.js', 'Redis'], stars: 1203, desc: 'Intelligent routing between multiple LLM providers with fallback.' },
  { name: 'Real-time Collaboration SDK', tech: ['WebSockets', 'CRDT', 'Rust'], stars: 891, desc: 'Drop-in SDK for adding real-time collaboration to any web app.' },
];
export default function Projects() {
  return (
    <section style={{ padding: 40 }}>
      <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 32 }}>Featured Projects</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 24 }}>
        {projects.map(p => (
          <div key={p.name} style={{ padding: 24, borderRadius: 16, background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 8px' }}>{p.name}</h3>
            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px' }}>{p.desc}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.tech.map(t => <span key={t} style={{ padding: '2px 10px', background: '#667eea22', color: '#667eea', borderRadius: 12, fontSize: 12 }}>{t}</span>)}
            </div>
            <div style={{ marginTop: 12, color: '#f59e0b', fontSize: 13 }}>⭐ {p.stars.toLocaleString()} stars</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- FILE: src/styles.css ---
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: #fff; color: #1e293b; }
.portfolio { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
.sidebar { background: #1e293b; padding: 24px 16px; display: flex; flex-direction: column; gap: 8px; }
.sidebar button { padding: 10px 16px; border: none; border-radius: 8px; background: transparent; color: #94a3b8; cursor: pointer; text-align: left; font-size: 14px; transition: all 0.2s; }
.sidebar button.active, .sidebar button:hover { background: rgba(102,126,234,0.2); color: #667eea; }
.content { overflow-y: auto; }`;

  const portfolioClone: GenerationJob = {
    id: "lovable-demo-portfolio-004",
    citizenId: CITIZEN_NAMES[3].id,
    citizenName: CITIZEN_NAMES[3].name,
    mode: "clone",
    sourceUrl: "https://brittanychiang.com/",
    status: "completed",
    progress: 100,
    scrapedContent:
      "<!DOCTYPE html><html><!-- Scraped 38 elements, hero section, projects grid, about section -->",
    generatedCode: portfolioGeneratedCode,
    deployUrl: "https://portfolio-clone-demo.vercel.app",
    createdAt: now - 5400000,
    completedAt: now - 5280000,
  };
  jobs.set(portfolioClone.id, portfolioClone);

  // ── Deploying: GitHub landing page ──
  const githubClone: GenerationJob = {
    id: "lovable-demo-github-005",
    citizenId: CITIZEN_NAMES[4].id,
    citizenName: CITIZEN_NAMES[4].name,
    mode: "clone",
    sourceUrl: "https://github.com/",
    status: "deploying",
    progress: 85,
    scrapedContent:
      "<!DOCTYPE html><html><!-- Scraped 95 elements, hero animations, feature cards, stats section -->",
    generatedCode: "// React App — 15 components, 4 sections\n// ... 3,412 lines",
    createdAt: now - 240000,
  };
  jobs.set(githubClone.id, githubClone);

  // ── Failed: Auth-protected page ──
  const failedClone: GenerationJob = {
    id: "lovable-demo-fail-006",
    citizenId: CITIZEN_NAMES[5].id,
    citizenName: CITIZEN_NAMES[5].name,
    mode: "clone",
    sourceUrl: "https://app.notion.so/private-workspace",
    status: "failed",
    progress: 8,
    error:
      "Scraping failed: 403 Forbidden — target page requires authentication. Clone only works with publicly accessible pages.",
    createdAt: now - 3600000,
    completedAt: now - 3540000,
  };
  jobs.set(failedClone.id, failedClone);

  // ── Queued: Waiting for GPU ──
  const queuedClone: GenerationJob = {
    id: "lovable-demo-queue-007",
    citizenId: CITIZEN_NAMES[0].id,
    citizenName: CITIZEN_NAMES[0].name,
    mode: "clone",
    sourceUrl: "https://www.producthunt.com/",
    status: "queued",
    progress: 0,
    createdAt: now - 60000,
  };
  jobs.set(queuedClone.id, queuedClone);
}
