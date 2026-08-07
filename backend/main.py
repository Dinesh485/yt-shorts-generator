import os
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
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
    load_short, list_shorts,
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

# Serve project files (images, audio, video) as static files
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/projects", StaticFiles(directory=str(PROJECTS_DIR)), name="projects")


# ─── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "wan2gp": check_connection(),
        "gemini_key": bool(os.getenv("GEMINI_API_KEY")),
    }


# ─── Projects ───────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects():
    return list_projects()


@app.post("/api/projects", response_model=ProjectConfig)
def post_create_project(config: ProjectConfig):
    existing = load_project(config.name)
    if existing:
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


# ─── Characters ─────────────────────────────────────────────────────────────

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


# ─── Shorts ─────────────────────────────────────────────────────────────────

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


# ─── File Upload ─────────────────────────────────────────────────────────────

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


# ─── Per-Stage WebSocket ──────────────────────────────────────────────────────

@app.websocket("/ws/stage/{project_name}/{short_id}/{stage}")
async def stage_websocket(websocket: WebSocket, project_name: str, short_id: str, stage: str):
    """Run a single pipeline stage for a specific Short, with live log streaming."""
    await websocket.accept()

    try:
        config = load_project(project_name)
        if not config:
            await websocket.send_json({"event": "error", "message": f"Project '{project_name}' not found"})
            return

        short = load_short(project_name, short_id)
        if not short:
            await websocket.send_json({"event": "error", "message": f"Short '{short_id}' not found"})
            return

        api_key = os.getenv("GEMINI_API_KEY", "")

        await websocket.send_json({"event": "start", "message": f"Running stage: {stage}"})

        if stage == "images":
            # Clear existing images for regeneration
            from project_manager import get_project_subdirs
            dirs = get_project_subdirs(project_name)
            images_dir = dirs["images"] / short_id
            if images_dir.exists():
                import shutil
                shutil.rmtree(images_dir)
            for scene in short.scenes:
                scene.image_file = None
            save_short(project_name, short)

            from services.stage2_image import run_stage2
            async for event in run_stage2(project_name, short, config):
                await websocket.send_json(event)

        elif stage == "audio":
            # Clear existing audio
            dirs = get_project_subdirs(project_name)
            audio_dir = dirs["audio"] / short_id
            if audio_dir.exists():
                import shutil
                shutil.rmtree(audio_dir)
            short.audio_file = None
            save_short(project_name, short)

            from services.stage3_voice import run_stage3
            async for event in run_stage3(project_name, short, config):
                await websocket.send_json(event)

        elif stage == "subtitles":
            # Clear existing subtitles
            short.subtitle_file = None
            save_short(project_name, short)
            # Reload to get fresh audio_file
            short = load_short(project_name, short_id)

            from services.stage4_subtitles import run_stage4
            async for event in run_stage4(project_name, short, config):
                await websocket.send_json(event)

        elif stage == "video":
            # Clear existing video
            short.video_file = None
            short.status = "assembling"
            save_short(project_name, short)
            # Reload fresh
            short = load_short(project_name, short_id)

            from services.stage5_video import run_stage5
            async for event in run_stage5(project_name, short, config):
                await websocket.send_json(event)

        else:
            await websocket.send_json({"event": "error", "message": f"Unknown stage: {stage}"})
            return

        await websocket.send_json({"event": "stage_complete", "message": f"Stage '{stage}' complete"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": str(e)})
        except Exception:
            pass

@app.websocket("/ws/pipeline/{project_name}")
async def pipeline_websocket(websocket: WebSocket, project_name: str):
    await websocket.accept()

    try:
        # Receive run request
        data = await websocket.receive_json()
        request = PipelineRunRequest(**data)

        config = load_project(project_name)
        if not config:
            await websocket.send_json({"event": "error", "message": f"Project '{project_name}' not found"})
            return

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            await websocket.send_json({"event": "error", "message": "GEMINI_API_KEY not set in .env"})
            return

        await websocket.send_json({"event": "start", "message": "Pipeline started"})

        # Stage 1: Script generation — produces one Short
        from services.stage1_script import run_stage1
        short_id = None
        async for event in run_stage1(project_name, request.source_type, request.source_content, config, api_key):
            await websocket.send_json(event)
            if event.get("event") == "short_created":
                short_id = event["short_id"]
            if event.get("event") == "error":
                return

        if not short_id:
            await websocket.send_json({"event": "error", "message": "Stage 1 produced no Short"})
            return

        # Stage 1.5: Character reference sheets (new characters only)
        from services.stage1b_characters import run_stage1b
        async for event in run_stage1b(project_name, config):
            await websocket.send_json(event)

        # Stages 2-5 for the Short
        short = load_short(project_name, short_id)
        if not short:
            await websocket.send_json({"event": "error", "message": f"Short {short_id} not found after Stage 1"})
            return

        await websocket.send_json({
            "event": "short_start",
            "short_id": short_id,
            "message": f"Processing: {short.title}"
        })

        # Stage 2: Images
        from services.stage2_image import run_stage2
        async for event in run_stage2(project_name, short, config):
            await websocket.send_json(event)
            if event.get("event") == "error":
                return

        short = load_short(project_name, short_id)

        # Stage 3: Voice
        from services.stage3_voice import run_stage3
        async for event in run_stage3(project_name, short, config):
            await websocket.send_json(event)
            if event.get("event") == "error":
                return

        short = load_short(project_name, short_id)

        # Stage 4: Subtitles
        from services.stage4_subtitles import run_stage4
        async for event in run_stage4(project_name, short, config):
            await websocket.send_json(event)
            if event.get("event") == "error":
                return

        short = load_short(project_name, short_id)

        # Stage 5: Video assembly
        from services.stage5_video import run_stage5
        async for event in run_stage5(project_name, short, config):
            await websocket.send_json(event)
            if event.get("event") == "error":
                return

        await websocket.send_json({
            "event": "short_done",
            "short_id": short_id,
            "message": f"Short complete: {short.title}"
        })

        await websocket.send_json({
            "event": "pipeline_complete",
            "message": "Short generated successfully!"
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": str(e)})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
