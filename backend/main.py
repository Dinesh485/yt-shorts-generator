import asyncio
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from app_models import (
    ProjectConfig, ProjectSummary, Character,
    Short, PipelineRunRequest
)
from wan2gp_client import check_connection
from project_manager import (
    create_project, load_project, save_project,
    list_projects, delete_project,
    load_characters, save_characters,
    load_short, save_short, list_shorts,
    get_project_subdirs, get_project_dir,
    PROJECTS_DIR
)

load_dotenv()

app = FastAPI(title="YT Shorts Generator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/projects", StaticFiles(directory=str(PROJECTS_DIR)), name="projects")


# ─── Job registry ─────────────────────────────────────────────────────────────
# job_id → {"logs": [...], "done": bool, "error": str|None}
_jobs: dict[str, dict] = {}


def _new_job() -> str:
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {"logs": [], "done": False, "error": None}
    return job_id


def _log(job_id: str, msg: str):
    if job_id in _jobs:
        _jobs[job_id]["logs"].append(msg)


def _finish(job_id: str, error: str | None = None):
    if job_id in _jobs:
        _jobs[job_id]["done"] = True
        _jobs[job_id]["error"] = error


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "wan2gp": check_connection(),
        "gemini_key": bool(os.getenv("GEMINI_API_KEY")),
    }


