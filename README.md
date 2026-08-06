# YT Shorts Generator

Converts source text (books, mythology, any narrative) into YouTube Shorts with AI-generated images, voices, and karaoke subtitles.

## Pipeline

```
Source Text → Gemini (Script + Character Archive)
           → Wan2GP / Ideogram 4 (Character Reference Sheets)
           → Wan2GP / Krea 2 Raw (Scene Images)
           → Wan2GP / Qwen3-TTS (Voices)
           → WhisperX (Subtitles)
           → FFmpeg (Video Assembly)
```

## Project Structure

```
yt-shorts-generator/
├── backend/
│   ├── main.py                   # FastAPI app + WebSocket pipeline runner
│   ├── models.py                 # Pydantic data models
│   ├── project_manager.py        # Project/character/short file management
│   ├── wan2gp_client.py          # Wan2GP Python API wrapper
│   ├── services/
│   │   ├── stage1_script.py      # Gemini script generation
│   │   ├── stage1b_characters.py # Character reference sheet generation
│   │   ├── stage2_image.py       # Scene images (Krea 2 Raw)
│   │   ├── stage3_voice.py       # TTS (Qwen3-TTS)
│   │   ├── stage4_subtitles.py   # WhisperX + ASS karaoke subtitles
│   │   └── stage5_video.py       # FFmpeg video assembly
│   ├── .env                      # API keys and paths (not committed)
│   ├── .env.example              # Template — copy to .env and fill in
│   └── requirements.txt
├── frontend/                     # React + Tailwind UI
├── start.bat                     # Starts backend + frontend
└── projects/                     # All generated content (not committed)
    └── <project-name>/
        ├── project.json
        ├── characters.json
        ├── characters/           # Character reference sheet images
        ├── source/               # Input text files
        ├── shorts/               # Short JSONs (pipeline state)
        ├── images/               # Scene images
        ├── audio/                # Stitched WAVs + transcripts
        ├── voices/               # Character voice samples
        ├── music/                # Background music tracks
        └── output/               # Final MP4 videos
```

---

## Setup

### 1. Clone the repo
```cmd
git clone <your-repo-url>
cd yt-shorts-generator
```

### 2. Configure .env
```cmd
copy backend\.env.example backend\.env
```
Edit `backend/.env` — set your Gemini API key, the Wan2GP installation folder, and the path to Wan2GP's Python venv (check your Wan2GP folder, it may be named `venv`, `.venv`, `env`, etc.):
```
GEMINI_API_KEY=your_key_here
WAN2GP_PATH=C:\WanGP
WAN2GP_VENV=C:\WanGP\venv
```

### 3. Install all dependencies
```cmd
install.bat
```
Reads `WAN2GP_VENV` from `.env`, installs backend deps into Wan2GP's venv, and runs `npm install` for the frontend.

### 4. Start
```cmd
start.bat
```
Reads `WAN2GP_VENV` from `.env` automatically and opens backend at http://localhost:8000 and frontend at http://localhost:5173.

---

## Usage

1. Open http://localhost:5173
2. Create a new project (name, art style, target duration)
3. Go to the project → Run Pipeline tab
4. Choose source: paste text / enter URL / upload file
5. Click **Run Pipeline** and watch the live log
6. Click any completed Short to preview and download

---

## Notes

- `projects/` is gitignored — all generated content stays local
- Character reference sheets and voice samples are generated once per character and reused across all Shorts
- The pipeline is resumable — already-generated assets are skipped on re-run
- Wan2GP does not need to be running separately — the backend imports it directly via its Python API
