import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { projectsApi, type ProjectConfig } from '../lib/api'

const ART_STYLES = [
  'Indian miniature painting, vibrant colors, intricate borders, traditional Mughal art style',
  'Epic cinematic oil painting, dramatic lighting, highly detailed, fantasy art',
  'Graphic novel style, high contrast, bold colors, comic book art',
  'Watercolor illustration, soft colors, ethereal, storybook style',
  'Dark fantasy digital art, moody atmosphere, hyperrealistic',
  'Ancient fresco style, earthy tones, classical mythology painting',
]

export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    style: ART_STYLES[0],
    customStyle: '',
    language: 'English',
    target_duration: 75,
    image_engine: 'flux-local' as 'flux-local' | 'gemini-imagen',
  })

  const mutation = useMutation({
    mutationFn: (config: ProjectConfig) => projectsApi.create(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const style = form.customStyle || form.style
    const config: ProjectConfig = {
      name: form.name.toLowerCase().replace(/\s+/g, '_'),
      style,
      language: form.language,
      target_duration: form.target_duration,
      image_engine: form.image_engine,
      voice: {
        narrator_personality: 'deep, measured, epic storytelling tone',
        default_character_personality: 'clear, expressive',
        tts_engine: 'qwen3-tts',
      },
      subtitles: {
        style: 'karaoke',
        font: 'Arial-Bold',
        font_size: 18,
        highlight_color: '#FFD700',
        base_color: '#FFFFFF',
        position: 'center',
        max_words_per_line: 4,
      },
      video: {
        ken_burns: true,
        transition: 'crossfade',
        transition_duration: 0.5,
      },
      music: {
        volume: 0.15,
        library: {},
      },
    }
    mutation.mutate(config)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2a2a3d]">
          <h2 className="text-lg font-semibold text-white">New Project</h2>
          <button onClick={onClose} className="text-[#8888a8] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#8888a8] mb-2">Project Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. mahabharata"
              className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white placeholder-[#555570] focus:outline-none focus:border-[#7c6fcd] transition-colors"
            />
          </div>

          {/* Art Style */}
          <div>
            <label className="block text-sm font-medium text-[#8888a8] mb-2">Art Style</label>
            <div className="grid grid-cols-1 gap-2 mb-2">
              {ART_STYLES.map(style => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, style, customStyle: '' }))}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                    form.style === style && !form.customStyle
                      ? 'border-[#7c6fcd] bg-[#7c6fcd]/10 text-white'
                      : 'border-[#2a2a3d] text-[#8888a8] hover:border-[#7c6fcd]/50'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.customStyle}
              onChange={e => setForm(f => ({ ...f, customStyle: e.target.value }))}
              placeholder="Or type a custom style..."
              className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white placeholder-[#555570] focus:outline-none focus:border-[#7c6fcd] transition-colors text-sm"
            />
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-[#8888a8] mb-2">Language</label>
              <select
                value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#7c6fcd] transition-colors"
              >
                <option>English</option>
                <option>Hindi</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-[#8888a8] mb-2">
                Target Duration <span className="text-[#7c6fcd]">{form.target_duration}s</span>
              </label>
              <input
                type="range"
                min={30}
                max={180}
                step={15}
                value={form.target_duration}
                onChange={e => setForm(f => ({ ...f, target_duration: Number(e.target.value) }))}
                className="w-full accent-[#7c6fcd] mt-2"
              />
              <div className="flex justify-between text-xs text-[#555570] mt-1">
                <span>30s</span><span>180s</span>
              </div>
            </div>
          </div>

          {/* Image Engine */}
          <div>
            <label className="block text-sm font-medium text-[#8888a8] mb-2">Image Engine</label>
            <div className="grid grid-cols-2 gap-2">
              {(['flux-local', 'gemini-imagen'] as const).map(engine => (
                <button
                  key={engine}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, image_engine: engine }))}
                  className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.image_engine === engine
                      ? 'border-[#7c6fcd] bg-[#7c6fcd]/10 text-white'
                      : 'border-[#2a2a3d] text-[#8888a8] hover:border-[#7c6fcd]/50'
                  }`}
                >
                  {engine === 'flux-local' ? '⚡ FLUX Local' : '🌐 Gemini Imagen'}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-[#2a2a3d] text-[#8888a8] rounded-xl hover:border-[#7c6fcd]/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Create Project
            </button>
          </div>

          {mutation.isError && (
            <p className="text-red-400 text-sm text-center">
              {(mutation.error as any)?.response?.data?.detail || 'Failed to create project'}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
