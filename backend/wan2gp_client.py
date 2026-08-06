"""
Wan2GP client using the official Python API (shared/api.py).

Set WAN2GP_PATH in backend/.env to point to your Wan2GP installation folder.
The session is initialized once and reused across all calls (model stays warm).

Usage:
    from wan2gp_client import get_session, generate_image, generate_tts, generate_character_sheet
"""
import os
import sys
import shutil
from pathlib import Path
from functools import lru_cache

# ─── Session ─────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_session():
    """
    Initialize and cache a single Wan2GP session.
    Called once — model stays warm for all subsequent requests.
    """
    wan2gp_path = os.getenv("WAN2GP_PATH", "")
    if not wan2gp_path:
        raise RuntimeError(
            "WAN2GP_PATH is not set in .env. "
            "Set it to the Wan2GP installation folder, e.g. C:\\WanGP"
        )

    wan2gp_root = Path(wan2gp_path)
    if not wan2gp_root.exists():
        raise RuntimeError(f"WAN2GP_PATH does not exist: {wan2gp_root}")

    # Add Wan2GP to sys.path so we can import shared/api.py
    # Append (not insert at 0) to avoid shadowing our own modules
    wan2gp_str = str(wan2gp_root)
    if wan2gp_str not in sys.path:
        sys.path.append(wan2gp_str)

    from shared.api import init
    session = init(
        root=wan2gp_root,
        console_output=False,   # suppress Wan2GP console noise in our logs
    )
    return session


def check_connection() -> bool:
    """Check if Wan2GP is available and importable."""
    try:
        get_session()
        return True
    except Exception:
        return False


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _run_job(settings: dict) -> list[str]:
    """
    Submit a task to Wan2GP and wait for result.
    Returns list of generated file paths, or empty list on failure.
    """
    session = get_session()
    job = session.submit_task(settings)
    result = job.result()

    if result.success:
        return result.generated_files
    else:
        for error in result.errors:
            print(f"[Wan2GP] Error stage={error.stage}: {error.message}")
        return []


def _copy_first_output(generated_files: list[str], output_path: Path) -> bool:
    """Copy the first generated file to output_path."""
    if not generated_files:
        return False
    src = Path(generated_files[0])
    if not src.exists():
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, output_path)
    return True


# ─── Image Generation ────────────────────────────────────────────────────────

def generate_image(
    prompt: str,
    output_path: Path,
    width: int = 1080,
    height: int = 1920,
    reference_images: list[Path] | None = None,
    num_steps: int = 28,
    seed: int = -1,
) -> bool:
    """
    Generate a scene image using Krea 2 Raw.
    Optionally accepts character reference images for consistency.
    Returns True on success.
    """
    try:
        settings = {
            "model_type": "krea2_turbo",
            "prompt": prompt,
            "resolution": f"{width}x{height}",
            "num_inference_steps": num_steps,
            "seed": seed,
            "image_mode": 1,
        }

        # Feed reference images if available
        if reference_images:
            existing = [str(p) for p in reference_images if p.exists()]
            if existing:
                # Wan2GP accepts image references via image_ref field
                settings["image_ref"] = existing[0] if len(existing) == 1 else existing
                settings["image_prompt_type"] = "SR"  # Style + Reference

        files = _run_job(settings)
        return _copy_first_output(files, output_path)

    except Exception as e:
        print(f"[Wan2GP Image] Error: {e}")
        return False


def generate_character_sheet(
    character_name: str,
    character_description: str,
    output_path: Path,
    art_style: str = "",
) -> bool:
    """
    Generate a 4-direction character reference sheet using Ideogram 4.
    Returns True on success.
    """
    try:
        style_suffix = f", {art_style}" if art_style else ""
        prompt = (
            f"Character reference sheet of {character_name}. "
            f"{character_description}. "
            f"Four views in one image: front view, left side profile, "
            f"right side profile, back view. "
            f"Plain neutral background, full body, consistent character design"
            f"{style_suffix}, concept art turnaround sheet, labeled views."
        )

        settings = {
            "model_type": "krea2_turbo",
            "prompt": prompt,
            "resolution": "1024x1024",
            "num_inference_steps": 8,
            "seed": -1,
            "image_mode": 1,
        }

        files = _run_job(settings)
        return _copy_first_output(files, output_path)

    except Exception as e:
        print(f"[Wan2GP Character Sheet] Error: {e}")
        return False


# ─── TTS ─────────────────────────────────────────────────────────────────────

def generate_tts(
    text: str,
    output_path: Path,
    voice_description: str = "clear, expressive narrator",
    reference_audio: Path | None = None,
) -> bool:
    """
    Generate speech using Qwen3-TTS.
    If reference_audio is provided, clones that voice.
    Otherwise uses voice_description for voice design.
    Returns True on success.
    """
    try:
        settings = {
            "model_type": "qwen3_tts_base",
            "prompt": text,
            "voice_description": voice_description,
        }

        if reference_audio and reference_audio.exists():
            settings["audio_ref"] = str(reference_audio)

        files = _run_job(settings)
        return _copy_first_output(files, output_path)

    except Exception as e:
        print(f"[Wan2GP TTS] Error: {e}")
        return False
