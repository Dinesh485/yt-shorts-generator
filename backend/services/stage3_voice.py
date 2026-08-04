"""
Stage 3: Generate voice audio using Qwen3-TTS via Wan2GP API
"""
import asyncio
import json
import subprocess
from pathlib import Path
from typing import AsyncGenerator

from models import Short, AudioSegment, ProjectConfig, Character
from project_manager import (
    save_short, get_project_subdirs,
    load_characters, save_characters
)

# Sample text used to generate the initial voice sample for a new character
VOICE_SAMPLE_TEXT = (
    "In the beginning, before all things, there was only silence and the eternal void, "
    "from which all creation would eventually spring forth."
)

WAN2GP_API_BASE = "http://localhost:7860"  # Wan2GP default port


async def call_wan2gp_tts(
    text: str,
    voice_description: str,
    reference_audio: Path | None,
    output_path: Path,
) -> bool:
    """
    Call Wan2GP's Qwen3-TTS via its API.
    If reference_audio is provided, use voice cloning mode.
    Otherwise use description-based generation.
    """
    try:
        import httpx

        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "text": text,
            "voice_description": voice_description,
        }
        if reference_audio and reference_audio.exists():
            # Voice cloning mode — upload reference audio
            async with httpx.AsyncClient(timeout=120) as client:
                with open(reference_audio, "rb") as f:
                    resp = await client.post(
                        f"{WAN2GP_API_BASE}/api/tts/clone",
                        data={"text": text},
                        files={"reference_audio": f},
                    )
        else:
            # Description-based generation
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{WAN2GP_API_BASE}/api/tts/generate",
                    json=payload,
                )

        if resp.status_code == 200:
            output_path.write_bytes(resp.content)
            return True
        else:
            print(f"[TTS] Error {resp.status_code}: {resp.text}")
            return False

    except Exception as e:
        print(f"[TTS] Exception: {e}")
        return False


async def ensure_character_voice_sample(
    character: Character,
    project_name: str,
    config: ProjectConfig,
) -> Character:
    """
    If the character doesn't have a voice sample yet, generate one.
    """
    dirs = get_project_subdirs(project_name)
    voices_dir = dirs["voices"]
    voices_dir.mkdir(parents=True, exist_ok=True)

    sample_path = voices_dir / f"{character.name.lower().replace(' ', '_')}_sample.wav"

    if not character.voice_profile.sample_generated or not sample_path.exists():
        success = await call_wan2gp_tts(
            text=VOICE_SAMPLE_TEXT,
            voice_description=character.voice_profile.personality,
            reference_audio=None,
            output_path=sample_path,
        )
        if success:
            character.voice_profile.sample_audio = str(
                sample_path.relative_to(Path(__file__).parent.parent.parent)
            )
            character.voice_profile.sample_generated = True

    return character


async def stitch_audio_segments(
    segment_files: list[Path],
    output_path: Path,
    pause_duration_ms: int = 300,
) -> bool:
    """
    Stitch multiple audio files together with pauses using FFmpeg.
    """
    try:
        if not segment_files:
            return False

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Create a silent pause file
        pause_path = output_path.parent / "_pause.wav"
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"anullsrc=r=24000:cl=mono:d={pause_duration_ms/1000}",
            str(pause_path)
        ], capture_output=True)

        # Build concat list
        concat_list = output_path.parent / "_concat.txt"
        with open(concat_list, "w") as f:
            for i, seg in enumerate(segment_files):
                f.write(f"file '{seg.absolute()}'\n")
                if i < len(segment_files) - 1:
                    f.write(f"file '{pause_path.absolute()}'\n")

        result = subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-ar", "24000", "-ac", "1",
            str(output_path)
        ], capture_output=True)

        # Cleanup temp files
        concat_list.unlink(missing_ok=True)
        pause_path.unlink(missing_ok=True)

        return result.returncode == 0

    except Exception as e:
        print(f"[Audio stitch] Error: {e}")
        return False


async def run_stage3(
    project_name: str,
    short: Short,
    config: ProjectConfig,
) -> AsyncGenerator[dict, None]:
    """
    Generate all voice audio for a Short and stitch into one file.
    """
    dirs = get_project_subdirs(project_name)
    audio_dir = dirs["audio"] / short.short_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    characters = load_characters(project_name)

    short.status = "generating_audio"
    save_short(project_name, short)

    # Collect all audio segments across all scenes
    all_segments: list[AudioSegment] = []
    for scene in short.scenes:
        all_segments.extend(scene.audio_sequence)

    segment_files: list[Path] = []
    chars_updated = False

    total = len(all_segments)
    for i, segment in enumerate(all_segments):
        seg_file = audio_dir / f"seg_{i:03d}.wav"

        if seg_file.exists():
            segment.audio_file = str(seg_file)
            segment_files.append(seg_file)
            continue

        if segment.type == "narration":
            personality = config.voice.narrator_personality
            voice_instruction = segment.voice_instruction or "measured, clear"
            full_description = f"{personality}, {voice_instruction}"
            reference_audio = None
        else:
            char_name = segment.character or "narrator"
            character = characters.get(char_name)

            if not character:
                # Create a basic character entry if missing
                character = Character(
                    name=char_name,
                    description=char_name,
                    role="character",
                    first_seen=project_name,
                )
                characters[char_name] = character
                chars_updated = True

            # Ensure voice sample exists
            character = await ensure_character_voice_sample(character, project_name, config)
            characters[char_name] = character
            chars_updated = True

            base_personality = character.voice_profile.personality
            voice_instruction = segment.voice_instruction or "expressive"
            full_description = f"{base_personality}, {voice_instruction}"

            reference_audio = None
            if character.voice_profile.sample_audio:
                ref_path = Path(__file__).parent.parent.parent / character.voice_profile.sample_audio
                if ref_path.exists():
                    reference_audio = ref_path

        yield {
            "event": "progress",
            "message": f"Generating audio {i+1}/{total}: {segment.type} - {segment.text[:50]}..."
        }

        success = await call_wan2gp_tts(
            text=segment.text,
            voice_description=full_description,
            reference_audio=reference_audio,
            output_path=seg_file,
        )

        if success:
            segment.audio_file = str(seg_file)
            segment_files.append(seg_file)
            yield {"event": "audio_segment_done", "index": i}
        else:
            yield {"event": "warning", "message": f"Audio generation failed for segment {i}"}

    if chars_updated:
        save_characters(project_name, characters)

    # Stitch all segments into one file
    if segment_files:
        final_audio = dirs["audio"] / f"{short.short_id}.wav"
        yield {"event": "progress", "message": "Stitching audio segments..."}
        success = await stitch_audio_segments(segment_files, final_audio)
        if success:
            short.audio_file = str(final_audio.relative_to(Path(__file__).parent.parent.parent))
            yield {"event": "progress", "message": "Audio stitching complete"}
        else:
            yield {"event": "warning", "message": "Audio stitching failed"}

    save_short(project_name, short)
    yield {"event": "stage_complete", "stage": 3, "message": f"Stage 3 complete for {short.short_id}"}
