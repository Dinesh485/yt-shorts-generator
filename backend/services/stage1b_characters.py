"""
Stage 1.5: Generate reference sheets for new characters via Wan2GP (Ideogram 4)
Runs after script generation, before image generation.
Only generates for characters that don't already have a reference sheet.
"""
from pathlib import Path
from typing import AsyncGenerator

from models import ProjectConfig
from project_manager import (
    load_characters, save_characters, get_project_subdirs
)
from wan2gp_client import generate_character_sheet


async def run_stage1b(
    project_name: str,
    config: ProjectConfig,
) -> AsyncGenerator[dict, None]:

    dirs = get_project_subdirs(project_name)
    chars_dir = dirs["root"] / "characters"
    chars_dir.mkdir(parents=True, exist_ok=True)

    characters = load_characters(project_name)

    # Only process characters without a reference sheet
    pending = [
        (name, char) for name, char in characters.items()
        if not char.reference_sheet or not Path(char.reference_sheet).exists()
    ]

    if not pending:
        yield {"event": "progress", "message": "All characters already have reference sheets"}
        return

    yield {
        "event": "progress",
        "message": f"Generating reference sheets for {len(pending)} new character(s)..."
    }

    updated = False
    for name, char in pending:
        output_path = chars_dir / f"{name.lower().replace(' ', '_')}_reference.png"

        yield {"event": "progress", "message": f"Reference sheet: {name}"}

        success = generate_character_sheet(
            character_name=name,
            character_description=char.description,
            output_path=output_path,
            art_style=config.style,
        )

        if success:
            char.reference_sheet = str(
                output_path.relative_to(Path(__file__).parent.parent.parent)
            )
            characters[name] = char
            updated = True
            yield {"event": "character_sheet_done", "character": name}
        else:
            yield {"event": "warning", "message": f"Reference sheet failed for {name}"}

    if updated:
        save_characters(project_name, characters)

    yield {"event": "stage_complete", "stage": "1b", "message": "Character reference sheets done"}
