import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Download, Film, Image as ImageIcon, Clock,
  Loader2, Play, RotateCcw, CheckCircle2, AlertCircle,
  XCircle, Mic, FileText, Video, Volume2, ZoomIn
} from 'lucide-react'
import { shortsApi, type Short, type Scene, type AudioSegment } from '../lib/api'
import { statusColor, statusLabel, cn } from '../lib/utils'

type StageName = 'images' | 'audio' | 'subtitles' | 'video'
type TabName = 'script' | StageName

const STAGES: { key: StageName; label: string; icon: React.ReactNode }[] = [
  { key: 'images',    label: 'Images',    icon: <ImageIcon size={14} /> },
  { key: 'audio',     label: 'Audio',     icon: <Mic size={14} /> },
  { key: 'subtitles', label: 'Subtitles', icon: <FileText size={14} /> },
  { key: 'video',     label: 'Video',     icon: <Video size={14} /> },
]

function stageStatus(short: Short, stage: StageName): 'done' | 'partial' | 'none' {
  if (stage === 'images') {
    const total = short.scenes.length
    const done = short.scenes.filter(s => s.image_file).length
    if (done === 0) return 'none'
    if (done < total) return 'partial'
    return 'done'
  }
  if (stage === 'audio')     return short.audio_file     ? 'done' : 'none'
  if (stage === 'subtitles') return short.subtitle_file  ? 'done' : 'none'
  if (stage === 'video')     return short.video_file     ? 'done' : 'none'
  return 'none'
}

const BASE = 'http://localhost:8000'

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Scene preview"
        className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-bold"
      >✕</button>
    </div>
  )
}

