# YT Shorts Generator

Automated pipeline that converts source text (books, mythology, any narrative) into YouTube Shorts with AI-generated images, voices, and karaoke subtitles.

## Pipeline

```
Source Text → Gemini (Script) → FLUX/Imagen (Images) → Qwen3-TTS (Voices) → WhisperX (Subtitles) → FFmpeg (Video)
```

## Project Structure

```
yt-shorts-generator/
├── backend/                  # FastAPI backend
│   ├── main.py               # API + WebSocket pipeline runner
│   ├── models.py             # Pydantic data models
│   ├── project_manager.py    # Project/character/short file management
│   ├── services/
│   │   ├── stage1_script.py  # Gemini script generation
│   │   ├── stage2_image.py   # FLUX local / Gemini Imagen
│   │   ├── stage3_voice.py   # Qwen3-TTS via Wan2GP
│   │   ├── stage4_subtitles.py # WhisperX + ASS karaoke
│   │   └── stage5_video.py   # FFmpeg assembly
│   ├── .env                  # API keys (not committed)
│   └── requirements.txt
├── frontend/                 # React + Tailwind UI
├── venv/                     # Python virtual environment (not committed)
├── start.bat                 # Starts both backend and frontend
└── projects/                 # All project data (not committed)
    └── mahabharata/
        ├── project.json
        ├── characters.json
        ├── source/           # Input text files
        ├── shorts/           # Generated short JSONs
        ├── images/           # Scene images
        ├── audio/            # Voice audio + transcripts
        ├── voices/           # Character voice samples
        ├── music/            # Background music tracks
        └── output/           # Final MP4 videos
```

---

## Setup on Desktop (GPU machine - RX 9070 XT)

### 1. Pull from Git
```cmd
git clone <your-repo-url>
cd yt-shorts-generator
```

### 2. Python environment
```cmd
python -m venv venv
venv\Scripts\activate
pip install -r backend\requirements.txt
```

> **Note:** On the desktop, run the backend **inside Wan2GP's own venv** (the one with AMD PyTorch), not a separate venv. This is because `wan2gp_client.py` imports `shared/api.py` directly from the Wan2GP folder — it needs Wan2GP's dependencies available.
>
> Alternatively, install this project's requirements into Wan2GP's venv:
> ```cmd
> cd C:\WanGP
> venv\Scripts\pip install fastapi uvicorn python-multipart aiofiles pydantic google-generativeai python-dotenv httpx websockets imageio-ffmpeg whisperx
> ```

### 3. Install PyTorch for AMD RX 9070 XT (gfx1201)
Make sure the venv is active, then run:
```cmd
pip install --pre torch torchaudio torchvision rocm[devel] --index-url https://rocm.nightlies.amd.com/v2/gfx120X-all/
```

### 4. Install GPU pipeline dependencies
```cmd
pip install diffusers>=0.30.0 transformers>=4.40.0 accelerate>=0.30.0
pip install whisperx
```

### 5. Install and run Wan2GP (for TTS)
```cmd
git clone https://github.com/deepbeepmeep/Wan2GP.git
cd Wan2GP
# Follow Wan2GP README to start the server on port 7860
```

### 6. Set up API keys and paths
Edit `backend/.env`:
```
GEMINI_API_KEY=your_key_here
WAN2GP_PATH=C:\WanGP
```

### 7. Start everything
```cmd
start.bat
```

---

## Setup on Laptop (dev machine, no GPU)

### 1. Frontend only
```cmd
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 — it proxies API calls to your desktop's backend at port 8000.

### 2. Point the UI at your desktop
In `frontend/vite.config.ts`, change the proxy target from `localhost` to your desktop's local IP:
```ts
proxy: {
  '/api': { target: 'http://192.168.x.x:8000', changeOrigin: true },
  '/ws':  { target: 'ws://192.168.x.x:8000', ws: true },
}
```

---

## Running the Pipeline

1. Open http://localhost:5173
2. Create a new project (name, art style, image engine, target duration)
3. Go to the project → Run Pipeline tab
4. Choose source: paste text / enter URL / upload file
5. Click **Run Pipeline** — watch the log stream
6. When done, click any Short card to preview and download

---

## Notes

- The `projects/` folder is gitignored — all generated content stays local
- Character archive (`characters.json`) is built automatically and persists across pipeline runs
- Voice samples are generated once per character and reused for consistency
- Pipeline is resumable — already-generated images/audio are skipped on re-run
