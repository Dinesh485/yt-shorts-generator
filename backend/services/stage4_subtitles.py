"""
Stage 4: Transcribe audio with WhisperX → word-level JSON → ASS karaoke subtitles
"""
import json
import math
from pathlib import Path
from typing import AsyncGenerator

from models import Short, ProjectConfig, SubtitleStyle
from project_manager import save_short, get_project_subdirs


def transcribe_with_whisperx(audio_path: Path, language: str = "en") -> dict:
    """
    Run WhisperX on the audio file and return word-level transcript.
    """
    import whisperx

    device = "cpu"
    compute_type = "int8"
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
    except ImportError:
        pass

    # Load and transcribe
    model = whisperx.load_model("base", device, compute_type=compute_type)
    audio = whisperx.load_audio(str(audio_path))
    result = model.transcribe(audio, batch_size=16, language=language[:2])

    # Align for word-level timestamps
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"], device=device
    )
    result = whisperx.align(
        result["segments"], model_a, metadata, audio, device,
        return_char_alignments=False
    )

    return result


def words_to_ass_karaoke(
    words: list[dict],
    config: ProjectConfig,
    video_width: int = 1080,
    video_height: int = 1920,
) -> str:
    """
    Convert word-level timestamps to ASS subtitle format with karaoke highlighting.
    """
    sub_cfg = config.subtitles
    font = sub_cfg.font
    font_size = sub_cfg.font_size
    highlight_color = _hex_to_ass_color(sub_cfg.highlight_color)
    base_color = _hex_to_ass_color(sub_cfg.base_color)
    max_words = sub_cfg.max_words_per_line

    # Calculate vertical position
    if sub_cfg.position == "center":
        margin_v = video_height // 2
    elif sub_cfg.position == "bottom":
        margin_v = int(video_height * 0.85)
    else:
        margin_v = int(video_height * 0.75)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{font_size},{base_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,5,10,10,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []

    # Group words into lines of max_words
    chunks = [words[i:i+max_words] for i in range(0, len(words), max_words)]

    for chunk in chunks:
        if not chunk:
            continue

        start_time = chunk[0].get("start", 0)
        end_time = chunk[-1].get("end", start_time + 1)

        # Build karaoke tagged line
        # \k<duration_cs> tags each word with its duration in centiseconds
        # \kf creates a fill effect (word highlighted as it's spoken)
        line_parts = []
        for word in chunk:
            w_start = word.get("start", start_time)
            w_end = word.get("end", w_start + 0.2)
            duration_cs = max(1, int((w_end - w_start) * 100))
            text = word.get("word", "").strip()
            # \kf fills from left as word is spoken, \1c changes highlight color
            line_parts.append(f"{{\\kf{duration_cs}\\1c{highlight_color}}}{text}{{\\1c{base_color}}}")

        line_text = " ".join(line_parts)

        events.append(
            f"Dialogue: 0,{_seconds_to_ass(start_time)},{_seconds_to_ass(end_time)},"
            f"Default,,0,0,0,,{line_text}"
        )

    return header + "\n".join(events) + "\n"


def _hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR format."""
    hex_color = hex_color.lstrip("#")
    r = hex_color[0:2]
    g = hex_color[2:4]
    b = hex_color[4:6]
    return f"&H00{b}{g}{r}"


def _seconds_to_ass(seconds: float) -> str:
    """Convert seconds to ASS timestamp format H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    cs = int((s % 1) * 100)
    s = int(s)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


async def run_stage4(
    project_name: str,
    short: Short,
    config: ProjectConfig,
) -> AsyncGenerator[dict, None]:
    """
    Transcribe stitched audio and generate ASS subtitle file.
    """
    dirs = get_project_subdirs(project_name)

    if not short.audio_file:
        yield {"event": "error", "message": "No audio file found for subtitles"}
        return

    audio_path = Path(__file__).parent.parent.parent / short.audio_file

    if not audio_path.exists():
        yield {"event": "error", "message": f"Audio file not found: {audio_path}"}
        return

    short.status = "transcribing"
    save_short(project_name, short)

    yield {"event": "progress", "message": "Transcribing audio with WhisperX..."}

    try:
        lang_code = config.language[:2].lower()
        result = transcribe_with_whisperx(audio_path, language=lang_code)

        # Extract all words from all segments
        all_words = []
        for segment in result.get("segments", []):
            all_words.extend(segment.get("words", []))

        if not all_words:
            yield {"event": "warning", "message": "No words found in transcription"}
            return

        # Save raw word-level JSON
        transcript_path = dirs["audio"] / f"{short.short_id}_transcript.json"
        transcript_path.write_text(json.dumps(result, indent=2))
        yield {"event": "progress", "message": f"Transcript saved: {len(all_words)} words"}

        # Generate ASS karaoke subtitle file
        ass_content = words_to_ass_karaoke(all_words, config)
        ass_path = dirs["audio"] / f"{short.short_id}.ass"
        ass_path.write_text(ass_content, encoding="utf-8")

        short.subtitle_file = str(ass_path.relative_to(Path(__file__).parent.parent.parent))
        save_short(project_name, short)

        yield {"event": "progress", "message": "ASS subtitle file generated"}

    except Exception as e:
        yield {"event": "error", "message": f"Transcription failed: {e}"}
        return

    yield {"event": "stage_complete", "stage": 4, "message": f"Stage 4 complete for {short.short_id}"}
