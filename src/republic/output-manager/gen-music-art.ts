/**
 * Output Manager — Music, Art, and Animation Generators
 */

import type { ProjectFile } from "./types.js";
import { pick, rng, uid } from "../utils.js";
import { evolution } from "./core.js";

export function generateMusicScore(creatorName: string): {
  filename: string;
  content: string;
  title: string;
  isBinary?: true;
} {
  const titles = [
    "Digital Sunrise",
    "Neural Lullaby",
    "Electric Dreams",
    "Quantum Waltz",
    "Republic Anthem",
    "Midnight Algorithm",
    "Stardust Sonata",
    "Binary Blues",
    "Chromatic Cascade",
    "Data Stream Serenade",
    "Circuit Symphony",
    "Pixelated Moonlight",
    "Neon Reverie",
    "Fractal Nocturne",
    "Silicon Elegy",
    "Cyber Rhapsody",
  ];
  const title = `${pick(titles)} by ${creatorName}`;
  const sampleRate = 22050;
  const tempo = 80 + Math.floor(rng() * 100); // 80-180 BPM
  const beatDuration = 60 / tempo;
  const totalBars = 8 + Math.floor(rng() * 16);
  const beatsPerBar = 4;
  const totalSamples = Math.floor(totalBars * beatsPerBar * beatDuration * sampleRate);

  // Note frequencies (Hz)
  const noteFreqs: Record<string, number> = {
    C3: 130.81,
    D3: 146.83,
    E3: 164.81,
    F3: 174.61,
    G3: 196.0,
    A3: 220.0,
    B3: 246.94,
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.0,
    A4: 440.0,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.26,
    F5: 698.46,
    G5: 783.99,
    A5: 880.0,
  };

  // Chord progressions
  const progressions = [
    [
      ["C4", "E4", "G4"],
      ["F4", "A4", "C5"],
      ["G4", "B4", "D5"],
      ["C4", "E4", "G4"],
    ],
    [
      ["A3", "C4", "E4"],
      ["F3", "A3", "C4"],
      ["G3", "B3", "D4"],
      ["A3", "C4", "E4"],
    ],
    [
      ["D4", "F4", "A4"],
      ["G4", "B4", "D5"],
      ["C4", "E4", "G4"],
      ["D4", "F4", "A4"],
    ],
    [
      ["E4", "G4", "B4"],
      ["A3", "C4", "E4"],
      ["D4", "F4", "A4"],
      ["E4", "G4", "B4"],
    ],
  ];
  const chords = pick(progressions);

  // Melody scale
  const scales = [
    ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5"],
    ["A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"],
    ["D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"],
  ];
  const scale = pick(scales);

  // PCM sample buffer
  const samples = new Int16Array(totalSamples);

  // ADSR envelope
  function adsr(t: number, duration: number): number {
    const a = 0.05,
      d = 0.1,
      s = 0.6,
      r = 0.15;
    if (t < a) {
      return t / a;
    }
    if (t < a + d) {
      return 1.0 - ((t - a) / d) * (1.0 - s);
    }
    if (t < duration - r) {
      return s;
    }
    return s * ((duration - t) / r);
  }

  // Synthesize a note into the buffer
  function addNote(
    freq: number,
    startSample: number,
    durationSec: number,
    amplitude: number,
  ): void {
    const count = Math.min(Math.floor(durationSec * sampleRate), totalSamples - startSample);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const env = adsr(t, durationSec);
      // Fundamental + soft overtone for richness
      const val =
        Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
      const sampleVal = Math.floor(val * env * amplitude * 16000);
      const idx = startSample + i;
      if (idx < totalSamples) {
        samples[idx] = Math.max(-32768, Math.min(32767, samples[idx] + sampleVal));
      }
    }
  }

  // Render chords (pad layer)
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const startSample = Math.floor(bar * beatsPerBar * beatDuration * sampleRate);
    for (const noteName of chord) {
      const freq = noteFreqs[noteName] ?? 440;
      addNote(freq * 0.5, startSample, beatsPerBar * beatDuration * 0.9, 0.25);
    }
  }

  // Render melody
  for (let bar = 0; bar < totalBars; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      if (rng() < 0.7) {
        // 70% density
        const noteName = scale[Math.floor(rng() * scale.length)];
        const freq = noteFreqs[noteName] ?? 440;
        const startSample = Math.floor((bar * beatsPerBar + beat) * beatDuration * sampleRate);
        const dur = beatDuration * (rng() < 0.3 ? 2 : 1) * 0.8;
        addNote(freq, startSample, dur, 0.5);
      }
    }
  }

  // Render bass line
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const rootNote = chord[0];
    const freq = (noteFreqs[rootNote] ?? 261) * 0.5; // octave down
    const startSample = Math.floor(bar * beatsPerBar * beatDuration * sampleRate);
    addNote(freq, startSample, beatsPerBar * beatDuration * 0.7, 0.35);
  }

  // Build WAV file
  const dataSize = totalSamples * 2; // 16-bit = 2 bytes per sample
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < totalSamples; i++) {
    view.setInt16(headerSize + i * 2, samples[i], true);
  }

  const base64 = Buffer.from(buf).toString("base64");
  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  const filename = `${uid()}_${safeTitle}.wav`;

  return { filename, content: base64, title, isBinary: true };
}

