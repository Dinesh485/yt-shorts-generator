import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Download, Film, Image as ImageIcon, Clock,
  Loader2, Play, RotateCcw, CheckCircle2, AlertCircle,
  XCircle, Mic, FileText, Video, Volume2, ZoomIn,
  ChevronDown, ChevronUp, Terminal
} from 'lucide-react'
import { shortsApi, jobsApi, type Short, type Scene, type AudioSegment } from '../lib/api'
import { statusColor, statusLabel, cn } from '../lib/utils'

type StageName = 'images' | 'audio' | 'subtitles' | 'video'
const BASE = 'http://localhost:8000'

// Map short.status values that indicate a stage is actively running on the backend
const STATUS_TO_STAGE: Record<string, StageName> = {
  generating_images: 'images',
  generating_audio:  'audio',
  transcribing:      'subtitles',
  assembling:        'video',
}

function stageStatus(short: Short, stage: StageName): 'done' | 'partial' | 'none' {
  if (stage === 'images') {
    const total = short.scenes.length
    const done  = short.scenes.filter(s => s.image_file).length
    if (done === 0) return 'none'
    if (done < total) return 'partial'
    return 'done'
  }
  if (stage === 'audio')     return short.audio_file    ? 'done' : 'none'
  if (stage === 'subtitles') return short.subtitle_file ? 'done' : 'none'
  if (stage === 'video')     return short.video_file    ? 'done' : 'none'
  return 'none'
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="Scene preview"
        className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-bold leading-none">✕</button>
    </div>
  )
}

