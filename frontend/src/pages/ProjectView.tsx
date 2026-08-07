import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Play, Upload,
  ChevronLeft, Loader2, CheckCircle2, AlertCircle,
  Clock, Film, RotateCcw
} from 'lucide-react'
import { projectsApi, shortsApi, uploadApi, jobsApi, type Short } from '../lib/api'
import { cn, statusColor, statusLabel, statusPercent } from '../lib/utils'
import CharacterArchive from '../components/CharacterArchive'
import ProjectSettings from '../components/ProjectSettings'

type Tab = 'shorts' | 'characters' | 'settings'
type SourceType = 'text' | 'url' | 'file'

const ACTIVE_STATUSES = new Set(['scripting', 'generating_images', 'generating_audio', 'transcribing', 'assembling'])

export default function ProjectView() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('shorts')
  const [sourceType, setSourceType] = useState<SourceType>('text')
  const [sourceText, setSourceText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [, setSourceFile] = useState<File | null>(null)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logOffsetRef = useRef(0)
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: config } = useQuery({
    queryKey: ['project', name],
    queryFn: () => projectsApi.get(name!).then(r => r.data),
    enabled: !!name,
  })

  const { data: shorts = [] } = useQuery({
    queryKey: ['shorts', name],
    queryFn: () => shortsApi.list(name!).then(r => r.data),
    enabled: !!name,
    refetchInterval: (running || shorts.some(s => ACTIVE_STATUSES.has(s.status))) ? 3000 : false,
  })

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-200), msg])
  }, [])

  // ── Log polling for pipeline job ──────────────────────────────────────────
  const startLogPolling = useCallback((jobId: string) => {
    logOffsetRef.current = 0
    logPollRef.current = setInterval(async () => {
      try {
        const { data } = await jobsApi.logs(jobId, logOffsetRef.current)
        if (data.lines.length > 0) {
          logOffsetRef.current += data.lines.length
          setLogs(prev => [...prev, ...data.lines].slice(-200))
        }
        if (data.done) {
          clearInterval(logPollRef.current!)
          logPollRef.current = null
          setRunning(false)
        }
      } catch {
        clearInterval(logPollRef.current!)
        logPollRef.current = null
        setRunning(false)
      }
    }, 1000)
  }, [])

  useEffect(() => () => {
    if (logPollRef.current) clearInterval(logPollRef.current)
  }, [])

  const handleFileUpload = async (file: File) => {
    setSourceFile(file)
    try {
      await uploadApi.sourceFile(name!, file)
      setUploadedFilename(file.name)
      addLog(`File uploaded: ${file.name}`)
    } catch (e) {
      addLog(`Upload failed: ${e}`)
    }
  }

  const startPipeline = async () => {
    let content = ''
    if (sourceType === 'text') content = sourceText
    else if (sourceType === 'url') content = sourceUrl
    else if (sourceType === 'file') content = uploadedFilename

    if (!content.trim()) { addLog('Error: No source content provided'); return }

    setRunning(true)
    setLogs([])
    addLog('Starting pipeline...')

    try {
      const { data } = await jobsApi.startPipeline(name!, {
        source_type: sourceType,
        source_content: content,
        project_name: name!,
      })
      addLog(`Job started: ${data.job_id}`)
      startLogPolling(data.job_id)
    } catch (e) {
      addLog(`Failed to start pipeline: ${e}`)
      setRunning(false)
    }
  }

  const stopPipeline = () => {
    if (logPollRef.current) clearInterval(logPollRef.current)
    logPollRef.current = null
    setRunning(false)
    addLog('Stopped watching pipeline (job continues in background)')
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-[#7c6fcd]" size={32} />
      </div>
    )
  }

  const doneCount = shorts.filter(s => s.status === 'done').length
  const errorCount = shorts.filter(s => s.status === 'error').length

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-[#2a2a3d] bg-[#12121a]">
        <button onClick={() => navigate('/')} className="text-[#8888a8] hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white capitalize">{config.name}</h1>
          <p className="text-[#8888a8] text-xs mt-0.5">{config.style}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatBadge icon={<Film size={12} />} label={`${shorts.length} shorts`} />
          <StatBadge icon={<CheckCircle2 size={12} />} label={`${doneCount} done`} color="green" />
          {errorCount > 0 && <StatBadge icon={<AlertCircle size={12} />} label={`${errorCount} errors`} color="red" />}
          <span className="text-xs px-2 py-1 rounded-lg bg-[#1a1a26] border border-[#2a2a3d] text-[#8888a8]">
            Wan2GP
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-8 pt-4 border-b border-[#2a2a3d]">
        {(['shorts', 'characters', 'settings'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize',
              tab === t
                ? 'text-white border-b-2 border-[#7c6fcd]'
                : 'text-[#8888a8] hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex">
        {tab === 'shorts' && (
          <>
            {/* Left: source input + pipeline */}
            <div className="w-80 shrink-0 border-r border-[#2a2a3d] flex flex-col">
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <h2 className="text-sm font-semibold text-white">Run Pipeline</h2>

                {/* Source type selector */}
                <div className="flex gap-1 p-1 bg-[#1a1a26] rounded-xl">
                  {(['text', 'url', 'file'] as SourceType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setSourceType(t)}
                      className={cn(
                        'flex-1 py-1.5 text-xs rounded-lg font-medium capitalize transition-all',
                        sourceType === t
                          ? 'bg-[#7c6fcd] text-white'
                          : 'text-[#8888a8] hover:text-white'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Source input */}
                {sourceType === 'text' && (
                  <textarea
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    placeholder="Paste source text here..."
                    rows={8}
                    className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-3 text-white text-sm placeholder-[#555570] focus:outline-none focus:border-[#7c6fcd] resize-none"
                  />
                )}

                {sourceType === 'url' && (
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white text-sm placeholder-[#555570] focus:outline-none focus:border-[#7c6fcd]"
                  />
                )}

                {sourceType === 'file' && (
                  <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-[#2a2a3d] rounded-xl cursor-pointer hover:border-[#7c6fcd]/50 transition-colors">
                    <Upload size={20} className="text-[#8888a8]" />
                    <span className="text-sm text-[#8888a8]">
                      {uploadedFilename || 'Click to upload file'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".txt,.md,.pdf"
                      onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                  </label>
                )}

                {/* Run button */}
                <button
                  onClick={running ? stopPipeline : startPipeline}
                  className={cn(
                    'w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
                    running
                      ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                      : 'bg-[#7c6fcd] hover:bg-[#9585e0] text-white'
                  )}
                >
                  {running ? (
                    <><RotateCcw size={16} className="animate-spin" /> Stop Pipeline</>
                  ) : (
                    <><Play size={16} /> Run Pipeline</>
                  )}
                </button>

                {/* Logs */}
                <div className={cn(
                  "bg-[#0a0a0f] border border-[#2a2a3d] rounded-xl p-3 h-48 overflow-y-auto font-mono text-xs space-y-1",
                  !running && logs.length === 0 && "hidden"
                )}>
                  {logs.length === 0 ? (
                    <div className="text-[#555570]">Starting pipeline...</div>
                  ) : logs.map((log, i) => (
                    <div key={i} className="text-[#8888a8]">
                      <span className="text-[#555570]">&gt; </span>{log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Right: shorts grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {shorts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8888a8]">
                  <Film size={40} className="opacity-30" />
                  <p className="text-sm">No shorts yet. Run the pipeline to generate them.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {shorts.map(short => (
                    <ShortCard
                      key={short.short_id}
                      short={short}
                      onClick={() => navigate(`/projects/${name}/shorts/${short.short_id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'characters' && (
          <div className="flex-1 overflow-y-auto p-6">
            <CharacterArchive projectName={name!} />
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6">
            <ProjectSettings projectName={name!} config={config} />
          </div>
        )}
      </div>
    </div>
  )
}

function ShortCard({ short, onClick }: { short: Short; onClick: () => void }) {
  const pct = statusPercent(short.status)
  const isActive = !['pending', 'done', 'error'].includes(short.status)

  return (
    <div
      onClick={short.status === 'done' ? onClick : undefined}
      className={cn(
        'bg-[#12121a] border border-[#2a2a3d] rounded-2xl overflow-hidden transition-all',
        short.status === 'done' ? 'hover:border-[#7c6fcd]/50 cursor-pointer' : 'cursor-default'
      )}
    >
      {/* Thumbnail or placeholder */}
      <div className="aspect-[9/16] bg-[#1a1a26] flex items-center justify-center relative overflow-hidden max-h-40">
        {short.scenes[0]?.image_file ? (
          <img
            src={`/${short.scenes[0].image_file}`}
            alt={short.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Film size={24} className="text-[#2a2a3d]" />
        )}
        {/* Status overlay */}
        {isActive && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#7c6fcd]" />
          </div>
        )}
        {short.status === 'done' && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 size={16} className="text-green-400 drop-shadow" />
          </div>
        )}
        {short.status === 'error' && (
          <div className="absolute top-2 right-2">
            <AlertCircle size={16} className="text-red-400 drop-shadow" />
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-white text-xs font-medium line-clamp-2 mb-2">{short.title || short.short_id}</p>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-xs', statusColor(short.status))}>
            {statusLabel(short.status)}
          </span>
          <span className="text-[#555570] text-xs flex items-center gap-1">
            <Clock size={10} />
            {short.total_duration_estimate}s
          </span>
        </div>
        {isActive && (
          <div className="mt-2 h-1 bg-[#2a2a3d] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7c6fcd] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function StatBadge({
  icon, label, color = 'default'
}: { icon: React.ReactNode; label: string; color?: 'default' | 'green' | 'red' }) {
  return (
    <span className={cn(
      'flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[#1a1a26] border border-[#2a2a3d]',
      color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-[#8888a8]'
    )}>
      {icon}{label}
    </span>
  )
}
