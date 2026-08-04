from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class ImageEngine(str, Enum):
    flux_local = "flux-local"
    gemini_imagen = "gemini-imagen"


class TTSEngine(str, Enum):
    qwen3_tts = "qwen3-tts"


class TransitionType(str, Enum):
    crossfade = "crossfade"
    fade_black = "fade-black"
    hard_cut = "hard-cut"


class SubtitleStyle(str, Enum):
    karaoke = "karaoke"
    static = "static"


class MusicLibrary(BaseModel):
    battle: Optional[str] = None
    dialogue: Optional[str] = None
    tragedy: Optional[str] = None
    celebration: Optional[str] = None
    default: Optional[str] = None


class MusicConfig(BaseModel):
    volume: float = Field(default=0.15, ge=0.0, le=1.0)
    library: MusicLibrary = Field(default_factory=MusicLibrary)


class SubtitleConfig(BaseModel):
    style: SubtitleStyle = SubtitleStyle.karaoke
    font: str = "Arial-Bold"
    font_size: int = 18
    highlight_color: str = "#FFD700"
    base_color: str = "#FFFFFF"
    position: str = "center"
    max_words_per_line: int = 4


class VideoConfig(BaseModel):
    ken_burns: bool = True
    transition: TransitionType = TransitionType.crossfade
    transition_duration: float = 0.5


class VoiceConfig(BaseModel):
    narrator_personality: str = "deep, measured, epic storytelling tone"
    default_character_personality: str = "clear, expressive"
    tts_engine: TTSEngine = TTSEngine.qwen3_tts


class ProjectConfig(BaseModel):
    name: str
    style: str = "Epic cinematic oil painting, highly detailed, dramatic lighting"
    language: str = "English"
    target_duration: int = Field(default=75, ge=30, le=180)
    image_engine: ImageEngine = ImageEngine.flux_local
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    subtitles: SubtitleConfig = Field(default_factory=SubtitleConfig)
    video: VideoConfig = Field(default_factory=VideoConfig)
    music: MusicConfig = Field(default_factory=MusicConfig)


class CharacterVoiceProfile(BaseModel):
    personality: str
    sample_audio: Optional[str] = None
    sample_generated: bool = False


class Character(BaseModel):
    name: str
    description: str
    role: str = ""
    first_seen: str = ""
    voice_profile: CharacterVoiceProfile = Field(
        default_factory=lambda: CharacterVoiceProfile(personality="clear, expressive")
    )


class DialogueLine(BaseModel):
    character: str
    line: str
    voice_instruction: str = ""


class AudioSegment(BaseModel):
    type: Literal["narration", "dialogue"]
    text: str
    character: Optional[str] = None
    voice_instruction: str = ""
    audio_file: Optional[str] = None


class Scene(BaseModel):
    scene_id: int
    narration: str
    dialogue: list[DialogueLine] = []
    image_prompt: str
    characters_in_scene: list[str] = []
    mood: str = "default"
    duration_estimate: int = 20
    image_file: Optional[str] = None
    audio_sequence: list[AudioSegment] = []


class Short(BaseModel):
    short_id: str
    title: str = ""
    total_duration_estimate: int = 75
    style: str = ""
    scenes: list[Scene] = []
    audio_file: Optional[str] = None
    subtitle_file: Optional[str] = None
    video_file: Optional[str] = None
    status: Literal["pending", "scripting", "generating_images", "generating_audio",
                    "transcribing", "assembling", "done", "error"] = "pending"
    error: Optional[str] = None


class PipelineRunRequest(BaseModel):
    source_type: Literal["text", "url", "file"]
    source_content: str  # raw text, URL, or filename
    project_name: str


class ProjectSummary(BaseModel):
    name: str
    style: str
    short_count: int = 0
    done_count: int = 0
    image_engine: ImageEngine = ImageEngine.flux_local