// ─── Log Panel ────────────────────────────────────────────────────────────────
function LogPanel({ logs, isRunning }: { logs: string[]; isRunning: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  // Auto-open when a run starts
  useEffect(() => { if (isRunning) setOpen(true) }, [isRunning])

  if (!isRunning && logs.length === 0) return null

  return (
    <div className="mt-4 border border-[#2a2a3d] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#0d0d14] hover:bg-[#12121a] transition-colors text-xs text-[#555570]"
      >
        <Terminal size={11} />
        <span className="font-mono">logs</span>
        {isRunning && <Loader2 size={10} className="animate-spin text-[#7c6fcd] ml-1" />}
        <span className="ml-auto">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
      </button>
      {open && (
        <div ref={ref}
          className="bg-[#0a0a0f] p-3 h-36 overflow-y-auto font-mono text-xs space-y-0.5">
          {logs.length === 0
            ? <span className="text-[#555570]">Starting...</span>
            : logs.map((l, i) => (
                <div key={i} className="text-[#8888a8]">
                  <span className="text-[#555570]">&gt; </span>{l}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Stage Card Shell ─────────────────────────────────────────────────────────
function StageCard({
  icon, title, status, isRunning, isDisabled, logs,
  onRun, onStop, children,
}: {
  icon: React.ReactNode
  title: string
  status: 'done' | 'partial' | 'none'
  isRunning: boolean
  isDisabled: boolean
  logs: string[]
  onRun: () => void
  onStop: () => void
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      'rounded-2xl border transition-colors',
      isRunning
        ? 'border-[#7c6fcd]/60 shadow-lg shadow-[#7c6fcd]/10'
        : status === 'done'
          ? 'border-[#2a2a3d]'
          : 'border-[#2a2a3d]'
    )}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2a3d]">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          isRunning ? 'bg-[#7c6fcd]/20 text-[#7c6fcd]'
            : status === 'done' ? 'bg-green-500/10 text-green-400'
            : status === 'partial' ? 'bg-yellow-500/10 text-yellow-400'
            : 'bg-[#1a1a26] text-[#555570]'
        )}>
          {isRunning ? <Loader2 size={15} className="animate-spin" /> : icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{title}</span>
            {status === 'done'    && !isRunning && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">done</span>}
            {status === 'partial' && !isRunning && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-medium">partial</span>}
            {status === 'none'    && !isRunning && <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a26] text-[#555570]">not run</span>}
            {isRunning && <span className="text-xs px-2 py-0.5 rounded-full bg-[#7c6fcd]/15 text-[#7c6fcd] font-medium">running...</span>}
          </div>
        </div>

        <button
          onClick={isRunning ? onStop : onRun}
          disabled={isDisabled && !isRunning}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
            isRunning
              ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25'
              : status === 'done'
                ? 'bg-[#1a1a26] border border-[#2a2a3d] text-[#8888a8] hover:text-white hover:border-[#3a3a4d]'
                : 'bg-[#7c6fcd] text-white hover:bg-[#9585e0]',
            isDisabled && !isRunning && 'opacity-30 cursor-not-allowed'
          )}
        >
          {isRunning
            ? <><XCircle size={12} />Stop</>
            : status === 'done'
              ? <><RotateCcw size={12} />Retry</>
              : <><Play size={12} />Run</>
          }
        </button>
      </div>

      {/* Card body */}
      <div className="p-5">
        {children}
        <LogPanel logs={logs} isRunning={isRunning} />
      </div>
    </div>
  )
}

// ─── Stage: Images ────────────────────────────────────────────────────────────
function ImagesContent({ scenes, isRunning }: { scenes: Scene[]; isRunning: boolean }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const doneCount = scenes.filter(s => s.image_file).length

  if (!isRunning && doneCount === 0) {
    return (
      <div className="flex items-center gap-2 text-[#555570] text-sm py-2">
        <ImageIcon size={15} className="opacity-40" />
        Run this stage to generate a scene image for each scene.
      </div>
    )
  }

  return (
    <>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <p className="text-xs text-[#555570] mb-4">
        {doneCount} / {scenes.length} scenes
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {scenes.map(scene => (
          <div key={scene.scene_id} className="group relative">
            <div className="aspect-[9/16] bg-[#12121a] border border-[#2a2a3d] rounded-xl overflow-hidden flex items-center justify-center">
              {scene.image_file ? (
                <>
                  <img src={`${BASE}/${scene.image_file}`} alt={`Scene ${scene.scene_id}`}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                  <button onClick={() => setLightbox(`${BASE}/${scene.image_file!}`)}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="View full size">
                    <ZoomIn size={22} className="text-white drop-shadow" />
                  </button>
                  <CheckCircle2 size={13} className="absolute top-1.5 right-1.5 text-green-400 drop-shadow" />
                </>
              ) : isRunning ? (
                <div className="flex flex-col items-center gap-1.5">
                  <Loader2 size={18} className="animate-spin text-[#7c6fcd]" />
                  <span className="text-xs text-[#555570]">gen...</span>
                </div>
              ) : (
                <ImageIcon size={20} className="text-[#2a2a3d]" />
              )}
            </div>
            <p className="mt-1 text-xs font-mono text-[#7c6fcd]">S{scene.scene_id}</p>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Stage: Audio ─────────────────────────────────────────────────────────────
function AudioContent({
  short, projectName, isRunning
}: { short: Short; projectName: string; isRunning: boolean }) {
  const { data: segments = [] } = useQuery({
    queryKey: ['segments', projectName, short.short_id],
    queryFn: () => shortsApi.segments(projectName, short.short_id).then(r => r.data),
    enabled: !!short.audio_file || isRunning,
    refetchInterval: isRunning ? 3000 : false,
  })
  const allSegs = short.scenes.flatMap(s => s.audio_sequence)

  if (!isRunning && !short.audio_file) {
    return (
      <div className="flex items-center gap-2 text-[#555570] text-sm py-2">
        <Mic size={15} className="opacity-40" />
        Run this stage to generate voice narration for all segments.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Stitched track */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Volume2 size={13} className="text-[#7c6fcd]" />
          <span className="text-xs font-semibold text-white">Final track</span>
          {isRunning && !short.audio_file && (
            <span className="text-xs text-[#555570]">generating...</span>
          )}
        </div>
        {short.audio_file
          ? <audio src={`${BASE}/${short.audio_file}`} controls className="w-full" />
          : <div className="h-10 bg-[#1a1a26] border border-[#2a2a3d] rounded-lg flex items-center px-3 text-xs text-[#555570]">
              Stitching segments...
            </div>
        }
      </div>

      {/* Segments */}
      {segments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white mb-2">
            Segments <span className="text-[#555570] font-normal ml-1">{segments.length}</span>
          </p>
          <div className="space-y-2">
            {segments.map(seg => {
              const meta = allSegs[seg.index]
              return (
                <div key={seg.index} className={cn(
                  'rounded-xl p-3 border',
                  meta?.type === 'dialogue'
                    ? 'bg-[#7c6fcd]/5 border-[#7c6fcd]/20'
                    : 'bg-[#12121a] border-[#2a2a3d]'
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-[#555570] tabular-nums">#{String(seg.index).padStart(3, '0')}</span>
                    <span className={cn('text-xs font-semibold',
                      meta?.type === 'dialogue' ? 'text-[#7c6fcd]' : 'text-[#8888a8]')}>
                      {meta?.type === 'dialogue' ? meta.character : 'Narrator'}
                    </span>
                    {meta?.voice_instruction && (
                      <span className="text-xs text-[#555570] italic truncate">({meta.voice_instruction})</span>
                    )}
                  </div>
                  {meta?.text && (
                    <p className="text-xs text-white leading-relaxed mb-2 line-clamp-2">{meta.text}</p>
                  )}
                  <audio src={`${BASE}/${seg.url}`} controls className="w-full" style={{ height: 28 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stage: Subtitles ─────────────────────────────────────────────────────────
function SubtitlesContent({ short, isRunning }: { short: Short; isRunning: boolean }) {
  const [assContent, setAssContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-load when file becomes available
  useEffect(() => {
    if (short.subtitle_file && assContent === null && !loading) {
      setLoading(true)
      fetch(`${BASE}/${short.subtitle_file}`)
        .then(r => r.text())
        .then(t => setAssContent(t))
        .catch(() => setAssContent(''))
        .finally(() => setLoading(false))
    }
  }, [short.subtitle_file, assContent, loading])

  const lines = assContent
    ? assContent.split('\n')
        .filter(l => l.startsWith('Dialogue:'))
        .map(l => {
          const parts = l.split(',')
          const start = parts[1] ?? ''
          const raw = parts.slice(9).join(',')
          const text = raw.replace(/\{[^}]*\}/g, '').trim()
          return { start, text }
        })
        .filter(l => l.text)
    : []

  if (!isRunning && !short.subtitle_file) {
    return (
      <div className="flex items-center gap-2 text-[#555570] text-sm py-2">
        <FileText size={15} className="opacity-40" />
        Run this stage to transcribe audio and generate karaoke subtitles.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {short.subtitle_file && (
        <div className="flex items-center gap-3">
          <CheckCircle2 size={14} className="text-green-400" />
          <span className="text-sm text-white">Subtitle file ready</span>
          <a href={`${BASE}/${short.subtitle_file}`} download
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#1a1a26] border border-[#2a2a3d] hover:border-[#7c6fcd]/50 text-[#8888a8] hover:text-white rounded-lg transition-colors">
            <Download size={11} /> Download .ass
          </a>
        </div>
      )}

      {isRunning && !short.subtitle_file && (
        <div className="flex items-center gap-2 text-[#555570] text-sm">
          <Loader2 size={14} className="animate-spin text-[#7c6fcd]" />
          Transcribing audio with Whisper...
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-[#555570]">
          <Loader2 size={12} className="animate-spin" /> Loading preview...
        </div>
      )}

      {lines.length > 0 && (
        <div className="bg-[#0a0a0f] border border-[#2a2a3d] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3d]">
            <span className="text-xs font-semibold text-white">Subtitle lines</span>
            <span className="text-xs text-[#555570]">{lines.length} lines</span>
          </div>
          <div className="divide-y divide-[#1a1a26] max-h-64 overflow-y-auto">
            {lines.map((line, i) => (
              <div key={i} className="flex items-baseline gap-4 px-4 py-1.5">
                <span className="text-xs font-mono text-[#555570] w-16 shrink-0 tabular-nums">{line.start}</span>
                <p className="text-xs text-white leading-relaxed">{line.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stage: Video ─────────────────────────────────────────────────────────────
function VideoContent({ short, isRunning }: { short: Short; isRunning: boolean }) {
  if (!isRunning && !short.video_file) {
    return (
      <div className="flex items-center gap-2 text-[#555570] text-sm py-2">
        <Film size={15} className="opacity-40" />
        Run this stage to assemble the final MP4 with audio, subtitles and music.
      </div>
    )
  }

  if (isRunning && !short.video_file) {
    return (
      <div className="flex items-center gap-2 text-[#555570] text-sm py-2">
        <Loader2 size={14} className="animate-spin text-[#7c6fcd]" />
        Assembling video...
      </div>
    )
  }

  return (
    <div className="flex gap-8 items-start">
      <div className="w-52 aspect-[9/16] bg-[#0a0a0f] border border-[#2a2a3d] rounded-2xl overflow-hidden shrink-0">
        <video src={`${BASE}/${short.video_file}`} controls className="w-full h-full object-contain" />
      </div>
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-400" />
          <span className="text-sm text-white font-medium">Video assembled</span>
        </div>
        <p className="text-xs text-[#8888a8]">
          {short.scenes.length} scenes · {short.total_duration_estimate}s
        </p>
        <a href={`${BASE}/${short.video_file}`} download
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl text-sm font-semibold transition-colors w-fit">
          <Download size={14} /> Download MP4
        </a>
      </div>
    </div>
  )
}

// ─── Script Panel (collapsible) ───────────────────────────────────────────────
function ScriptPanel({ scenes }: { scenes: Scene[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-[#2a2a3d]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#ffffff04] transition-colors rounded-2xl"
      >
        <div className="w-8 h-8 rounded-lg bg-[#1a1a26] flex items-center justify-center text-[#8888a8] shrink-0">
          <FileText size={15} />
        </div>
        <span className="text-sm font-semibold text-white flex-1 text-left">Script</span>
        <span className="text-xs text-[#555570] mr-2">{scenes.length} scenes</span>
        {open ? <ChevronUp size={15} className="text-[#555570]" /> : <ChevronDown size={15} className="text-[#555570]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-[#2a2a3d] pt-4">
          {scenes.map(scene => (
            <div key={scene.scene_id} className="bg-[#0d0d14] border border-[#2a2a3d] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono text-[#7c6fcd] bg-[#7c6fcd]/10 px-2 py-0.5 rounded-full">
                  Scene {scene.scene_id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a26] text-[#8888a8] capitalize">{scene.mood}</span>
                <span className="text-xs text-[#555570] flex items-center gap-1 ml-auto">
                  <Clock size={10} />~{scene.duration_estimate}s
                </span>
              </div>
              <div className="space-y-1.5">
                {scene.audio_sequence.map((seg: AudioSegment, i: number) => (
                  <div key={i} className={cn(
                    'rounded-lg px-3 py-2 text-xs',
                    seg.type === 'narration'
                      ? 'bg-[#12121a] border border-[#2a2a3d]'
                      : 'bg-[#7c6fcd]/5 border border-[#7c6fcd]/20'
                  )}>
                    <span className={cn('font-semibold mr-2',
                      seg.type === 'narration' ? 'text-[#8888a8]' : 'text-[#7c6fcd]')}>
                      {seg.type === 'narration' ? 'Narrator' : seg.character}
                    </span>
                    {seg.voice_instruction && (
                      <span className="text-[#555570] italic mr-2">({seg.voice_instruction})</span>
                    )}
                    <span className="text-white">{seg.text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#2a2a3d]">
                <p className="text-xs text-[#555570] mb-1">Image prompt</p>
                <p className="text-xs text-[#8888a8] italic leading-relaxed">{scene.image_prompt}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShortDetail() {
  const { name, shortId } = useParams<{ name: string; shortId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // job_id of the currently running stage (null when idle)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<StageName | null>(null)
  const [stageLogs, setStageLogs] = useState<Record<StageName, string[]>>({
    images: [], audio: [], subtitles: [], video: [],
  })
  // log offset — how many lines we've fetched so far
  const logOffsetRef = useRef(0)
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Short status polling ───────────────────────────────────────────────────
  const { data: short, isLoading } = useQuery({
    queryKey: ['short', name, shortId],
    queryFn: () => shortsApi.get(name!, shortId!).then(r => r.data),
    enabled: !!name && !!shortId,
    refetchInterval: activeStage ? 2000 : false,
  })

  // Detect in-progress status on load (backend running, page was refreshed)
  const resumedStage = short && !activeStage ? (STATUS_TO_STAGE[short.status] ?? null) : null

  // Keep polling status while a resumed job is running
  useEffect(() => {
    if (resumedStage && !activeStage) {
      qc.invalidateQueries({ queryKey: ['short', name, shortId] })
    }
  }, [resumedStage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Log polling ────────────────────────────────────────────────────────────
  const startLogPolling = useCallback((jobId: string, stage: StageName) => {
    logOffsetRef.current = 0
    logPollRef.current = setInterval(async () => {
      try {
        const { data } = await jobsApi.logs(jobId, logOffsetRef.current)
        if (data.lines.length > 0) {
          logOffsetRef.current += data.lines.length
          setStageLogs(prev => ({
            ...prev,
            [stage]: [...prev[stage], ...data.lines].slice(-200),
          }))
        }
        if (data.done) {
          clearInterval(logPollRef.current!)
          logPollRef.current = null
          setActiveJobId(null)
          setActiveStage(null)
          qc.invalidateQueries({ queryKey: ['short', name, shortId] })
          qc.invalidateQueries({ queryKey: ['segments', name, shortId] })
        }
      } catch {
        // job may have expired from memory — just stop polling
        clearInterval(logPollRef.current!)
        logPollRef.current = null
        setActiveJobId(null)
        setActiveStage(null)
      }
    }, 1000)
  }, [name, shortId, qc])

  // Cleanup on unmount
  useEffect(() => () => {
    if (logPollRef.current) clearInterval(logPollRef.current)
  }, [])

  // ── Run a stage ────────────────────────────────────────────────────────────
  const runStage = async (stage: StageName) => {
    if (activeStage) return
    setStageLogs(prev => ({ ...prev, [stage]: [] }))
    setActiveStage(stage)
    try {
      const { data } = await jobsApi.startStage(name!, shortId!, stage)
      setActiveJobId(data.job_id)
      startLogPolling(data.job_id, stage)
    } catch (e) {
      setStageLogs(prev => ({ ...prev, [stage]: [`Failed to start: ${e}`] }))
      setActiveStage(null)
    }
  }

  const stopStage = () => {
    // We can't cancel the backend task, but we stop watching it
    if (logPollRef.current) clearInterval(logPollRef.current)
    logPollRef.current = null
    setActiveJobId(null)
    setActiveStage(null)
  }

  // visibleRunning = live job OR detected resumed job from status
  const visibleRunning = activeStage ?? resumedStage

  if (isLoading || !short) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-[#7c6fcd]" size={32} />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(`/projects/${name}`)}
          className="text-[#8888a8] hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{short.title || short.short_id}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={cn('text-xs', statusColor(short.status))}>{statusLabel(short.status)}</span>
            <span className="text-[#555570] text-xs flex items-center gap-1">
              <Clock size={10} />{short.total_duration_estimate}s
            </span>
            <span className="text-[#555570] text-xs">{short.scenes.length} scenes</span>
          </div>
        </div>
        {short.video_file && (
          <a href={`${BASE}/${short.video_file}`} download
            className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium text-sm transition-colors">
            <Download size={14} /> Download MP4
          </a>
        )}
      </div>

      {/* Resumed-job banner */}
      {resumedStage && !activeStage && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#7c6fcd]/10 border border-[#7c6fcd]/30 rounded-xl text-sm">
          <Loader2 size={14} className="animate-spin text-[#7c6fcd] shrink-0" />
          <span className="text-white">
            <span className="font-semibold capitalize">{resumedStage}</span> stage is still running in the background.
          </span>
          <span className="text-[#8888a8] text-xs ml-1">Polling for updates...</span>
        </div>
      )}

      <ScriptPanel scenes={short.scenes} />

      <StageCard icon={<ImageIcon size={15} />} title="Scene Images"
        status={stageStatus(short, 'images')} isRunning={visibleRunning === 'images'}
        isDisabled={!!visibleRunning} logs={stageLogs.images}
        onRun={() => runStage('images')} onStop={stopStage}>
        <ImagesContent scenes={short.scenes} isRunning={visibleRunning === 'images'} />
      </StageCard>

      <StageCard icon={<Mic size={15} />} title="Voice Audio"
        status={stageStatus(short, 'audio')} isRunning={visibleRunning === 'audio'}
        isDisabled={!!visibleRunning} logs={stageLogs.audio}
        onRun={() => runStage('audio')} onStop={stopStage}>
        <AudioContent short={short} projectName={name!} isRunning={visibleRunning === 'audio'} />
      </StageCard>

      <StageCard icon={<FileText size={15} />} title="Subtitles"
        status={stageStatus(short, 'subtitles')} isRunning={visibleRunning === 'subtitles'}
        isDisabled={!!visibleRunning} logs={stageLogs.subtitles}
        onRun={() => runStage('subtitles')} onStop={stopStage}>
        <SubtitlesContent short={short} isRunning={visibleRunning === 'subtitles'} />
      </StageCard>

      <StageCard icon={<Video size={15} />} title="Video Assembly"
        status={stageStatus(short, 'video')} isRunning={visibleRunning === 'video'}
        isDisabled={!!visibleRunning} logs={stageLogs.video}
        onRun={() => runStage('video')} onStop={stopStage}>
        <VideoContent short={short} isRunning={visibleRunning === 'video'} />
      </StageCard>

    </div>
  )
}