// ── Stage control bar (run / retry / stop + live logs) ───────────────────────
function StageControl({
  stage, label, status, isRunning, isDisabled, logs,
  onRun, onStop,
}: {
  stage: StageName
  label: string
  status: 'done' | 'partial' | 'none'
  isRunning: boolean
  isDisabled: boolean
  logs: string[]
  onRun: () => void
  onStop: () => void
}) {
  const logsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="bg-[#12121a] border border-[#2a2a3d] rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'done'    && <CheckCircle2 size={14} className="text-green-400" />}
          {status === 'partial' && <AlertCircle  size={14} className="text-yellow-400" />}
          {status === 'none'    && <XCircle      size={14} className="text-[#555570]" />}
          <span className="text-sm text-white">{label}</span>
          {status === 'partial' && <span className="text-xs text-yellow-400">partial</span>}
          {isRunning && <Loader2 size={12} className="animate-spin text-[#7c6fcd]" />}
        </div>
        <button
          onClick={isRunning ? onStop : onRun}
          disabled={isDisabled && !isRunning}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
            isRunning
              ? 'bg-red-500/20 border border-red-500/50 text-red-400'
              : status === 'done'
                ? 'bg-[#2a2a3d] text-[#8888a8] hover:text-white hover:bg-[#3a3a4d]'
                : 'bg-[#7c6fcd]/20 border border-[#7c6fcd]/50 text-[#7c6fcd] hover:bg-[#7c6fcd]/30',
            isDisabled && !isRunning && 'opacity-40 cursor-not-allowed'
          )}
        >
          {isRunning ? (
            <><RotateCcw size={11} className="animate-spin" />Stop</>
          ) : status === 'done' ? (
            <><RotateCcw size={11} />Retry</>
          ) : (
            <><Play size={11} />Run</>
          )}
        </button>
      </div>
      {(isRunning || logs.length > 0) && (
        <div
          ref={logsRef}
          className="mt-2 bg-[#0a0a0f] rounded-lg p-2 h-28 overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {logs.length === 0
            ? <div className="text-[#555570]">Starting...</div>
            : logs.map((log, i) => (
                <div key={i} className="text-[#8888a8]">
                  <span className="text-[#555570]">&gt; </span>{log}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ── Tab: Script ───────────────────────────────────────────────────────────────
function ScriptTab({ scenes }: { scenes: Scene[] }) {
  return (
    <div className="space-y-4">
      {scenes.map(scene => (
        <div key={scene.scene_id} className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-mono text-[#7c6fcd] bg-[#7c6fcd]/10 px-2 py-0.5 rounded-full">
              Scene {scene.scene_id}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a26] text-[#8888a8] capitalize">{scene.mood}</span>
            <span className="text-xs text-[#555570] flex items-center gap-1 ml-auto">
              <Clock size={10} />~{scene.duration_estimate}s
            </span>
          </div>
          <div className="space-y-2">
            {scene.audio_sequence.map((seg: AudioSegment, i: number) => (
              <div key={i} className={cn(
                'rounded-lg p-3 text-xs',
                seg.type === 'narration'
                  ? 'bg-[#1a1a26] border border-[#2a2a3d]'
                  : 'bg-[#7c6fcd]/5 border border-[#7c6fcd]/20'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={seg.type === 'narration' ? 'text-[#8888a8] font-semibold' : 'text-[#7c6fcd] font-semibold'}>
                    {seg.type === 'narration' ? 'Narrator' : seg.character}
                  </span>
                  {seg.voice_instruction && (
                    <span className="text-[#555570] italic">({seg.voice_instruction})</span>
                  )}
                </div>
                <p className="text-white leading-relaxed">{seg.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[#2a2a3d]">
            <p className="text-xs text-[#555570] mb-1">Image Prompt</p>
            <p className="text-xs text-[#8888a8] italic leading-relaxed">{scene.image_prompt}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Images ───────────────────────────────────────────────────────────────
function ImagesTab({ scenes, isRunning }: { scenes: Scene[]; isRunning: boolean }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const doneCount = scenes.filter(s => s.image_file).length

  return (
    <>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-[#8888a8]">{doneCount} / {scenes.length} scenes generated</span>
        {isRunning && <span className="text-xs text-[#7c6fcd] flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Generating...</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {scenes.map(scene => (
          <div key={scene.scene_id} className="group relative">
            <div className="aspect-[9/16] bg-[#12121a] border border-[#2a2a3d] rounded-xl overflow-hidden flex items-center justify-center">
              {scene.image_file ? (
                <>
                  <img
                    src={`${BASE}/${scene.image_file}`}
                    alt={`Scene ${scene.scene_id}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <button
                    onClick={() => setLightbox(`${BASE}/${scene.image_file}`)}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Zoom image"
                  >
                    <ZoomIn size={24} className="text-white drop-shadow" />
                  </button>
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 size={14} className="text-green-400 drop-shadow" />
                  </div>
                </>
              ) : isRunning ? (
                <div className="flex flex-col items-center gap-2 text-[#555570]">
                  <Loader2 size={20} className="animate-spin text-[#7c6fcd]" />
                  <span className="text-xs">Generating</span>
                </div>
              ) : (
                <ImageIcon size={24} className="text-[#2a2a3d]" />
              )}
            </div>
            <div className="mt-1.5 px-0.5">
              <span className="text-xs font-mono text-[#7c6fcd]">Scene {scene.scene_id}</span>
              <p className="text-xs text-[#555570] line-clamp-2 mt-0.5">{scene.image_prompt}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Tab: Audio ────────────────────────────────────────────────────────────────
function AudioTab({
  short, projectName, isRunning
}: { short: Short; projectName: string; isRunning: boolean }) {
  const { data: segments = [] } = useQuery({
    queryKey: ['segments', projectName, short.short_id],
    queryFn: () => shortsApi.segments(projectName, short.short_id).then(r => r.data),
    enabled: !!short.audio_file,
    refetchInterval: isRunning ? 3000 : false,
  })

  // Flatten all audio_sequence across scenes for labels
  const allSegs = short.scenes.flatMap(s => s.audio_sequence)

  return (
    <div className="space-y-6">
      {/* Full stitched audio */}
      <div className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 size={16} className="text-[#7c6fcd]" />
          <h3 className="text-sm font-semibold text-white">Final Narration Track</h3>
          {isRunning && <Loader2 size={12} className="animate-spin text-[#7c6fcd]" />}
        </div>
        {short.audio_file ? (
          <audio src={`${BASE}/${short.audio_file}`} controls className="w-full" />
        ) : (
          <div className="flex items-center gap-2 text-[#555570] text-sm py-4">
            <Mic size={16} className="opacity-40" />
            {isRunning ? 'Generating audio...' : 'Audio not generated yet'}
          </div>
        )}
      </div>

      {/* Per-segment players */}
      {segments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            Individual Segments
            <span className="ml-2 text-xs text-[#555570] font-normal">{segments.length} segments</span>
          </h3>
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
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-[#555570]">#{seg.index}</span>
                        <span className={cn(
                          'text-xs font-semibold',
                          meta?.type === 'dialogue' ? 'text-[#7c6fcd]' : 'text-[#8888a8]'
                        )}>
                          {meta?.type === 'dialogue' ? meta.character : 'Narrator'}
                        </span>
                        {meta?.voice_instruction && (
                          <span className="text-xs text-[#555570] italic">({meta.voice_instruction})</span>
                        )}
                      </div>
                      {meta?.text && (
                        <p className="text-xs text-white leading-relaxed line-clamp-2">{meta.text}</p>
                      )}
                    </div>
                  </div>
                  <audio src={`${BASE}/${seg.url}`} controls className="w-full h-8" style={{ height: 32 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!short.audio_file && !isRunning && segments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8888a8]">
          <Mic size={40} className="opacity-20" />
          <p className="text-sm">Run the Audio stage to generate voice narration</p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Subtitles ────────────────────────────────────────────────────────────
function SubtitlesTab({ short, isRunning }: { short: Short; isRunning: boolean }) {
  // Parse ASS content — extract just the dialogue lines for a readable preview
  const [assContent, setAssContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadAss = async () => {
    if (!short.subtitle_file || assContent !== null) return
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/${short.subtitle_file}`)
      setAssContent(await res.text())
    } catch {
      setAssContent('Failed to load subtitle file')
    } finally {
      setLoading(false)
    }
  }

  // Parse dialogue lines from ASS into readable text
  const lines = assContent
    ? assContent
        .split('\n')
        .filter(l => l.startsWith('Dialogue:'))
        .map(l => {
          // ASS dialogue format: Dialogue: 0,start,end,Style,,0,0,0,,{tags}text
          const parts = l.split(',')
          const start = parts[1] ?? ''
          const rawText = parts.slice(9).join(',')
          // Strip ASS override tags like {\kf50\1c&H...}
          const text = rawText.replace(/\{[^}]*\}/g, '').trim()
          return { start, text }
        })
        .filter(l => l.text)
    : []

  return (
    <div className="space-y-6">
      {short.subtitle_file ? (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#8888a8]">
              ASS karaoke subtitle file generated
            </span>
            <a
              href={`${BASE}/${short.subtitle_file}`}
              download
              className="flex items-center gap-1 text-xs px-3 py-1 bg-[#2a2a3d] hover:bg-[#3a3a4d] text-[#8888a8] hover:text-white rounded-lg transition-colors"
            >
              <Download size={11} /> Download .ass
            </a>
          </div>

          {/* Preview button */}
          {assContent === null && (
            <button
              onClick={loadAss}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a26] border border-[#2a2a3d] hover:border-[#7c6fcd]/50 text-[#8888a8] hover:text-white rounded-xl text-sm transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Preview Subtitle Lines
            </button>
          )}

          {lines.length > 0 && (
            <div className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2a2a3d] flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Subtitle Lines</span>
                <span className="text-xs text-[#555570]">{lines.length} lines</span>
              </div>
              <div className="divide-y divide-[#1a1a26] max-h-[60vh] overflow-y-auto">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-baseline gap-4 px-4 py-2">
                    <span className="text-xs font-mono text-[#555570] w-16 shrink-0">{line.start}</span>
                    <p className="text-sm text-white">{line.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8888a8]">
          <FileText size={40} className="opacity-20" />
          {isRunning
            ? <><Loader2 size={16} className="animate-spin text-[#7c6fcd]" /><p className="text-sm">Transcribing audio...</p></>
            : <p className="text-sm">Run the Subtitles stage to generate karaoke subtitles</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Tab: Video ────────────────────────────────────────────────────────────────
function VideoTab({ short, isRunning }: { short: Short; isRunning: boolean }) {
  return (
    <div className="space-y-6">
      {short.video_file ? (
        <>
          <div className="flex items-center gap-3">
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-sm text-white">Video assembled successfully</span>
            <a
              href={`${BASE}/${short.video_file}`}
              download
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium text-sm transition-colors"
            >
              <Download size={14} /> Download MP4
            </a>
          </div>
          <div className="flex justify-center">
            <div className="w-72 aspect-[9/16] bg-[#12121a] border border-[#2a2a3d] rounded-2xl overflow-hidden">
              <video
                src={`${BASE}/${short.video_file}`}
                controls
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8888a8]">
          <Film size={40} className="opacity-20" />
          {isRunning
            ? <><Loader2 size={16} className="animate-spin text-[#7c6fcd]" /><p className="text-sm">Assembling video...</p></>
            : <p className="text-sm">Run the Video stage to assemble the final MP4</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShortDetail() {
  const { name, shortId } = useParams<{ name: string; shortId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabName>('script')
  const [runningStage, setRunningStage] = useState<StageName | null>(null)
  const [stageLogs, setStageLogs] = useState<Record<StageName, string[]>>({
    images: [], audio: [], subtitles: [], video: []
  })
  const wsRef = useRef<WebSocket | null>(null)

  const { data: short, isLoading } = useQuery({
    queryKey: ['short', name, shortId],
    queryFn: () => shortsApi.get(name!, shortId!).then(r => r.data),
    enabled: !!name && !!shortId,
    refetchInterval: runningStage ? 2000 : false,
  })

  const addLog = useCallback((stage: StageName, msg: string) => {
    setStageLogs(prev => ({
      ...prev,
      [stage]: [...prev[stage].slice(-150), msg]
    }))
  }, [])

  const runStage = (stage: StageName) => {
    if (runningStage) return
    setRunningStage(stage)
    setActiveTab(stage)
    setStageLogs(prev => ({ ...prev, [stage]: [] }))

    const ws = new WebSocket(`ws://localhost:8000/ws/stage/${name}/${shortId}/${stage}`)
    wsRef.current = ws

    ws.onopen = () => addLog(stage, `Starting ${stage}...`)
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.message) addLog(stage, event.message)
      if (event.event === 'stage_complete' || event.event === 'error') {
        setRunningStage(null)
        qc.invalidateQueries({ queryKey: ['short', name, shortId] })
        qc.invalidateQueries({ queryKey: ['segments', name, shortId] })
        ws.close()
      }
    }
    ws.onerror  = () => { addLog(stage, 'WebSocket error — is the backend running?'); setRunningStage(null) }
    ws.onclose  = () => setRunningStage(null)
  }

  const stopStage = () => {
    wsRef.current?.close()
    setRunningStage(null)
  }

  if (isLoading || !short) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-[#7c6fcd]" size={32} />
      </div>
    )
  }

  const TABS: { key: TabName; label: string; icon: React.ReactNode }[] = [
    { key: 'script',    label: 'Script',    icon: <FileText size={14} /> },
    { key: 'images',    label: 'Images',    icon: <ImageIcon size={14} /> },
    { key: 'audio',     label: 'Audio',     icon: <Mic size={14} /> },
    { key: 'subtitles', label: 'Subtitles', icon: <FileText size={14} /> },
    { key: 'video',     label: 'Video',     icon: <Video size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-[#2a2a3d] bg-[#12121a] shrink-0">
        <button onClick={() => navigate(`/projects/${name}`)} className="text-[#8888a8] hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{short.title || short.short_id}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={cn('text-xs', statusColor(short.status))}>{statusLabel(short.status)}</span>
            <span className="text-[#555570] text-xs flex items-center gap-1"><Clock size={10} />{short.total_duration_estimate}s</span>
            <span className="text-[#555570] text-xs">{short.scenes.length} scenes</span>
          </div>
        </div>
        {short.video_file && (
          <a
            href={`${BASE}/${short.video_file}`}
            download
            className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium text-sm transition-colors"
          >
            <Download size={14} /> Download MP4
          </a>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: stage controls */}
        <aside className="w-64 shrink-0 border-r border-[#2a2a3d] flex flex-col bg-[#0d0d14] overflow-y-auto">
          <div className="p-4 space-y-2">
            <p className="text-xs text-[#555570] uppercase tracking-wider font-semibold mb-3 px-1">Pipeline</p>
            {STAGES.map(({ key, label }) => (
              <StageControl
                key={key}
                stage={key}
                label={label}
                status={stageStatus(short, key)}
                isRunning={runningStage === key}
                isDisabled={!!runningStage}
                logs={stageLogs[key]}
                onRun={() => runStage(key)}
                onStop={stopStage}
              />
            ))}
          </div>
        </aside>

        {/* Main content: tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex gap-1 px-6 pt-4 border-b border-[#2a2a3d] shrink-0">
            {TABS.map(({ key, label, icon }) => {
              const stageKey = key as StageName
              const isDone = key !== 'script' && stageStatus(short, stageKey) === 'done'
              const isPartial = key !== 'script' && stageStatus(short, stageKey) === 'partial'
              const isActive = activeTab === key

              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative',
                    isActive
                      ? 'text-white border-b-2 border-[#7c6fcd]'
                      : 'text-[#8888a8] hover:text-white'
                  )}
                >
                  {icon}
                  {label}
                  {key !== 'script' && (
                    isDone
                      ? <CheckCircle2 size={11} className="text-green-400" />
                      : isPartial
                        ? <AlertCircle size={11} className="text-yellow-400" />
                        : null
                  )}
                  {runningStage === key && (
                    <Loader2 size={11} className="animate-spin text-[#7c6fcd]" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'script'    && <ScriptTab scenes={short.scenes} />}
            {activeTab === 'images'    && <ImagesTab scenes={short.scenes} isRunning={runningStage === 'images'} />}
            {activeTab === 'audio'     && <AudioTab short={short} projectName={name!} isRunning={runningStage === 'audio'} />}
            {activeTab === 'subtitles' && <SubtitlesTab short={short} isRunning={runningStage === 'subtitles'} />}
            {activeTab === 'video'     && <VideoTab short={short} isRunning={runningStage === 'video'} />}
          </div>
        </div>
      </div>
    </div>
  )
}
