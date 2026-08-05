import json
import os
from pathlib import Path
from typing import Optional
from models import ProjectConfig, Character, Short, ProjectSummary

PROJECTS_DIR = Path(__file__).parent.parent / "projects"


def get_project_dir(project_name: str) -> Path:
    return PROJECTS_DIR / project_name


def get_project_subdirs(project_name: str) -> dict[str, Path]:
    base = get_project_dir(project_name)
    return {
        "root": base,
        "source": base / "source",
        "shorts": base / "shorts",
        "images": base / "images",
        "audio": base / "audio",
        "voices": base / "voices",
        "characters": base / "characters",
        "music": base / "music",
        "output": base / "output",
    }


def create_project(config: ProjectConfig) -> ProjectConfig:
    dirs = get_project_subdirs(config.name)
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    config_path = dirs["root"] / "project.json"
    config_path.write_text(config.model_dump_json(indent=2))

    chars_path = dirs["root"] / "characters.json"
    if not chars_path.exists():
        chars_path.write_text(json.dumps({}, indent=2))

    return config


def load_project(project_name: str) -> Optional[ProjectConfig]:
    config_path = get_project_dir(project_name) / "project.json"
    if not config_path.exists():
        return None
    return ProjectConfig.model_validate_json(config_path.read_text())


def save_project(config: ProjectConfig):
    config_path = get_project_dir(config.name) / "project.json"
    config_path.write_text(config.model_dump_json(indent=2))


def list_projects() -> list[ProjectSummary]:
    if not PROJECTS_DIR.exists():
        return []
    summaries = []
    for d in PROJECTS_DIR.iterdir():
        if not d.is_dir():
            continue
        config_path = d / "project.json"
        if not config_path.exists():
            continue
        config = ProjectConfig.model_validate_json(config_path.read_text())
        shorts_dir = d / "shorts"
        short_count = 0
        done_count = 0
        if shorts_dir.exists():
            for sf in shorts_dir.glob("*.json"):
                short_count += 1
                s = Short.model_validate_json(sf.read_text())
                if s.status == "done":
                    done_count += 1
        summaries.append(ProjectSummary(
            name=config.name,
            style=config.style,
            short_count=short_count,
            done_count=done_count,
        ))
    return summaries


def load_characters(project_name: str) -> dict[str, Character]:
    path = get_project_dir(project_name) / "characters.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    return {k: Character.model_validate(v) for k, v in raw.items()}


def save_characters(project_name: str, characters: dict[str, Character]):
    path = get_project_dir(project_name) / "characters.json"
    data = {k: v.model_dump() for k, v in characters.items()}
    path.write_text(json.dumps(data, indent=2))


def load_short(project_name: str, short_id: str) -> Optional[Short]:
    path = get_project_dir(project_name) / "shorts" / f"{short_id}.json"
    if not path.exists():
        return None
    return Short.model_validate_json(path.read_text())


def save_short(project_name: str, short: Short):
    path = get_project_dir(project_name) / "shorts" / f"{short.short_id}.json"
    path.write_text(short.model_dump_json(indent=2))


def list_shorts(project_name: str) -> list[Short]:
    shorts_dir = get_project_dir(project_name) / "shorts"
    if not shorts_dir.exists():
        return []
    shorts = []
    for f in sorted(shorts_dir.glob("*.json")):
        shorts.append(Short.model_validate_json(f.read_text()))
    return shorts


def delete_project(project_name: str):
    import shutil
    project_dir = get_project_dir(project_name)
    if project_dir.exists():
        shutil.rmtree(project_dir)
