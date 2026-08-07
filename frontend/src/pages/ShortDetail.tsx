import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Download, Film, Image, Clock,
  Loader2, Play, RotateCcw, CheckCircle2, AlertCircle, XCircle
} from 'lucide-react'
import { shortsApi, type Short } from '../lib/api'
import { statusColor, statusLabel, cn } from '../lib/utils'

type StageName = 'images' | 'audio' | 'subtitles' | 'video'

const STAGES: { key: StageName; label: string; field: keyof Short }[] = [
  { key: 'images', label: 'Scene Images', field: 'scenes' },
  { key: 'audio', label: 'Voice Audio', field: 'audio_file' },
  { key: 'subtitles', label: 'Subtitles', field: 'subtitle_file' },
  { key: 'video', label: 'Video Assembly', field: 'video_file' },
]

function stageStatus(short: Short, stage: StageName): 'done' | 'partial' | 'none' {
  if (stage === 'images') {
    const total = short.scenes.length
    const done = short.scenes.filter(s => s.image_file).length
    if (done === 0) return 'none'
    if (done < total) return 'partial'
    return 'done'
  }
  if (stage === 'audio') return short.audio_file ? 'done' : 'none'
  if (stage === 'subtitles') return short.subtitle_file ? 'done' : 'none'
  if (stage === 'video') return short.video_file ? 'done' : 'none'
  return 'none'
}

export default function ShortDetail() {
  const { name, shortId } = useParams<{ name: string; shortId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

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
      [stage]: [...prev[stage].slice(-100), msg]
    }))
  }, [])

  const runStage = (stage: StageName) => {
    if (runningStage) return
    setRunningStage(stage)
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
        ws.close()
      }
    }

    ws.onerror = () => {
      addLog(stage, 'WebSocket error')
      setRunningStage(null)
    }

    ws.onclose = () => setRunningStage(null)
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(`/projects/${name}`)} className="text-[#8888a8] hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{short.title || short.short_id}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={statusColor(short.status)}>{statusLabel(short.status)}</span>
            <span className="text-[#555570] text-sm flex items-center gap-1">
              <Clock size={12} />{short.total_duration_estimate}s
            </span>
            <span className="text-[#555570] text-sm">{short.scenes.length} scenes</span>
          </div>
        </div>
        {short.video_file && (
          <a href={`http://localhost:8000/${short.video_file}`} download
            className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors">
            <Download size={16} />Download MP4
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Left: Video + Stage Controls */}
        <div className="space-y-6">
          {/* Video Preview */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Preview</h2>
            <div className="aspect-[9/16] bg-[#12121a] border border-[#2a2a3d] rounded-2xl overflow-hidden flex items-center justify-center max-w-xs">
              {short.video_file ? (
                <video src={`http://localhost:8000/${short.video_file}`} controls className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-3 text-[#8888a8]">
                  <Film size={36} className="opacity-30" />
                  <p className="text-sm">Video not ready</p>
                </div>
              )}
            </div>
          </div>

          {/* Audio */}
          {short.audio_file && (
            <div>
              <h2 className="text-sm font-semibold text-white mb-2">Audio</h2>
              <audio src={`http://localhost:8000/${short.audio_file}`} controls className="w-full" />
            </div>
          )}

          {/* Stage Controls */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Pipeline Stages</h2>
            <div className="space-y-2">
              {STAGES.map(({ key, label }) => {
                const status = stageStatus(short, key)
                const isRunning = runningStage === key
                const logs = stageLogs[key]

                return (
                  <div key={key} className="bg-[#12121a] border border-[#2a2a3d] rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {status === 'done' ? (
                          <CheckCircle2 size={14} className="text-green-400" />
                        ) : status === 'partial' ? (
                          <AlertCircle size={14} className="text-yellow-400" />
                        ) : (
                          <XCircle size={14} className="text-[#555570]" />
                        )}
                        <span className="text-sm text-white">{label}</span>
                        {status === 'partial' && (
                          <span className="text-xs text-yellow-400">partial</span>
                        )}
                      </div>
                      <button
                        onClick={isRunning ? stopStage : () => runStage(key)}
                        disabled={!!runningStage && !isRunning}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                          isRunning
                            ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                            : status === 'done'
                            ? 'bg-[#2a2a3d] text-[#8888a8] hover:text-white hover:bg-[#3a3a4d]'
                            : 'bg-[#7c6fcd]/20 border border-[#7c6fcd]/50 text-[#7c6fcd] hover:bg-[#7c6fcd]/30',
                          !!runningStage && !isRunning && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        {isRunning ? (
                          <><RotateCcw size={11} className="animate-spin" /> Stop</>
                        ) : status === 'done' ? (
                          <><RotateCcw size={11} /> Retry</>
                        ) : (
                          <><Play size={11} /> Run</>
                        )}
                      </button>
                    </div>

                    {/* Log panel */}
                    {(isRunning || logs.length > 0) && (
                      <div className="mt-2 bg-[#0a0a0f] rounded-lg p-2 h-24 overflow-y-auto font-mono text-xs space-y-0.5">
                        {logs.length === 0 ? (
                          <div className="text-[#555570]">Starting...</div>
                        ) : logs.map((log, i) => (
                          <div key={i} className="text-[#8888a8]">
                            <span className="text-[#555570]">&gt; </span>{log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Scenes */}
        <div className="xl:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-4">Scenes</h2>
          <div className="space-y-4">
            {short.scenes.map(scene => (
              <div key={scene.scene_id} className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#7c6fcd] bg-[#7c6fcd]/10 px-2 py-0.5 rounded-full">
                      Scene {scene.scene_id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a26] text-[#8888a8] capitalize">
                      {scene.mood}
                    </span>
                    {scene.image_file
                      ? <CheckCircle2 size={12} className="text-green-400" />
                      : <XCircle size={12} className="text-[#555570]" />
                    }
                  </div>
                  <span className="text-xs text-[#555570] flex items-center gap-1">
                    <Clock size={10} />~{scene.duration_estimate}s
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Scene image */}
                  <div className="aspect-[9/16] bg-[#1a1a26] rounded-xl overflow-hidden flex items-center justify-center max-h-56">
                    {scene.image_file ? (
                      <img
                        src={`http://localhost:8000/${scene.image_file}`}
                        alt={`Scene ${scene.scene_id}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image size={24} className="text-[#2a2a3d]" />
                    )}
                  </div>

                  {/* Script */}
                  <div className="space-y-2 overflow-y-auto max-h-56">
                    {scene.audio_sequence.map((seg, i) => (
                      <div key={i} className={cn(
                        'rounded-lg p-2.5 text-xs',
                        seg.type === 'narration'
                          ? 'bg-[#1a1a26] border border-[#2a2a3d]'
                          : 'bg-[#7c6fcd]/5 border border-[#7c6fcd]/20'
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={seg.type === 'narration' ? 'text-[#8888a8] font-medium' : 'text-[#7c6fcd] font-medium'}>
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
                </div>

                {/* Image prompt */}
                <div className="mt-3 pt-3 border-t border-[#2a2a3d]">
                  <p className="text-xs text-[#555570] mb-1">Image Prompt</p>
                  <p className="text-xs text-[#8888a8] italic leading-relaxed">{scene.image_prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
