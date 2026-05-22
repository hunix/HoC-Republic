import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  registerTool: (name: string, desc: string, schema: unknown, handler: (args: Record<string, unknown>) => unknown) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

const jobs = new Map<string, { id: string; status: string; progress?: number; error?: string; outputPath?: string | null }>();

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const pythonDir = path.join(__dirname, "python");
  const wrapperScript = path.join(pythonDir, "wrapper.py");

  // Write a transient wrapper script
  if (!fs.existsSync(pythonDir)) {
    fs.mkdirSync(pythonDir, { recursive: true });
  }

  if (!fs.existsSync(wrapperScript)) {
    const scriptContent = `
import sys
import json
import traceback
import soundfile as sf
import os

try:
    from zipvoice.luxvoice import LuxTTS
except Exception as e:
    print(json.dumps({"error": f"Import error: {e}"}))
    sys.exit(1)

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        text = input_data.get("text")
        ref_audio = input_data.get("reference_audio")
        out_path = input_data.get("output_path")
        model_id = "YatharthS/LuxTTS"
        
        lux_tts = LuxTTS(model_id, device='cuda')
        
        if ref_audio and os.path.exists(ref_audio):
            encoded_prompt = lux_tts.encode_prompt(ref_audio, rms=input_data.get("rms", 0.01))
            final_wav = lux_tts.generate_speech(text, encoded_prompt, num_steps=input_data.get("num_steps", 4))
        else:
            final_wav = lux_tts.generate_speech(text, None, num_steps=input_data.get("num_steps", 4))
            
        final_wav = final_wav.numpy().squeeze()
        sf.write(out_path, final_wav, 48000)
        
        print(json.dumps({"success": True, "output": out_path}))
    except Exception as e:
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
    fs.writeFileSync(wrapperScript, scriptContent, "utf-8");
  }

  function doGenerate(params: unknown): Promise<{ ok: boolean; outputPath?: string; jobId?: string; error?: string }> {
    const p = params as typeof params & { text?: string; target_lang?: string; reference_audio?: string; rms?: number; num_steps?: number };
    if (!p || typeof p !== "object") {
      return Promise.reject(new Error("Invalid parameters"));
    }

    const { text, reference_audio, rms, num_steps } = p;
    return new Promise((resolvePromise, reject) => {
      const jobId = "luxtts-" + Math.random().toString(36).slice(2, 9);
      const outputPath = path.join(dataDir, `${jobId}.wav`);
      
      jobs.set(jobId, { id: jobId, status: "processing", progress: 0 });

      const handle = spawn("python", [wrapperScript], { cwd: pythonDir });
      let stdout = "";
      let stderr = "";

      handle.stdout.on("data", (data: unknown) => {
        stdout += String(data);
        log.info(`[LuxTTS] stdout: ${String(data)}`);
      });

      handle.stderr.on("data", (data: unknown) => {
        stderr += String(data);
        log.info(`[LuxTTS] stderr: ${String(data)}`);
      });

      handle.stdin.write(JSON.stringify({
        text,
        reference_audio,
        output_path: outputPath,
        rms,
        num_steps
      }));
      handle.stdin.end();

      handle.on("close", (_code) => {
        try {
          const lines = stdout.trim().split("\n");
          let parsed;
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              parsed = JSON.parse(lines[i]);
              break;
            } catch {
                // Ignore parsing errors for intermediate
            }
          }

          if (parsed && parsed.success) {
            if (fs.existsSync(outputPath)) {
              try {
                const publicOutDir = path.resolve(process.cwd(), "public/republic-output");
                if (!fs.existsSync(publicOutDir)) {
                  fs.mkdirSync(publicOutDir, { recursive: true });
                }
                const finalOutName = `luxtts_${Date.now()}.wav`;
                fs.copyFileSync(outputPath, path.resolve(publicOutDir, finalOutName));

                log.info(`[LuxTTS] Output available at /republic-output/${finalOutName}`);
                jobs.set(jobId, { id: jobId, status: "completed", progress: 100, outputPath: finalOutName });
                resolvePromise({
                  ok: true,
                  outputPath: finalOutName,
                  jobId: jobId,
                });
              } catch (copyErr: unknown) {
                log.error(`[LuxTTS] Failed to copy output file: ${String(copyErr)}`);
                jobs.set(jobId, { id: jobId, status: "error", error: `Failed to process output audio: ${String(copyErr)}` });
                reject(new Error(`Failed to process output audio: ${String(copyErr)}`));
              }
            } else {
              jobs.set(jobId, { id: jobId, status: "error", error: "LuxTTS completed but no output file was generated." });
              reject(new Error("LuxTTS completed but no output file was generated."));
            }
          } else {
            const errReason = parsed ? parsed.error : "Unknown error";
            jobs.set(jobId, { id: jobId, status: "error", error: errReason, outputPath: null });
            reject(new Error(`Python script error: ${errReason}`));
          }
        } catch (parseError: unknown) {
          jobs.set(jobId, { id: jobId, status: "error", error: stderr || "Unknown Python error", outputPath: null });
          log.error("LuxTTS Python Error: " + stderr);
          reject(new Error(`Failed to parse Python output or unknown error: ${String(parseError)}. Stderr: ${stderr}`));
        }
      });

      handle.on("error", (err: unknown) => {
        log.error(`[LuxTTS] Process error: ${String(err)}`);
        jobs.set(jobId, { id: jobId, status: "error", error: `LuxTTS process failed to start: ${String(err)}` });
        reject(new Error(`LuxTTS process failed to start: ${String(err)}`));
      });
    });
  }

  registerTool("luxtts_generate", "Generate cloned speech with LuxTTS", {
    type: "object",
    properties: {
      text: { type: "string" },
      reference_audio: { type: "string", description: "Absolute path to reference audio (.wav/.mp3)" }
    }, required: ["text", "reference_audio"]
  }, (args) => doGenerate(args));

  const getJobStatus = (p: unknown) => {
    const req = p as { jobId?: string };
    return jobs.get(req?.jobId || "") || { error: "Job not found" };
  };

  registerGateway("luxtts.generate", doGenerate);
  registerGateway("luxtts.job-status", getJobStatus);

  log.info("[LuxTTS] Plugin registered: Tools & Gateway RPCs mapped.");
}
