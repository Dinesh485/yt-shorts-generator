"""
Stage 2: Generate images for each scene
"""
from pathlib import Path
from typing import AsyncGenerator

from models import Short, Scene, ImageEngine, ProjectConfig
from project_manager import save_short, get_project_subdirs, load_characters


async def generate_image_flux_local(prompt: str, output_path: Path) -> bool:
    """
    Generate image using local FLUX.1-schnell via diffusers.
    Returns True on success.
    """
    try:
        import torch
        from diffusers import FluxPipeline

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16

        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=dtype,
        )
        pipe = pipe.to(device)
        pipe.enable_attention_slicing()

        image = pipe(
            prompt=prompt,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=1080,
            height=1920,
        ).images[0]

        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(str(output_path))
        return True
    except Exception as e:
        print(f"[FLUX] Error: {e}")
        return False


async def generate_image_gemini(prompt: str, output_path: Path, api_key: str) -> bool:
    """
    Generate image using Gemini Imagen API.
    Returns True on success.
    """
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)

        model = genai.ImageGenerationModel("imagen-3.0-generate-002")
        result = model.generate_images(
            prompt=prompt,
            number_of_images=1,
            aspect_ratio="9:16",
        )

        if result.images:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            result.images[0]._pil_image.save(str(output_path))
            return True
        return False
    except Exception as e:
        print(f"[Gemini Imagen] Error: {e}")
        return False


async def run_stage2(
    project_name: str,
    short: Short,
    config: ProjectConfig,
    api_key: str,
) -> AsyncGenerator[dict, None]:
    """
    Generate images for all scenes in a Short.
    """
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

        # Enrich prompt with character descriptions
        char_descs = []
        for char_name in scene.characters_in_scene:
            if char_name in characters:
                char_descs.append(f"{char_name}: {characters[char_name].description}")
        
        enriched_prompt = scene.image_prompt
        if char_descs:
            enriched_prompt += f". Characters: {'; '.join(char_descs)}"

        yield {
            "event": "progress",
            "message": f"Generating image {i+1}/{total} for scene {scene.scene_id}..."
        }

        success = False
        if config.image_engine == ImageEngine.flux_local:
            success = await generate_image_flux_local(enriched_prompt, output_path)
        elif config.image_engine == ImageEngine.gemini_imagen:
            success = await generate_image_gemini(enriched_prompt, output_path, api_key)

        if success:
            scene.image_file = str(output_path.relative_to(Path(__file__).parent.parent.parent))
            yield {"event": "image_done", "scene_id": scene.scene_id, "path": str(output_path)}
        else:
            yield {"event": "warning", "message": f"Image generation failed for scene {scene.scene_id}"}

    save_short(project_name, short)
    yield {"event": "stage_complete", "stage": 2, "message": f"Stage 2 complete for {short.short_id}"}
