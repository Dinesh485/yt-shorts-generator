import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Download, Film, Image, Clock, Loader2 } from 'lucide-react'
import { shortsApi } from '../lib/api'
import { statusColor, statusLabel } from '../lib/utils'

export default function ShortDetail() {
  const { name, shortId } = useParams<{ name: string; shortId: string }>()
  const navigate = useNavigate()

  const { data: short, isLoading } = useQuery({
    queryKey: ['short', name, shortId],
    queryFn: () => shortsApi.get(name!, shortId!).then(r => r.data),
    enabled: !!name && !!shortId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-[#7c6fcd]" size={32} />
      </div>
    )
  }

  if (!short) return null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(`/projects/${name}`)}
          className="text-[#8888a8] hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{short.title || short.short_id}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={statusColor(short.status)}>{statusLabel(short.status)}</span>
            <span className="text-[#555570] text-sm flex items-center gap-1">
              <Clock size={12} />
              {short.total_duration_estimate}s
            </span>
            <span className="text-[#555570] text-sm">
              {short.scenes.length} scenes
            </span>
          </div>
        </div>
        {short.video_file && (
          <a
            href={`/${short.video_file}`}
            download
            className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors"
          >
            <Download size={16} />
            Download MP4
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Video preview */}
        <div className="xl:col-span-1">
          <h2 className="text-sm font-semibold text-white mb-3">Preview</h2>
          <div className="aspect-[9/16] bg-[#12121a] border border-[#2a2a3d] rounded-2xl overflow-hidden flex items-center justify-center max-w-xs">
            {short.video_file ? (
              <video
                src={`/${short.video_file}`}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-[#8888a8]">
                <Film size={36} className="opacity-30" />
                <p className="text-sm">Video not ready yet</p>
              </div>
            )}
          </div>

          {/* Audio */}
          {short.audio_file && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-white mb-2">Audio</h2>
              <audio
                src={`/${short.audio_file}`}
                controls
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Scenes */}
        <div className="xl:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-4">Scenes</h2>
          <div className="space-y-4">
            {short.scenes.map(scene => (
              <div
                key={scene.scene_id}
                className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#7c6fcd] bg-[#7c6fcd]/10 px-2 py-0.5 rounded-full">
                      Scene {scene.scene_id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a26] text-[#8888a8] capitalize">
                      {scene.mood}
                    </span>
                  </div>
                  <span className="text-xs text-[#555570] flex items-center gap-1">
                    <Clock size={10} />
                    ~{scene.duration_estimate}s
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Scene image */}
                  <div className="aspect-[9/16] bg-[#1a1a26] rounded-xl overflow-hidden flex items-center justify-center max-h-48">
                    {scene.image_file ? (
                      <img
                        src={`/${scene.image_file}`}
                        alt={`Scene ${scene.scene_id}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image size={24} className="text-[#2a2a3d]" />
                    )}
                  </div>

                  {/* Script */}
                  <div className="space-y-3">
                    {scene.audio_sequence.map((seg, i) => (
                      <div key={i} className={`rounded-lg p-3 text-xs ${
                        seg.type === 'narration'
                          ? 'bg-[#1a1a26] border border-[#2a2a3d]'
                          : 'bg-[#7c6fcd]/5 border border-[#7c6fcd]/20'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          {seg.type === 'narration' ? (
                            <span className="text-[#8888a8] font-medium">Narrator</span>
                          ) : (
                            <span className="text-[#7c6fcd] font-medium">{seg.character}</span>
                          )}
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
                <div className="mt-4 pt-4 border-t border-[#2a2a3d]">
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