# ─── Job log polling ──────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}/logs")
def get_job_logs(job_id: str, since: int = 0):
    """
    Return log lines for a running/finished job starting at `since` offset.
    Frontend polls this at ~1s while the job is active.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    lines = job["logs"][since:]
    return {
        "lines": lines,
        "total": len(job["logs"]),
        "done": job["done"],
        "error": job["error"],
    }


# ─── Projects ─────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects():
    return list_projects()


@app.post("/api/projects", response_model=ProjectConfig)
def post_create_project(config: ProjectConfig):
    if load_project(config.name):
        raise HTTPException(400, f"Project '{config.name}' already exists")
    return create_project(config)


@app.get("/api/projects/{name}", response_model=ProjectConfig)
def get_project(name: str):
    config = load_project(name)
    if not config:
        raise HTTPException(404, f"Project '{name}' not found")
    return config


@app.put("/api/projects/{name}", response_model=ProjectConfig)
def put_update_project(name: str, config: ProjectConfig):
    if not load_project(name):
        raise HTTPException(404, f"Project '{name}' not found")
    config.name = name
    save_project(config)
    return config


@app.delete("/api/projects/{name}")
def del_project(name: str):
    if not load_project(name):
        raise HTTPException(404, f"Project '{name}' not found")
    delete_project(name)
    return {"message": f"Project '{name}' deleted"}


# ─── Characters ───────────────────────────────────────────────────────────────

@app.get("/api/projects/{name}/characters", response_model=dict[str, Character])
def get_characters(name: str):
    if not load_project(name):
        raise HTTPException(404)
    return load_characters(name)


@app.put("/api/projects/{name}/characters/{char_name}", response_model=Character)
def put_character(name: str, char_name: str, character: Character):
    if not load_project(name):
        raise HTTPException(404)
    chars = load_characters(name)
    chars[char_name] = character
    save_characters(name, chars)
    return character


@app.delete("/api/projects/{name}/characters/{char_name}")
def del_character(name: str, char_name: str):
    if not load_project(name):
        raise HTTPException(404)
    chars = load_characters(name)
    if char_name not in chars:
        raise HTTPException(404, f"Character '{char_name}' not found")
    del chars[char_name]
    save_characters(name, chars)
    return {"message": f"Character '{char_name}' deleted"}


# ─── Shorts ───────────────────────────────────────────────────────────────────

@app.get("/api/projects/{name}/shorts", response_model=list[Short])
def get_shorts(name: str):
    if not load_project(name):
        raise HTTPException(404)
    return list_shorts(name)


@app.get("/api/projects/{name}/shorts/{short_id}", response_model=Short)
def get_short(name: str, short_id: str):
    short = load_short(name, short_id)
    if not short:
        raise HTTPException(404)
    return short


@app.get("/api/projects/{name}/shorts/{short_id}/segments")
def get_audio_segments(name: str, short_id: str):
    if not load_project(name):
        raise HTTPException(404)
    dirs = get_project_subdirs(name)
    audio_dir = dirs["audio"] / short_id
    if not audio_dir.exists():
        return []
    files = sorted(audio_dir.glob("seg_*.wav"))
    project_root = Path(__file__).parent.parent
    return [
        {"index": int(f.stem.split("_")[1]), "url": str(f.relative_to(project_root)).replace("\\", "/")}
        for f in files
    ]


# ─── File uploads ─────────────────────────────────────────────────────────────

@app.post("/api/projects/{name}/upload")
async def upload_source_file(name: str, file: UploadFile = File(...)):
    if not load_project(name):
        raise HTTPException(404)
    dirs = get_project_subdirs(name)
    file_path = dirs["source"] / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    return {"filename": file.filename, "size": len(content)}


@app.post("/api/projects/{name}/music")
async def upload_music_file(name: str, file: UploadFile = File(...)):
    if not load_project(name):
        raise HTTPException(404)
    dirs = get_project_subdirs(name)
    file_path = dirs["music"] / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    return {"filename": file.filename, "size": len(content)}



# ─── Background task runners ──────────────────────────────────────────────────

async def _run_stage_task(job_id: str, project_name: str, short_id: str, stage: str):
    try:
        config = load_project(project_name)
        if not config:
            _log(job_id, f"Error: project '{project_name}' not found")
            _finish(job_id, "project not found")
            return

        short = load_short(project_name, short_id)
        if not short:
            _log(job_id, f"Error: short '{short_id}' not found")
            _finish(job_id, "short not found")
            return

        def emit(event: dict):
            if event.get("message"):
                _log(job_id, event["message"])

        if stage == "images":
            dirs = get_project_subdirs(project_name)
            images_dir = dirs["images"] / short_id
            if images_dir.exists():
                import shutil; shutil.rmtree(images_dir)
            for scene in short.scenes:
                scene.image_file = None
            save_short(project_name, short)
            from services.stage2_image import run_stage2
            async for event in run_stage2(project_name, short, config):
                emit(event)

        elif stage == "audio":
            dirs = get_project_subdirs(project_name)
            audio_dir = dirs["audio"] / short_id
            if audio_dir.exists():
                import shutil; shutil.rmtree(audio_dir)
            short.audio_file = None
            save_short(project_name, short)
            from services.stage3_voice import run_stage3
            async for event in run_stage3(project_name, short, config):
                emit(event)

        elif stage == "subtitles":
            short.subtitle_file = None
            save_short(project_name, short)
            short = load_short(project_name, short_id)
            from services.stage4_subtitles import run_stage4
            async for event in run_stage4(project_name, short, config):
                emit(event)

        elif stage == "video":
            short.video_file = None
            short.status = "assembling"
            save_short(project_name, short)
            short = load_short(project_name, short_id)
            from services.stage5_video import run_stage5
            async for event in run_stage5(project_name, short, config):
                emit(event)

        else:
            _log(job_id, f"Error: unknown stage '{stage}'")
            _finish(job_id, f"unknown stage: {stage}")
            return

        _log(job_id, f"Stage '{stage}' complete")
        _finish(job_id)

    except Exception as e:
        _log(job_id, f"Error: {e}")
        _finish(job_id, str(e))


async def _run_pipeline_task(job_id: str, project_name: str, request: PipelineRunRequest):
    try:
        config = load_project(project_name)
        if not config:
            _finish(job_id, "project not found"); return

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            _finish(job_id, "GEMINI_API_KEY not set"); return

        def emit(event: dict):
            if event.get("message"):
                _log(job_id, event["message"])

        _log(job_id, "Pipeline started")

        from services.stage1_script import run_stage1
        short_id = None
        async for event in run_stage1(project_name, request.source_type, request.source_content, config, api_key):
            emit(event)
            if event.get("event") == "short_created":
                short_id = event["short_id"]
            if event.get("event") == "error":
                _finish(job_id, event.get("message", "stage 1 error")); return

        if not short_id:
            _finish(job_id, "Stage 1 produced no Short"); return

        from services.stage1b_characters import run_stage1b
        async for event in run_stage1b(project_name, config):
            emit(event)

        short = load_short(project_name, short_id)
        if not short:
            _finish(job_id, f"Short {short_id} not found after Stage 1"); return

        _log(job_id, f"Processing: {short.title}")

        from services.stage2_image import run_stage2
        async for event in run_stage2(project_name, short, config):
            emit(event)
            if event.get("event") == "error":
                _finish(job_id, event.get("message")); return

        short = load_short(project_name, short_id)

        from services.stage3_voice import run_stage3
        async for event in run_stage3(project_name, short, config):
            emit(event)
            if event.get("event") == "error":
                _finish(job_id, event.get("message")); return

        short = load_short(project_name, short_id)

        from services.stage4_subtitles import run_stage4
        async for event in run_stage4(project_name, short, config):
            emit(event)
            if event.get("event") == "error":
                _finish(job_id, event.get("message")); return

        short = load_short(project_name, short_id)

        from services.stage5_video import run_stage5
        async for event in run_stage5(project_name, short, config):
            emit(event)
            if event.get("event") == "error":
                _finish(job_id, event.get("message")); return

        _log(job_id, f"Short complete: {short.title}")
        _log(job_id, "Pipeline complete!")
        _finish(job_id)

    except Exception as e:
        _log(job_id, f"Error: {e}")
        _finish(job_id, str(e))


# ─── Job trigger endpoints ────────────────────────────────────────────────────

from pydantic import BaseModel

class StageRequest(BaseModel):
    short_id: str
    stage: str


@app.post("/api/projects/{name}/jobs/stage")
async def start_stage(name: str, req: StageRequest):
    """Start a single pipeline stage. Returns job_id immediately."""
    if not load_project(name):
        raise HTTPException(404)
    job_id = _new_job()
    asyncio.create_task(_run_stage_task(job_id, name, req.short_id, req.stage))
    return {"job_id": job_id}


@app.post("/api/projects/{name}/jobs/pipeline")
async def start_pipeline(name: str, req: PipelineRunRequest):
    """Start the full pipeline. Returns job_id immediately."""
    if not load_project(name):
        raise HTTPException(404)
    job_id = _new_job()
    asyncio.create_task(_run_pipeline_task(job_id, name, req))
    return {"job_id": job_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
