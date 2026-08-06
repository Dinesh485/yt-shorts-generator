"""
Stage 1: Source Text → Structured Short JSONs via Gemini
"""
import json
import re
import traceback
import httpx
from pathlib import Path
from typing import AsyncGenerator

import google.generativeai as genai

from app_models import (
    ProjectConfig, Character, Short,
    AudioSegment, CharacterVoiceProfile
)
from project_manager import (
    load_characters, save_characters,
    save_short, get_project_subdirs
)


def get_client(api_key: str):
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-3.6-flash")


async def fetch_url_text(url: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        text = re.sub(r'<[^>]+>', ' ', resp.text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text


async def get_source_text(source_type: str, source_content: str, project_name: str) -> str:
    if source_type == "text":
        return source_content
    elif source_type == "url":
        return await fetch_url_text(source_content)
    elif source_type == "file":
        dirs = get_project_subdirs(project_name)
        file_path = dirs["source"] / source_content
        return file_path.read_text(encoding="utf-8")
    else:
        raise ValueError(f"Unknown source type: {source_type}")


SCRIPT_PROMPT = """You are a creative director producing a YouTube Short from classic literature and mythology.

Given the following source text, produce exactly ONE YouTube Short of approximately {target_duration} seconds when narrated aloud (roughly {word_count} words of spoken content).
Be accurate to the source. Rewrite it in modern, engaging language suitable for a general audience.

Art style for images: {style}
Language: {language}

EXISTING CHARACTERS (maintain consistency):
{characters_json}

Produce a single JSON object with this exact structure:
{{
  "short_id": "short_001",
  "title": "Short descriptive title",
  "total_duration_estimate": {target_duration},
  "scenes": [
    {{
      "scene_id": 1,
      "narration": "Narrator text for this scene",
      "dialogue": [
        {{"character": "Name", "line": "What they say", "voice_instruction": "emotional tone e.g. anguished, quiet"}}
      ],
      "image_prompt": "Detailed image generation prompt including art style",
      "characters_in_scene": ["Name1", "Name2"],
      "mood": "battle|dialogue|tragedy|celebration|default",
      "duration_estimate": <seconds for this scene>,
      "audio_sequence": [
        {{"type": "narration", "text": "...", "voice_instruction": "solemn, slow"}},
        {{"type": "dialogue", "character": "Name", "text": "...", "voice_instruction": "anguished"}}
      ]
    }}
  ],
  "new_characters": [
    {{
      "name": "Character Name",
      "description": "Physical appearance for image generation",
      "role": "their role in the story",
      "voice_profile": {{
        "personality": "voice description e.g. deep, authoritative, warm"
      }}
    }}
  ]
}}

IMPORTANT RULES:
- audio_sequence is the ordered list of ALL spoken content (narration and dialogue interleaved naturally)
- image_prompt must include the art style: "{style}"
- image_prompt must describe the scene visually with character descriptions from the archive
- mood must be one of: battle, dialogue, tragedy, celebration, default
- Return ONLY the JSON object. No markdown, no explanation, no array wrapper.

SOURCE TEXT:
{source_text}"""


async def run_stage1(
    project_name: str,
    source_type: str,
    source_content: str,
    config: ProjectConfig,
    api_key: str,
) -> AsyncGenerator[dict, None]:

    yield {"event": "progress", "message": "Stage 1 starting..."}

    # ── API key check ──────────────────────────────────────────────────────
    if not api_key:
        yield {"event": "error", "message": "GEMINI_API_KEY is empty — check backend/.env"}
        return
    yield {"event": "progress", "message": f"API key loaded (starts with: {api_key[:8]}...)"}

    # ── Gemini client ──────────────────────────────────────────────────────
    try:
        client = get_client(api_key)
        yield {"event": "progress", "message": "Gemini client initialized (gemini-2.5-flash)"}
    except Exception as e:
        yield {"event": "error", "message": f"Failed to init Gemini client: {e}\n{traceback.format_exc()}"}
        return

    # ── Source text ────────────────────────────────────────────────────────
    yield {"event": "progress", "message": f"Loading source text (type={source_type})..."}
    try:
        source_text = await get_source_text(source_type, source_content, project_name)
        yield {"event": "progress", "message": f"Source text loaded: {len(source_text)} chars, first 100: {source_text[:100]!r}"}
    except Exception as e:
        yield {"event": "error", "message": f"Failed to load source text: {e}\n{traceback.format_exc()}"}
        return

    # ── Build prompt ───────────────────────────────────────────────────────
    try:
        characters = load_characters(project_name)
        chars_json = json.dumps(
            {k: {"description": v.description, "role": v.role} for k, v in characters.items()},
            indent=2
        ) if characters else "{}"
        yield {"event": "progress", "message": f"Character archive: {len(characters)} characters"}

        word_count = int(config.target_duration * 2.5)
        prompt = SCRIPT_PROMPT.format(
            target_duration=config.target_duration,
            word_count=word_count,
            style=config.style,
            language=config.language,
            characters_json=chars_json,
            source_text=source_text[:10000],
        )
        yield {"event": "progress", "message": f"Prompt built: {len(prompt)} chars"}
    except Exception as e:
        yield {"event": "error", "message": f"Failed to build prompt: {e}\n{traceback.format_exc()}"}
        return

    # ── Gemini API call ────────────────────────────────────────────────────
    yield {"event": "progress", "message": "Calling Gemini API... (this may take 10-30s)"}
    try:
        response = client.generate_content(prompt)
        yield {"event": "progress", "message": f"Gemini responded. Response type: {type(response).__name__}"}

        raw = response.text
        yield {"event": "progress", "message": f"Raw response length: {len(raw)} chars, first 200: {raw[:200]!r}"}
    except Exception as e:
        yield {"event": "error", "message": f"Gemini API call failed: {e}\n{traceback.format_exc()}"}
        return

    # ── Parse JSON ────────────────────────────────────────────────────────
    yield {"event": "progress", "message": "Parsing Gemini response..."}
    try:
        raw = raw.strip()
        raw = re.sub(r'^```json\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'^```\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
        raw = raw.strip()
        yield {"event": "progress", "message": f"Cleaned response first 200: {raw[:200]!r}"}

        short_data = json.loads(raw)

        # Gemini sometimes wraps in an array anyway — unwrap if so
        if isinstance(short_data, list):
            if len(short_data) == 0:
                yield {"event": "error", "message": "Gemini returned an empty array"}
                return
            short_data = short_data[0]
            yield {"event": "progress", "message": "Unwrapped single Short from array"}

        yield {"event": "progress", "message": f"Parsed Short: {short_data.get('title', '?')}"}
    except json.JSONDecodeError as e:
        yield {"event": "error", "message": f"JSON parse failed: {e} — raw starts with: {raw[:300]!r}"}
        return
    except Exception as e:
        yield {"event": "error", "message": f"Unexpected parse error: {e}\n{traceback.format_exc()}"}
        return

    # ── Character archive update ───────────────────────────────────────────
    try:
        new_char_count = 0
        for nc in short_data.get("new_characters", []):
            name = nc.get("name", "")
            if name and name not in characters:
                characters[name] = Character(
                    name=name,
                    description=nc.get("description", ""),
                    role=nc.get("role", ""),
                    first_seen=project_name,
                    voice_profile=CharacterVoiceProfile(
                        personality=nc.get("voice_profile", {}).get("personality", "clear, expressive")
                    )
                )
                new_char_count += 1

        if new_char_count > 0:
            save_characters(project_name, characters)
            yield {"event": "progress", "message": f"Added {new_char_count} new characters to archive"}
    except Exception as e:
        yield {"event": "error", "message": f"Character archive update failed: {e}\n{traceback.format_exc()}"}
        return

    # ── Save Short ────────────────────────────────────────────────────────
    yield {"event": "progress", "message": "Saving Short JSON..."}
    try:
        short_data.pop("new_characters", None)
        short_data["style"] = config.style
        short_data["status"] = "pending"

        if "short_id" not in short_data:
            short_data["short_id"] = "short_001"

        yield {"event": "progress", "message": f"Validating Short: {short_data.get('short_id')} — {short_data.get('title', '?')}"}
        short = Short.model_validate(short_data)
        save_short(project_name, short)
        yield {
            "event": "short_created",
            "short_id": short.short_id,
            "title": short.title,
            "message": f"Short created: {short.title}"
        }
    except Exception as e:
        yield {"event": "error", "message": f"Failed to save Short: {e}\n{traceback.format_exc()}"}
        return

    yield {"event": "stage_complete", "stage": 1, "message": "Stage 1 complete. 1 Short queued."}
