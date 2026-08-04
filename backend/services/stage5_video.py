"""
Stage 5: Assemble final video with FFmpeg
Images + Ken Burns + Transitions + Audio + Subtitles + Background Music
"""
import json
import subprocess
import tempfile
from pathlib import Path
from typing import AsyncGenerator

from models import Short, ProjectConfig, TransitionType, MusicConfig
from project_manager import save_short, get_project_subdirs


def build_ffmpeg_command(
    short: Short,
    config: ProjectConfig,
    output_path: Path,
    project_dir: Path,
) -> list[str]:
    """
    Build the FFmpeg command to assemble the final video.
    """
    video_cfg = config.video
    sub_cfg = config.subtitles
    music_cfg = config.music

    # Collect scene images and their durations
    scenes_with_images = [
        s for s in short.scenes
        if s.image_file and Path(s.image_file).exists()
    ]

    if not scenes_with_images:
        raise ValueError("No scene images found")

    audio_path = Path(short.audio_file) if short.audio_file else None
    subtitle_path = Path(short.subtitle_file) if short.subtitle_file else None

    # Determine background music
    music_moods = [s.mood for s in short.scenes]
    primary_mood = max(set(music_moods), key=music_moods.count) if music_moods else "default"
    music_lib = music_cfg.library
    music_file = (
        getattr(music_lib, primary_mood, None)
        or music_lib.default
    )
    if music_file:
        music_path = project_dir / music_file
        if not music_path.exists():
            music_path = None
    else:
        music_path = None

    cmd = ["ffmpeg", "-y"]

    # Input images
    for scene in scenes_with_images:
        cmd += ["-loop", "1", "-t", str(scene.duration_estimate), "-i", str(scene.image_file)]

    # Input audio
    audio_input_idx = len(scenes_with_images)
    if audio_path and audio_path.exists():
        cmd += ["-i", str(audio_path)]

    # Input background music
    music_input_idx = None
    if music_path:
        music_input_idx = audio_input_idx + (1 if audio_path else 0)
        cmd += ["-i", str(music_path)]

    # Build filter complex
    filters = []
    n = len(scenes_with_images)

    for i, scene in enumerate(scenes_with_images):
        if video_cfg.ken_burns:
            # Ken Burns: alternating zoom-in and pan effects
            dur = scene.duration_estimate
            fps = 25
            total_frames = dur * fps
            zoom_speed = 0.0003

            if i % 3 == 0:
                # Slow zoom in
                filters.append(
                    f"[{i}:v]scale=1200:2133,"
                    f"zoompan=z='min(zoom+{zoom_speed},1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                    f":d={total_frames}:s=1080x1920:fps={fps}[v{i}]"
                )
            elif i % 3 == 1:
                # Pan left to right
                filters.append(
                    f"[{i}:v]scale=1200:1920,"
                    f"zoompan=z=1.1:x='if(lte(on,1),0,min(x+1,iw/zoom-iw/zoom/2))':y='ih/2-(ih/zoom/2)'"
                    f":d={total_frames}:s=1080x1920:fps={fps}[v{i}]"
                )
            else:
                # Slow zoom out
                filters.append(
                    f"[{i}:v]scale=1200:2133,"
                    f"zoompan=z='if(lte(on,1),1.2,max(zoom-{zoom_speed},1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                    f":d={total_frames}:s=1080x1920:fps={fps}[v{i}]"
                )
        else:
            filters.append(f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v{i}]")

    # Concatenate with transitions
    if n == 1:
        filters.append(f"[v0]copy[vout]")
    else:
        td = video_cfg.transition_duration
        if video_cfg.transition == TransitionType.crossfade:
            # Chain xfade filters
            prev = "v0"
            for i in range(1, n):
                dur_so_far = sum(scenes_with_images[j].duration_estimate for j in range(i))
                offset = dur_so_far - td
                out = f"vx{i}" if i < n - 1 else "vout"
                filters.append(
                    f"[{prev}][v{i}]xfade=transition=fade:duration={td}:offset={max(0, offset)}[{out}]"
                )
                prev = f"vx{i}"
        elif video_cfg.transition == TransitionType.fade_black:
            prev = "v0"
            for i in range(1, n):
                dur_so_far = sum(scenes_with_images[j].duration_estimate for j in range(i))
                offset = dur_so_far - td
                out = f"vx{i}" if i < n - 1 else "vout"
                filters.append(
                    f"[{prev}][v{i}]xfade=transition=fadeblack:duration={td}:offset={max(0, offset)}[{out}]"
                )
                prev = f"vx{i}"
        else:
            # Hard cut — simple concat
            concat_inputs = "".join(f"[v{i}]" for i in range(n))
            filters.append(f"{concat_inputs}concat=n={n}:v=1:a=0[vout]")

    # Audio mixing
    if audio_path and audio_path.exists():
        if music_path and music_input_idx is not None:
            # Mix voice + background music
            vol = music_cfg.volume
            filters.append(
                f"[{audio_input_idx}:a]volume=1.0[voice];"
                f"[{music_input_idx}:a]volume={vol},aloop=loop=-1:size=2e+09[music];"
                f"[voice][music]amix=inputs=2:duration=first[aout]"
            )
            audio_map = "[aout]"
        else:
            audio_map = f"{audio_input_idx}:a"
    else:
        audio_map = None

    filter_str = ";".join(filters)
    cmd += ["-filter_complex", filter_str]

    # Map video
    cmd += ["-map", "[vout]"]

    # Map audio
    if audio_map:
        if audio_map.startswith("["):
            cmd += ["-map", audio_map]
        else:
            cmd += ["-map", audio_map]

    # Burn subtitles if available
    if subtitle_path and subtitle_path.exists():
        # Use ass filter for burning
        ass_escaped = str(subtitle_path).replace("\\", "/").replace(":", "\\:")
        cmd += ["-vf", f"ass='{ass_escaped}'"]

    # Output settings
    cmd += [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-r", "25",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(output_path)
    ]

    return cmd


async def run_stage5(
    project_name: str,
    short: Short,
    config: ProjectConfig,
) -> AsyncGenerator[dict, None]:
    """
    Assemble the final video for a Short.
    """
    from project_manager import get_project_dir
    dirs = get_project_subdirs(project_name)
    project_dir = get_project_dir(project_name)

    output_dir = dirs["output"]
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{short.short_id}.mp4"

    short.status = "assembling"
    save_short(project_name, short)

    yield {"event": "progress", "message": "Building FFmpeg command..."}

    try:
        cmd = build_ffmpeg_command(short, config, output_path, project_dir)
        yield {"event": "progress", "message": "Running FFmpeg assembly..."}

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            yield {
                "event": "error",
                "message": f"FFmpeg failed: {result.stderr[-500:]}"
            }
            short.status = "error"
            short.error = result.stderr[-500:]
            save_short(project_name, short)
            return

        short.video_file = str(output_path.relative_to(Path(__file__).parent.parent.parent))
        short.status = "done"
        save_short(project_name, short)

        yield {
            "event": "video_done",
            "short_id": short.short_id,
            "path": str(output_path),
            "message": f"Video assembled: {output_path.name}"
        }

    except Exception as e:
        yield {"event": "error", "message": f"Assembly error: {e}"}
        short.status = "error"
        short.error = str(e)
        save_short(project_name, short)
        return

    yield {"event": "stage_complete", "stage": 5, "message": f"Stage 5 complete for {short.short_id}"}
