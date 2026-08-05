"""
Stage 2: Generate scene images via Wan2GP (Krea 2 Raw)
Each scene gets one image. Character reference sheets are fed in for consistency.
"""
from pathlib import Path
from typing import AsyncGenerator

from models import Short, ProjectConfig
from project_manager import save_short, get_project_subdirs, load_characters
from wan2gp_client import generate_image


async def run_stage2(
    project_name: str,
    short: Short,
    config: ProjectConfig,
) -> AsyncGenerator[dict, None]:

    dirs = get_project_subdirs(project_name)
    images_dir = dirs["images"] / short.short_id
    images_dir.mkdir(parents=True, exist_ok=True)

    characters = load_characters(project_name)

    short.status = "generating_images"
    save_short(project_name, short)

    total = len(short.scenes)

    for i, scene in enumerate(short.scenes):
        output_path = images_dir / f"scene_{scene.scene_id:03d}.png"

        if output_path.exists():
            scene.image_file = str(output_path)
            yield {"event": "progress", "message": f"Scene {scene.scene_id} image already exists, skipping"}
            continue

        # Collect reference sheets for characters in this scene
        reference_images = []
        char_desc_parts = []
        for char_name in scene.characters_in_scene:
            char = characters.get(char_name)
            if not char:
                continue
            char_desc_parts.append(f"{char_name}: {char.description}")
            if char.reference_sheet and Path(char.reference_sheet).exists():
                reference_images.append(Path(char.reference_sheet))

        # Enrich prompt with character descriptions
        prompt = scene.image_prompt
        if char_desc_parts:
            prompt += f". Characters: {'; '.join(char_desc_parts)}"

        yield {
            "event": "progress",
            "message": f"Generating image {i+1}/{total} for scene {scene.scene_id}..."
        }

        success = generate_image(
            prompt=prompt,
            output_path=output_path,
            model_type="krea2_raw",
            width=1080,
            height=1920,
            reference_images=reference_images or None,
        )

        if success:
            scene.image_file = str(output_path.relative_to(Path(__file__).parent.parent.parent))
            yield {"event": "image_done", "scene_id": scene.scene_id}
        else:
            yield {"event": "warning", "message": f"Image generation failed for scene {scene.scene_id}"}

    save_short(project_name, short)
    yield {"event": "stage_complete", "stage": 2, "message": f"Stage 2 complete for {short.short_id}"}
