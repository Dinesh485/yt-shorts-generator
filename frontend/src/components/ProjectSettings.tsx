import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, Upload } from 'lucide-react'
import { projectsApi, uploadApi, type ProjectConfig } from '../lib/api'

export default function ProjectSettings({
  projectName, config
}: { projectName: string; config: ProjectConfig }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<ProjectConfig>({ ...config })

  const mutation = useMutation({
    mutationFn: (c: ProjectConfig) => projectsApi.update(projectName, c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectName] }),
  })

  const handleMusicUpload = async (mood: string, file: File) => {
    await uploadApi.musicFile(projectName, file)
    setForm(f => ({
      ...f,
      music: {
        ...f.music,
        library: { ...f.music.library, [mood]: `music/${file.name}` }
      }
    }))
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Project Settings</h2>
        <p className="text-[#8888a8] text-sm">These settings apply to all Shorts in this project</p>
      </div>

      {/* General */}
      <Section title="General">
        <Field label="Art Style">
          <textarea
            value={form.style}
            onChange={e => setForm(f => ({ ...f, style: e.target.value }))}
            rows={2}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Language">
            <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className={inputCls}>
              {['English', 'Hindi', 'Spanish', 'French', 'German'].map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label={`Target Duration: ${form.target_duration}s`}>
            <input
              type="range" min={30} max={180} step={15}
              value={form.target_duration}
              onChange={e => setForm(f => ({ ...f, target_duration: Number(e.target.value) }))}
              className="w-full accent-[#7c6fcd] mt-3"
            />
          </Field>
        </div>
      </Section>

      {/* Image */}
      <Section title="Image Generation">
        <Field label="Engine">
          <div className="flex gap-2">
            {(['flux-local', 'gemini-imagen'] as const).map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setForm(f => ({ ...f, image_engine: e }))}
                className={`px-4 py-2 rounded-xl border text-sm transition-all ${form.image_engine === e ? 'border-[#7c6fcd] bg-[#7c6fcd]/10 text-white' : 'border-[#2a2a3d] text-[#8888a8] hover:border-[#7c6fcd]/50'}`}
              >
                {e === 'flux-local' ? '⚡ FLUX Local' : '🌐 Gemini Imagen'}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Video */}
      <Section title="Video">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ken Burns Effect">
            <label className="flex items-center gap-3 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={form.video.ken_burns}
                onChange={e => setForm(f => ({ ...f, video: { ...f.video, ken_burns: e.target.checked } }))}
                className="w-4 h-4 accent-[#7c6fcd]"
              />
              <span className="text-sm text-white">{form.video.ken_burns ? 'Enabled' : 'Disabled'}</span>
            </label>
          </Field>
          <Field label="Transition">
            <select
              value={form.video.transition}
              onChange={e => setForm(f => ({ ...f, video: { ...f.video, transition: e.target.value } }))}
              className={inputCls}
            >
              <option value="crossfade">Cross Fade</option>
              <option value="fade-black">Fade to Black</option>
              <option value="hard-cut">Hard Cut</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Subtitles */}
      <Section title="Subtitles">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Highlight Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.subtitles.highlight_color}
                onChange={e => setForm(f => ({ ...f, subtitles: { ...f.subtitles, highlight_color: e.target.value } }))}
                className="w-10 h-10 rounded-lg cursor-pointer border border-[#2a2a3d] bg-transparent"
              />
              <span className="text-sm text-white font-mono">{form.subtitles.highlight_color}</span>
            </div>
          </Field>
          <Field label="Font Size">
            <input
              type="number" min={12} max={32}
              value={form.subtitles.font_size}
              onChange={e => setForm(f => ({ ...f, subtitles: { ...f.subtitles, font_size: Number(e.target.value) } }))}
              className={inputCls}
            />
          </Field>
          <Field label="Max Words Per Line">
            <input
              type="number" min={1} max={8}
              value={form.subtitles.max_words_per_line}
              onChange={e => setForm(f => ({ ...f, subtitles: { ...f.subtitles, max_words_per_line: Number(e.target.value) } }))}
              className={inputCls}
            />
          </Field>
          <Field label="Position">
            <select
              value={form.subtitles.position}
              onChange={e => setForm(f => ({ ...f, subtitles: { ...f.subtitles, position: e.target.value } }))}
              className={inputCls}
            >
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Music */}
      <Section title="Background Music">
        <Field label={`Volume: ${Math.round(form.music.volume * 100)}%`}>
          <input
            type="range" min={0} max={0.5} step={0.01}
            value={form.music.volume}
            onChange={e => setForm(f => ({ ...f, music: { ...f.music, volume: Number(e.target.value) } }))}
            className="w-full accent-[#7c6fcd]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {(['battle', 'dialogue', 'tragedy', 'celebration', 'default'] as const).map(mood => (
            <div key={mood}>
              <label className="text-xs text-[#8888a8] capitalize mb-1 block">{mood}</label>
              <label className="flex items-center gap-2 px-3 py-2 bg-[#1a1a26] border border-[#2a2a3d] rounded-lg cursor-pointer hover:border-[#7c6fcd]/50 transition-colors">
                <Upload size={13} className="text-[#8888a8]" />
                <span className="text-xs text-[#8888a8] truncate">
                  {form.music.library[mood] || 'Upload track'}
                </span>
                <input
                  type="file" accept="audio/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleMusicUpload(mood, e.target.files[0])}
                />
              </label>
            </div>
          ))}
        </div>
      </Section>

      {/* Save */}
      <button
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-6 py-3 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors disabled:opacity-50"
      >
        {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Save Changes
      </button>

      {mutation.isSuccess && (
        <p className="text-green-400 text-sm">Settings saved successfully</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white border-b border-[#2a2a3d] pb-2">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#8888a8] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#7c6fcd] transition-colors"
