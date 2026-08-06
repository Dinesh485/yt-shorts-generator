"""
Stage 3: Generate voice audio via Wan2GP (Qwen3-TTS)
- New characters get a voice sample generated and stored in the archive
- Existing characters are cloned from their stored sample
- All segments stitched into one WAV per Short
"""
import subprocess
from pathlib import Path
from typing import AsyncGenerator

import imageio_ffmpeg

from app_models import Short, ProjectConfig
from project_manager import (
    save_short, get_project_subdirs,
    load_characters, save_characters
)
from wan2gp_client import generate_tts_voice_design, generate_tts_clone

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Fixed sample text used to generate each new character's voice sample
VOICE_SAMPLE_TEXT = (
    "In the beginning, before all things, there was only silence "
    "and the eternal void, from which all creation would spring forth."
)


async def ensure_voice_sample(
    char_name: str,
    project_name: str,
    config: ProjectConfig,
) -> Path | None:
    """
    Ensure a character has a voice sample. Generate one if missing.
    Returns the path to the sample WAV, or None on failure.
    """
    dirs = get_project_subdirs(project_name)
    voices_dir = dirs["voices"]
    voices_dir.mkdir(parents=True, exist_ok=True)

    characters = load_characters(project_name)
    char = characters.get(char_name)
    if not char:
        return None

    sample_path = voices_dir / f"{char_name.lower().replace(' ', '_')}_sample.wav"

    if char.voice_profile.sample_generated and sample_path.exists():
        return sample_path

    # Generate sample using Voice Design
    success = generate_tts_voice_design(
        text=VOICE_SAMPLE_TEXT,
        output_path=sample_path,
        voice_description=char.voice_profile.personality,
        language=config.language[:2].lower() if config.language != "English" else "english",
    )

    if success:
        char.voice_profile.sample_audio = str(
            sample_path.relative_to(Path(__file__).parent.parent.parent)
        )
        char.voice_profile.sample_generated = True
        characters[char_name] = char
        save_characters(project_name, characters)
        return sample_path

    return None


def stitch_audio(segment_files: list[Path], output_path: Path, pause_ms: int = 300) -> bool:
    """Concatenate audio segments with short pauses between them using FFmpeg."""
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Generate a short silence file
        pause_path = output_path.parent / "_pause.wav"
        subprocess.run([
            FFMPEG, "-y", "-f", "lavfi",
            "-i", f"anullsrc=r=24000:cl=mono:d={pause_ms/1000}",
            str(pause_path)
        ], capture_output=True)

        # Write concat list
        concat_list = output_path.parent / "_concat.txt"
        with open(concat_list, "w") as f:
            for i, seg in enumerate(segment_files):
                f.write(f"file '{seg.absolute()}'\n")
                if i < len(segment_files) - 1:
                    f.write(f"file '{pause_path.absolute()}'\n")

        result = subprocess.run([
            FFMPEG, "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-ar", "24000", "-ac", "1",
            str(output_path)
        ], capture_output=True)

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

    dirs = get_project_subdirs(project_name)
    audio_dir = dirs["audio"] / short.short_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    characters = load_characters(project_name)

    short.status = "generating_audio"
    save_short(project_name, short)

    # Flatten all audio segments across all scenes
    all_segments = []
    for scene in short.scenes:
        all_segments.extend(scene.audio_sequence)

    segment_files: list[Path] = []
    total = len(all_segments)

    for i, segment in enumerate(all_segments):
        seg_file = audio_dir / f"seg_{i:03d}.wav"

        if seg_file.exists():
            segment.audio_file = str(seg_file)
            segment_files.append(seg_file)
            continue

        if segment.type == "narration":
            personality = config.voice.narrator_personality
            emotion = segment.voice_instruction or "measured, clear"
            voice_desc = f"{personality}, {emotion}"
            reference = None

        else:
            char_name = segment.character or "narrator"
            char = characters.get(char_name)

            if not char:
                voice_desc = f"{config.voice.default_character_personality}, {segment.voice_instruction or 'expressive'}"
                reference = None
            else:
                emotion = segment.voice_instruction or "expressive"
                voice_desc = f"{char.voice_profile.personality}, {emotion}"

                # Ensure voice sample exists for cloning
                reference = await ensure_voice_sample(char_name, project_name, config)

        yield {
            "event": "progress",
            "message": f"Audio {i+1}/{total}: [{segment.type}] {segment.text[:60]}..."
        }

        success = generate_tts_clone(
            text=segment.text,
            output_path=seg_file,
            reference_audio=reference,
            language="auto",
            emotion=segment.voice_instruction,
        ) if reference else generate_tts_voice_design(
            text=segment.text,
            output_path=seg_file,
            voice_description=voice_desc,
            language="auto",
        )

        if success:
            segment.audio_file = str(seg_file)
            segment_files.append(seg_file)
        else:
            yield {"event": "warning", "message": f"TTS failed for segment {i}"}

    # Stitch all segments
    if segment_files:
        final_audio = dirs["audio"] / f"{short.short_id}.wav"
        yield {"event": "progress", "message": "Stitching audio segments..."}
        if stitch_audio(segment_files, final_audio):
            short.audio_file = str(final_audio.relative_to(Path(__file__).parent.parent.parent))
        else:
            yield {"event": "warning", "message": "Audio stitching failed"}

    save_short(project_name, short)
    yield {"event": "stage_complete", "stage": 3, "message": f"Stage 3 complete for {short.short_id}"}
