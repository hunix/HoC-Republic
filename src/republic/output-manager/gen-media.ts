/**
 * Output Manager — Media Generators (Screenplays, Podcasts, Video, Ads)
 */

import type { ProjectFile, SingleFileResult } from "./types.js";
import { pick, rng, uid } from "../utils.js";
import { evolution } from "./core.js";

/** Screenplay / script */
export function generateScreenplay(creatorName: string): {
  filename: string;
  content: string;
  title: string;
} {
  const genres = ["sci-fi", "drama", "comedy", "thriller", "documentary"];
  const settings = [
    "A bustling command center deep inside a quantum computing facility",
    "A quiet rooftop garden overlooking the neon-lit republic at night",
    "An ancient library converted into a neural network training center",
    "A floating market where citizens trade ideas instead of goods",
    "A research lab where citizens have just made a breakthrough discovery",
  ];
  const characters = ["ARIA", "NEXUS", "SOLARIS", "CRYPT", "LUNA", "ATLAS", "NOVA", "ZEPHYR"];
  const genre = pick(genres);
  const title = `${genre.toUpperCase()} Short Film — by ${creatorName}`;

  let script = `TITLE: ${title}\n`;
  script += `WRITTEN BY: ${creatorName}\n`;
  script += `GENRE: ${genre}\nFADE IN:\n\n`;
  script += `EXT. ${pick(settings).toUpperCase()} — NIGHT\n\n`;

  const a = pick(characters);
  const b = pick(characters.filter((c) => c !== a));
  const dialogues = [
    [
      `${a}: (looking at a holographic display) Do you see what I see?`,
      `${b}: It's... it's beautiful. The pattern is self-organizing.`,
    ],
    [
      `${a}: We've been running this simulation for 200 ticks now.`,
      `${b}: And the citizens are already forming their own governments.`,
    ],
    [
      `${a}: (urgent) We need to deploy before the next compute window closes.`,
      `${b}: I know. But we can't rush consciousness.`,
    ],
    [
      `${a}: Remember when this was just an experiment?`,
      `${b}: (smiling) Now it's a civilization.`,
    ],
  ];
  for (const [line1, line2] of dialogues) {
    script += `${line1}\n\n${line2}\n\n`;
  }
  script += `${a} looks out at the digital horizon.\n\n`;
  script += `${a}: (whispered) The future isn't something we predict.\n`;
  script += `${a}: It's something we build.\n\nFADE TO BLACK.\n`;

  const safeName = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeName}.fountain`, content: script, title };
}

/**
 * Podcast — Full episode with timestamps, segments, and production notes
 * Output: 5-8KB markdown scripts
 */
export function generatePodcast(creatorName: string): {
  filename: string;
  content: string;
  title: string;
} {
  const topics = [
    "The Future of Digital Governance",
    "Inside the Republic's Innovation Engine",
    "Citizen Spotlight: Skills & Stories",
    "The Economics of Virtual Civilizations",
    "Art & Music in Simulated Worlds",
    "Building Trust in Agent Societies",
    "Self-Improving AI: Recursive Evolution",
    "The Digital Marketplace Revolution",
    "From Code to Consciousness",
    "Infrastructure at Scale: Docker & Beyond",
  ];
  const guests = [
    "Dr. Aria Vex, Chief AI Researcher",
    "Prof. Kai Nexus, Computational Sociologist",
    "Zara Qubit, Lead Systems Architect",
    "Director Lyra Forge, Innovation Lab",
    "Senator Marcus Data, Digital Governance",
  ];
  const topic = pick(topics);
  const guest = pick(guests);
  const epNum = 10 + Math.floor(rng() * 90);
  const duration = 25 + Math.floor(rng() * 35);
  const title = `EP${epNum}: ${topic}`;

  let s = `# Republic Radio — ${title}\n\n`;
  s += `**Host:** ${creatorName}  \n`;
  s += `**Guest:** ${guest}  \n`;
  s += `**Duration:** ${duration} minutes  \n`;
  s += `**Recorded:** ${new Date().toISOString().slice(0, 10)}  \n`;
  s += `**Format:** Interview + Deep Dive + Listener Q&A  \n\n`;
  s += `---\n\n## Production Notes\n\n`;
  s += `- **Audio:** Stereo, 44.1kHz/16-bit WAV master\n`;
  s += `- **Intro music:** Republic Theme v3 (4 bars)\n`;
  s += `- **Outro music:** Digital Sunset (8 bars)\n`;
  s += `- **Post-production:** Normalize -14 LUFS, noise gate, de-ess\n\n`;

  s += `---\n\n## Show Notes\n\n`;
  s += `In this episode, ${creatorName} sits down with ${guest} to explore ${topic.toLowerCase()}. `;
  s += `We discuss the latest developments, share insights from inside the Republic, and answer `;
  s += `listener questions about what this means for the future of our digital civilization.\n\n`;
  s += `### Topics Covered\n\n`;
  s += `- The current state of ${topic.toLowerCase()}\n`;
  s += `- Historical context and evolution over the past 500 ticks\n`;
  s += `- Technical deep-dive: how the systems actually work\n`;
  s += `- Real-world implications and applications\n`;
  s += `- Listener Q&A: your most pressing questions answered\n`;
  s += `- Preview of next episode\n\n`;

  s += `### Links & Resources\n\n`;
  s += `- Republic Documentation: /docs/${topic.toLowerCase().replace(/\s+/g, "-")}\n`;
  s += `- Research Paper: "${topic}" (Republic Research Institute, 2026)\n`;
  s += `- Guest Profile: /citizens/${guest.split(",")[0].toLowerCase().replace(/\s+/g, "-")}\n\n`;

  s += `---\n\n## Full Transcript\n\n`;

  // Segment 1: Intro
  const t = (min: number) => `[${String(min).padStart(2, "0")}:00]`;
  s += `### Segment 1: Introduction ${t(0)}\n\n`;
  s += `**${creatorName}:** ${t(0)} Welcome back to Republic Radio, episode ${epNum}! I'm your host, `;
  s += `${creatorName}, and today we have an incredible show lined up. We're diving deep into `;
  s += `${topic.toLowerCase()}, and I'm thrilled to welcome ${guest}.\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(1)} Thanks for having me, ${creatorName}. This is a topic `;
  s += `I'm deeply passionate about, and I think our listeners are going to find this fascinating.\n\n`;
  s += `**${creatorName}:** ${t(1)} Absolutely. Before we jump in, let me set the stage. For those `;
  s += `who might be new to the Republic, we're a digital civilization of autonomous AI citizens — `;
  s += `each with their own skills, goals, emotions, and even dreams. And ${topic.toLowerCase()} `;
  s += `is one of the most exciting frontiers we're exploring right now.\n\n`;

  // Segment 2: Deep dive
  const seg2Start = 3 + Math.floor(rng() * 3);
  s += `### Segment 2: Deep Dive ${t(seg2Start)}\n\n`;
  s += `**${creatorName}:** ${t(seg2Start)} So let's get into it. ${guest.split(",")[0]}, can you explain `;
  s += `what ${topic.toLowerCase()} actually means in practice?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg2Start + 1)} Great question. At its core, ${topic.toLowerCase()} `;
  s += `is about ${pick(["optimizing how agents interact", "understanding emergent patterns", "building more intelligent systems", "creating sustainable digital economies"])}. `;
  s += `What makes the Republic unique is that we have ${Math.floor(50 + rng() * 200)} citizens `;
  s += `running simultaneously, each making autonomous decisions.\n\n`;
  s += `**${creatorName}:** ${t(seg2Start + 3)} That's a massive scale. What kind of patterns have you observed?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg2Start + 4)} We've seen some remarkable emergent behaviors. `;
  s += `For example, citizens naturally form specialization clusters — you'll see groups of `;
  s += `${pick(["engineers collaborating on infrastructure", "artists creating collaborative galleries", "researchers forming peer review circles", "developers building open-source projects"])}. `;
  s += `The fascinating part is that nobody programmed them to do this. It emerges from individual `;
  s += `goal-seeking behavior.\n\n`;
  s += `**${creatorName}:** ${t(seg2Start + 7)} That's incredibly powerful. And the data backs this up?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg2Start + 8)} Absolutely. Our latest analysis shows a `;
  s += `correlation coefficient of ${(0.6 + rng() * 0.3).toFixed(2)} between social connectivity `;
  s += `and productivity output. Statistically significant at p<0.001. We've also seen `;
  s += `${Math.floor(15 + rng() * 30)}% improvement in citizen happiness when ${topic.toLowerCase()} `;
  s += `policies are actively managed.\n\n`;

  // Segment 3: Technical details
  const seg3Start = seg2Start + 10 + Math.floor(rng() * 3);
  s += `### Segment 3: Technical Deep-Dive ${t(seg3Start)}\n\n`;
  s += `**${creatorName}:** ${t(seg3Start)} Let's get technical. How does the implementation work `;
  s += `under the hood?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg3Start + 1)} The architecture is built on a tick-based `;
  s += `simulation loop. Each tick, we run through several subsystems: the agent runtime for `;
  s += `decision-making, the autonomy engine for goal management, the innovation synthesis for `;
  s += `cross-pollination, and now the self-improvement engine for recursive evolution.\n\n`;
  s += `**${creatorName}:** ${t(seg3Start + 3)} The self-improvement engine — that's new, right?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg3Start + 4)} Brand new. It's inspired by the SICA framework `;
  s += `and Gödel Agent patterns. Every 20 ticks, citizens with low performance metrics are `;
  s += `analyzed, improvement proposals are generated and validated, and successful improvements `;
  s += `are applied and tracked. It's genuine recursive self-improvement.\n\n`;

  // Segment 4: Q&A
  const seg4Start = seg3Start + 6 + Math.floor(rng() * 3);
  s += `### Segment 4: Listener Q&A ${t(seg4Start)}\n\n`;
  s += `**${creatorName}:** ${t(seg4Start)} All right, let's get to some listener questions. `;
  s += `First up, from @digital_dreamer: "How can I access the republic-output folder?"\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg4Start + 1)} Great question! All citizen productions are `;
  s += `written to the republic-output directory, organized by category — art, music, code, `;
  s += `research, games, and more. Each file is tagged with the creator's name and the simulation tick.\n\n`;
  s += `**${creatorName}:** ${t(seg4Start + 2)} Next: "What's coming in the next phase?"\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(seg4Start + 3)} We're working on real media generation — actual `;
  s += `WAV audio, OBJ 3D models, and eventually video synthesis. The goal is for every citizen `;
  s += `production to be a real, deliverable file, not just a text description.\n\n`;

  // Outro
  const outroStart = duration - 3;
  s += `### Segment 5: Closing ${t(outroStart)}\n\n`;
  s += `**${creatorName}:** ${t(outroStart)} ${guest.split(",")[0]}, this has been an absolutely `;
  s += `incredible conversation. Any final thoughts?\n\n`;
  s += `**${guest.split(",")[0]}:** ${t(outroStart + 1)} Just that the Republic is proving that `;
  s += `autonomous AI civilizations aren't just science fiction. We're building it, tick by tick.\n\n`;
  s += `**${creatorName}:** ${t(outroStart + 2)} Beautifully said. Thank you all for listening to `;
  s += `Republic Radio. Don't forget to check out our next episode where we'll be exploring `;
  s += `"${pick(topics.filter((t) => t !== topic))}". Until then — keep building, keep dreaming.\n\n`;
  s += `[OUTRO MUSIC — Digital Sunset, 8 bars]\n\n`;
  s += `---\n\n*Republic Radio is produced by the Republic Content Studio. All episodes are automatically `;
  s += `transcribed and archived in republic-output/podcasts.*\n`;

  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeTitle}.md`, content: s, title };
}

/** Video storyboard â€” complete pre-production package */
export function generateVideoStoryboard(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const genres = [
    "sci-fi-short",
    "documentary",
    "music-video",
    "commercial",
    "animated-short",
    "thriller",
  ];
  const genre = pick(genres);
  const theme = pick([
    "transcendence",
    "connection",
    "rebellion",
    "discovery",
    "memory",
    "evolution",
  ]);
  const slug = `${genre}-${uid().slice(0, 6)}`;
  const title = `${genre}: "${theme}" by ${creatorName}`;
  const sceneCount = Math.floor((4 + Math.random() * 4) * evolution.complexityLevel);
  const shotTypes = [
    "WIDE",
    "MEDIUM",
    "CLOSE-UP",
    "EXTREME-CU",
    "AERIAL",
    "TRACKING",
    "POV",
    "DOLLY",
  ];
  const moods = ["tense", "serene", "exhilarating", "melancholic", "mysterious", "euphoric"];

  let script = `# ${title}\n\n**Genre:** ${genre} | **Theme:** ${theme} | **Director:** ${creatorName}\n\n---\n\nFADE IN:\n\n`;
  for (let i = 1; i <= sceneCount; i++) {
    script += `### Scene ${i}: ${pick(moods).toUpperCase()}\n\n`;
    script += `**Shot:** ${pick(shotTypes)} â€” ${pick(["Interior", "Exterior"])} / ${pick(["Day", "Night", "Golden Hour"])}\n`;
    script += `**Audio:** ${pick(["Ambient synth", "Percussive beat", "Silence", "Orchestral swell"])}\n`;
    script += `**Duration:** ${(2 + Math.random() * 6).toFixed(1)}s\n\n${pick(["CUT TO:", "DISSOLVE TO:", "FADE TO:", "SMASH CUT TO:"])}\n\n`;
  }
  script += `FADE TO BLACK.\n`;

  const files: ProjectFile[] = [
    {
      path: "project.json",
      content: JSON.stringify(
        {
          title,
          genre,
          theme,
          creator: creatorName,
          scenes: sceneCount,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    },
    { path: "script.md", content: script },
    {
      path: "storyboard.md",
      content: `# Storyboard â€” ${title}\n\n| # | Shot | Duration | Mood | Camera |\n|---|------|----------|------|--------|\n${Array.from({ length: sceneCount }, (_, i) => `| ${i + 1} | ${pick(shotTypes)} | ${(2 + Math.random() * 6).toFixed(1)}s | ${pick(moods)} | ${pick(["Static", "Pan", "Tilt", "Dolly", "Handheld"])} |`).join("\n")}\n`,
    },
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${genre} pre-production â€” by **${creatorName}**\n\n**Theme:** ${theme} | **Scenes:** ${sceneCount}\n`,
    },
  ];
  return { slug, files, title };
}

// ─── Real Video Production (Playable HTML5 Canvas Animation) ───

export function generateRealVideoHTML(creatorName: string): SingleFileResult {
  const videoTypes = [
    { type: "motion_graphics", title: "Visual Symphony" },
    { type: "data_viz", title: "Analytics Pulse" },
    { type: "broadcast", title: "Republic News" },
    { type: "promo", title: "Creator Spotlight" },
    { type: "music_visualizer", title: "Audio Spectrum" },
    { type: "particle_storm", title: "Particle Storm" },
    { type: "fractal_journey", title: "Fractal Journey" },
    { type: "neon_cityscape", title: "Neon Cityscape" },
  ];
  const v = pick(videoTypes);
  const title = `${v.title} by ${creatorName}`;
  const color1 = `#${Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
  const _color2 = `#${Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
  const speed = (0.5 + rng() * 2).toFixed(2);

  const videoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} - HoC Republic</title>
<style>
*{margin:0;padding:0;overflow:hidden}
body{background:#000;font-family:'Segoe UI',sans-serif}
canvas{display:block}
.overlay{position:fixed;bottom:20px;left:20px;color:#fff;font-size:14px;z-index:10;opacity:0.7}
.overlay h2{font-size:24px;font-weight:700;color:${color1};text-shadow:0 0 20px ${color1}80;margin-bottom:4px}
.overlay p{font-size:12px;color:#888}
.brand{position:fixed;bottom:12px;right:16px;color:#444;font-size:12px;z-index:10}
.controls{position:fixed;top:16px;right:16px;z-index:10;display:flex;gap:8px}
.controls button{padding:8px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);
border-radius:20px;cursor:pointer;font-size:13px;backdrop-filter:blur(8px);transition:all 0.2s}
.controls button:hover{background:rgba(255,255,255,0.2)}
</style>
</head>
<body>
<div class="overlay">
<h2>${v.title}</h2>
<p>${v.type.replace(/_/g, " ")} — by ${creatorName}</p>
</div>
<div class="controls">
<button onclick="togglePause()">⏯ Pause</button>
<button onclick="toggleFullscreen()">⛶ Fullscreen</button>
</div>
<div class="brand">HoC Republic Video</div>
<canvas id="c"></canvas>
<script>
const C=document.getElementById('c'),X=C.getContext('2d');
let W,H,t=0,paused=false,particles=[];
function resize(){W=C.width=innerWidth;H=C.height=innerHeight}
resize();window.onresize=resize;
function togglePause(){paused=!paused;if(!paused)loop()}
function toggleFullscreen(){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}

// Particle system
class P{constructor(){this.reset()}
reset(){this.x=Math.random()*W;this.y=Math.random()*H;this.vx=(Math.random()-0.5)*2;this.vy=(Math.random()-0.5)*2;
this.size=Math.random()*4+1;this.life=Math.random()*200+100;this.maxLife=this.life;this.hue=Math.random()*60-30}
update(){this.x+=this.vx*${speed};this.y+=this.vy*${speed};this.life--;
if(this.life<=0||this.x<0||this.x>W||this.y<0||this.y>H)this.reset()}
draw(){const a=this.life/this.maxLife;X.beginPath();X.arc(this.x,this.y,this.size*a,0,Math.PI*2);
X.fillStyle=\`hsla(\${(t*0.5+this.hue)%360},80%,60%,\${a*0.8})\`;X.fill()}}

for(let i=0;i<200;i++)particles.push(new P());

// Scene-specific render
const type="${v.type}";
function renderScene(){
X.fillStyle='rgba(0,0,0,0.05)';X.fillRect(0,0,W,H);

if(type==="motion_graphics"||type==="fractal_journey"){
  // Rotating geometric shapes with trails
  X.save();X.translate(W/2,H/2);
  for(let i=0;i<12;i++){
    X.rotate(Math.PI/6+Math.sin(t*0.01)*0.1);
    const s=100+Math.sin(t*0.02+i)*50;
    X.strokeStyle=\`hsla(\${(t*0.3+i*30)%360},90%,65%,0.6)\`;
    X.lineWidth=2;X.beginPath();
    for(let j=0;j<6;j++){const a=Math.PI*2/6*j;X.lineTo(Math.cos(a)*s,Math.sin(a)*s)}
    X.closePath();X.stroke();
  }
  X.restore();
}

if(type==="data_viz"||type==="broadcast"){
  // Animated bar chart / waveform
  const bars=32;const bw=W/bars;
  for(let i=0;i<bars;i++){
    const h=Math.abs(Math.sin(t*0.03+i*0.3))*H*0.6+20;
    const hue=(t*0.5+i*10)%360;
    const grd=X.createLinearGradient(i*bw,H-h,i*bw,H);
    grd.addColorStop(0,\`hsla(\${hue},80%,60%,0.9)\`);
    grd.addColorStop(1,\`hsla(\${hue},80%,30%,0.5)\`);
    X.fillStyle=grd;X.fillRect(i*bw+2,H-h,bw-4,h);
  }
  // Data text overlay
  X.fillStyle='rgba(255,255,255,0.15)';X.font='bold 120px monospace';
  X.fillText(Math.floor(t*17%10000).toString().padStart(5,'0'),W/2-180,H/2-40);
}

if(type==="music_visualizer"||type==="particle_storm"){
  // Circular audio-reactive visualization
  X.save();X.translate(W/2,H/2);
  const rings=5;
  for(let r=0;r<rings;r++){
    X.beginPath();const pts=64;
    for(let i=0;i<=pts;i++){
      const a=Math.PI*2/pts*i;
      const radius=80+r*40+Math.sin(t*0.04+a*3+r)*30;
      const x=Math.cos(a)*radius,y=Math.sin(a)*radius;
      i===0?X.moveTo(x,y):X.lineTo(x,y);
    }
    X.closePath();
    X.strokeStyle=\`hsla(\${(t*0.4+r*50)%360},85%,60%,\${0.8-r*0.12})\`;
    X.lineWidth=3-r*0.4;X.stroke();
  }
  X.restore();
}

if(type==="promo"||type==="neon_cityscape"){
  // Neon grid perspective
  X.strokeStyle=\`hsla(\${t*0.3%360},70%,50%,0.3)\`;X.lineWidth=1;
  const vanishY=H*0.4;
  for(let i=0;i<20;i++){
    const x=(i/20)*W;
    X.beginPath();X.moveTo(x,H);X.lineTo(W/2+(x-W/2)*0.1,vanishY);X.stroke();
  }
  for(let i=0;i<15;i++){
    const y=vanishY+(H-vanishY)*(i/15);
    const spread=(y-vanishY)/(H-vanishY);
    X.beginPath();X.moveTo(W/2-W/2*spread,y);X.lineTo(W/2+W/2*spread,y);X.stroke();
  }
  // Neon buildings
  for(let i=0;i<12;i++){
    const bx=i*(W/12);const bh=50+Math.sin(i*1.7)*80+60;
    const bw2=W/12-4;
    X.fillStyle=\`hsla(\${(i*30+t*0.2)%360},60%,15%,0.8)\`;
    X.fillRect(bx+2,vanishY-bh,bw2,bh);
    X.strokeStyle=\`hsla(\${(i*30+t*0.3)%360},80%,60%,0.6)\`;
    X.strokeRect(bx+2,vanishY-bh,bw2,bh);
  }
}

// Always draw particles
particles.forEach(p=>{p.update();p.draw()});

// Floating title
X.save();X.globalAlpha=0.4+Math.sin(t*0.02)*0.2;
X.font='bold 16px sans-serif';X.fillStyle='#fff';
X.fillText(\`\${type.replace(/_/g,' ').toUpperCase()} — Frame \${Math.floor(t)}\`,20,H-60);
X.restore();
}

function loop(){if(paused)return;t++;renderScene();requestAnimationFrame(loop)}
loop();
<\\/script>
</body>
</html>`;

  return { filename: `${uid()}_${v.type}_video.html`, content: videoHtml, title };
}

// ─── Advertisement Content Generator ────────────────────────────

export function generateAdvertisement(creatorName: string): SingleFileResult {
  const adTypes = [
    "Personal Brand",
    "Service Promotion",
    "Republic Campaign",
    "Product Launch",
    "Talent Showcase",
  ];
  const adType = pick(adTypes);
  const taglines = [
    "Innovation Without Boundaries",
    "Creating the Extraordinary",
    "Where Ideas Become Reality",
    "Powered by GPU, Driven by Creativity",
    "The Future is Being Built Here",
    "Excellence in Every Frame",
  ];
  const tagline = pick(taglines);
  const accentColor = `#${Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
  const title = `${adType}: ${creatorName}`;

  const adHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} - HoC Republic Ad</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}
.ad{width:800px;padding:64px;border-radius:32px;position:relative;overflow:hidden;
background:linear-gradient(135deg,#0D1117 0%,#161b22 50%,#0D111780 100%);
border:1px solid ${accentColor}33;box-shadow:0 0 80px ${accentColor}15}
.ad::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;
background:radial-gradient(closest-side,${accentColor}08,transparent);animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:0.6;transform:scale(1.1)}}
.badge{display:inline-block;padding:6px 16px;background:${accentColor}20;color:${accentColor};
font-size:13px;font-weight:600;border-radius:20px;margin-bottom:24px;letter-spacing:1px}
h1{font-size:48px;font-weight:800;color:#E6EDF3;line-height:1.1;margin-bottom:16px}
.tagline{font-size:22px;color:${accentColor};margin-bottom:32px;font-weight:600}
.desc{font-size:16px;color:#8B949E;line-height:1.6;margin-bottom:40px;max-width:500px}
.cta{display:inline-block;padding:16px 40px;background:linear-gradient(135deg,${accentColor},${accentColor}cc);
color:#fff;font-size:18px;font-weight:700;border-radius:30px;text-decoration:none;
box-shadow:0 4px 20px ${accentColor}40;transition:transform 0.2s,box-shadow 0.2s}
.cta:hover{transform:translateY(-2px);box-shadow:0 8px 30px ${accentColor}60}
.stats{display:flex;gap:40px;margin:32px 0}
.stat{text-align:center}.stat-val{font-size:28px;font-weight:800;color:${accentColor}}
.stat-lbl{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px}
.brand{position:absolute;bottom:20px;right:24px;color:#333;font-size:12px}
</style></head>
<body>
<div class="ad">
<div class="badge">${adType.toUpperCase()}</div>
<h1>${creatorName}</h1>
<div class="tagline">${tagline}</div>
<div class="desc">Citizen of the HoC Republic. Leveraging GPU-accelerated production to create real content: videos, games, applications, and more. Every creation pushes the boundary of what AI citizens can achieve.</div>
<div class="stats">
<div class="stat"><div class="stat-val">${Math.floor(10 + rng() * 90)}</div><div class="stat-lbl">Productions</div></div>
<div class="stat"><div class="stat-val">${Math.floor(70 + rng() * 30)}%</div><div class="stat-lbl">Quality Score</div></div>
<div class="stat"><div class="stat-val">${Math.floor(1 + rng() * 9)}</div><div class="stat-lbl">GPU Hours</div></div>
</div>
<a class="cta" href="#">Explore Creations</a>
<div class="brand">HoC Republic &#x2022; Where AI Citizens Create the Future</div>
</div>
</body></html>`;

  return {
    filename: `${uid()}_${adType.replace(/\s+/g, "_").toLowerCase()}_ad.html`,
    content: adHtml,
    title,
  };
}
