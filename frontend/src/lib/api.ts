import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export default api

export interface ProjectConfig {
  name: string
  style: string
  language: string
  target_duration: number
  voice: {
    narrator_personality: string
    default_character_personality: string
  }
  subtitles: {
    style: string
    font: string
    font_size: number
    highlight_color: string
    base_color: string
    position: string
    max_words_per_line: number
  }
  video: {
    ken_burns: boolean
    transition: string
    transition_duration: number
  }
  music: {
    volume: number
    library: {
      battle?: string
      dialogue?: string
      tragedy?: string
      celebration?: string
      default?: string
    }
  }
}

export interface ProjectSummary {
  name: string
  style: string
  short_count: number
  done_count: number
}

export interface Character {
  name: string
  description: string
  role: string
  first_seen: string
  voice_profile: {
    personality: string
    sample_audio?: string
    sample_generated: boolean
  }
}

export interface AudioSegment {
  type: 'narration' | 'dialogue'
  text: string
  character?: string
  voice_instruction: string
  audio_file?: string
}

export interface Scene {
  scene_id: number
  narration: string
  dialogue: Array<{ character: string; line: string; voice_instruction: string }>
  image_prompt: string
  characters_in_scene: string[]
  mood: string
  duration_estimate: number
  image_file?: string
  audio_sequence: AudioSegment[]
}

export interface Short {
  short_id: string
  title: string
  total_duration_estimate: number
  style: string
  scenes: Scene[]
  audio_file?: string
  subtitle_file?: string
  video_file?: string
  status: 'pending' | 'scripting' | 'generating_images' | 'generating_audio' | 'transcribing' | 'assembling' | 'done' | 'error'
  error?: string
}

// API calls
export const projectsApi = {
  list: () => api.get<ProjectSummary[]>('/projects'),
  get: (name: string) => api.get<ProjectConfig>(`/projects/${name}`),
  create: (config: ProjectConfig) => api.post<ProjectConfig>('/projects', config),
  update: (name: string, config: ProjectConfig) => api.put<ProjectConfig>(`/projects/${name}`, config),
  delete: (name: string) => api.delete(`/projects/${name}`),
}

export const shortsApi = {
  list: (project: string) => api.get<Short[]>(`/projects/${project}/shorts`),
  get: (project: string, id: string) => api.get<Short>(`/projects/${project}/shorts/${id}`),
}

export const charactersApi = {
  list: (project: string) => api.get<Record<string, Character>>(`/projects/${project}/characters`),
  update: (project: string, name: string, char: Character) =>
    api.put<Character>(`/projects/${project}/characters/${name}`, char),
  delete: (project: string, name: string) =>
    api.delete(`/projects/${project}/characters/${name}`),
}

export const uploadApi = {
  sourceFile: (project: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/projects/${project}/upload`, fd)
  },
  musicFile: (project: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/projects/${project}/music`, fd)
  },
}