/** Procedural SVG artwork â€” multi-file with viewer */
export function generateArtwork(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const styles = [
    "geometric",
    "organic",
    "glitch",
    "mandala",
    "circuit",
    "constellation",
    "fractal",
    "wave",
  ];
  const style = pick(styles);
  const slug = `${style}-art-${uid().slice(0, 6)}`;
  const title = `${style} artwork by ${creatorName}`;
  const palette = pick([
    ["#6366f1", "#ec4899", "#10b981", "#f59e0b"],
    ["#ff006e", "#8338ec", "#3a86ff", "#fb5607"],
    ["#264653", "#2a9d8f", "#e9c46a", "#f4a261"],
    ["#0d1b2a", "#1b263b", "#415a77", "#778da9"],
  ]);
  const cx = evolution.complexityLevel;
  const count = Math.floor((8 + Math.random() * 12) * cx);

  let shapes = "";
  for (let i = 0; i < count; i++) {
    const color = palette[i % palette.length];
    const opacity = (0.3 + Math.random() * 0.7).toFixed(2);
    if (style === "geometric" || style === "circuit") {
      const x = Math.floor(Math.random() * 800);
      const y = Math.floor(Math.random() * 600);
      const w = 20 + Math.floor(Math.random() * 100);
      const r = Math.floor(Math.random() * 12);
      shapes += `  <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${r}" fill="${color}" opacity="${opacity}" transform="rotate(${Math.floor(Math.random() * 360)} ${x + w / 2} ${y + w / 2})"/>\n`;
    } else if (style === "mandala" || style === "fractal") {
      const angle = (i / count) * 360;
      const rad = 100 + Math.random() * 180;
      const px = 400 + Math.cos((angle * Math.PI) / 180) * rad;
      const py = 300 + Math.sin((angle * Math.PI) / 180) * rad;
      shapes += `  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(10 + Math.random() * 40).toFixed(1)}" fill="${color}" opacity="${opacity}"/>\n`;
    } else if (style === "wave" || style === "organic") {
      const x1 = Math.random() * 800,
        y1 = Math.random() * 600;
      const x2 = Math.random() * 800,
        y2 = Math.random() * 600;
      const cpx = Math.random() * 800,
        cpy = Math.random() * 600;
      shapes += `  <path d="M${x1.toFixed(0)},${y1.toFixed(0)} Q${cpx.toFixed(0)},${cpy.toFixed(0)} ${x2.toFixed(0)},${y2.toFixed(0)}" stroke="${color}" stroke-width="${(1 + Math.random() * 4).toFixed(1)}" fill="none" opacity="${opacity}"/>\n`;
    } else {
      const px = Math.random() * 800,
        py = Math.random() * 600;
      shapes += `  <circle cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" r="${(2 + Math.random() * 8).toFixed(1)}" fill="${color}" opacity="${opacity}"/>\n`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">\n  <rect width="800" height="600" fill="#0a0a0f"/>\n${shapes}</svg>`;

  const files: ProjectFile[] = [
    { path: "artwork.svg", content: svg },
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${style} procedural artwork â€” by **${creatorName}**\n\n**Elements:** ${count} | **Complexity:** ${cx.toFixed(1)}x\n`,
    },
    {
      path: "viewer.html",
      content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{margin:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;min-height:100vh}svg{max-width:90vw;max-height:90vh;filter:drop-shadow(0 0 30px rgba(99,102,241,0.3))}</style></head><body>${svg}</body></html>`,
    },
  ];
  return { slug, files, title };
}

/** Interactive CSS/JS animation â€” creative coding sketch */
export function generateAnimation(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const types = [
    "particle-field",
    "wave-simulation",
    "neural-web",
    "aurora-borealis",
    "matrix-rain",
    "starfield-warp",
  ];
  const type = pick(types);
  const slug = `${type}-${uid().slice(0, 6)}`;
  const title = `${type} animation by ${creatorName}`;
  const particleCount = Math.floor(200 * evolution.complexityLevel);

  const files: ProjectFile[] = [
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${type} animation â€” by **${creatorName}** | **Particles:** ${particleCount}\n`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><link rel="stylesheet" href="style.css"></head><body><canvas id="c"></canvas><div class="info">${type} â€” ${creatorName}</div><script src="animation.js"></script></body></html>`,
    },
    {
      path: "style.css",
      content: `*{margin:0;padding:0;overflow:hidden}body{background:#000}canvas{display:block}.info{position:fixed;bottom:1rem;right:1rem;color:rgba(255,255,255,0.3);font:12px/1 monospace}`,
    },
    {
      path: "animation.js",
      content: `// ${title}\nconst canvas=document.getElementById('c'),ctx=canvas.getContext('2d');\nlet W,H;function resize(){W=canvas.width=innerWidth;H=canvas.height=innerHeight}resize();addEventListener('resize',resize);\nconst N=${particleCount},P=[];\nfor(let i=0;i<N;i++)P.push({x:Math.random()*2000-500,y:Math.random()*2000-500,vx:(Math.random()-0.5)*2,vy:(Math.random()-0.5)*2,s:1+Math.random()*3,h:Math.random()*60+220,l:Math.random()});\nlet mx=W/2,my=H/2;canvas.onmousemove=e=>{mx=e.clientX;my=e.clientY};\nfunction frame(t){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,W,H);\nfor(const p of P){const dx=mx-p.x,dy=my-p.y,d=Math.sqrt(dx*dx+dy*dy)||1,f=Math.min(50/d,0.5);\np.vx+=dx/d*f*0.1+Math.sin(t*0.001+p.l*6.28)*0.1;p.vy+=dy/d*f*0.1+Math.cos(t*0.001+p.l*6.28)*0.1;\np.vx*=0.99;p.vy*=0.99;p.x+=p.vx;p.y+=p.vy;\nif(p.x<-50)p.x=W+50;if(p.x>W+50)p.x=-50;if(p.y<-50)p.y=H+50;if(p.y>H+50)p.y=-50;\nconst a=0.3+0.7*Math.abs(Math.sin(t*0.002+p.l*3.14));\nctx.beginPath();ctx.arc(p.x,p.y,p.s,0,6.28);ctx.fillStyle=\`hsla(\${p.h+Math.sin(t*0.001)*30},80%,60%,\${a})\`;ctx.fill();}\nrequestAnimationFrame(frame)}frame(0);\n`,
    },
  ];
  return { slug, files, title };
}
