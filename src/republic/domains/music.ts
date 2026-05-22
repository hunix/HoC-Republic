import type { SeedDomain } from "./seed-data.js";

export const musicDomains: SeedDomain[] = [
  {
    path: "Arts.Music",
    name: "Music",
    description: "Theory, composition, performance, and music technology",
    coreSkills: ["music-theory", "ear-training", "harmony", "rhythm-analysis", "sight-reading"],
    minPracticeLevel: "certificate",
  },
  {
    path: "Arts.Music.Composition",
    name: "Music Composition",
    description: "Orchestration, arrangement, songwriting, and score production",
    coreSkills: ["orchestration", "arrangement", "counterpoint", "scoring", "music-notation"],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Arts.Music.SoundEngineering",
    name: "Sound Engineering",
    description: "Recording, mixing, mastering, and audio signal processing",
    coreSkills: [
      "recording-techniques",
      "mixing",
      "mastering",
      "signal-processing",
      "daw-proficiency",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Arts.Music.MusicAI",
    name: "Music AI",
    description: "AI-driven music generation, audio synthesis, and intelligent composition",
    coreSkills: [
      "audio-synthesis",
      "generative-models",
      "music-information-retrieval",
      "neural-audio-codecs",
      "midi-processing",
    ],
    minPracticeLevel: "master",
  },
];
