import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Film, Image, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { projectsApi, type ProjectSummary } from '../lib/api'
import NewProjectModal from '../components/NewProjectModal'

export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => projectsApi.delete(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-[#8888a8] text-sm mt-1">
            Each project is a YouTube Shorts series with its own style and characters
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-[#7c6fcd]" size={32} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map(p => (
            <ProjectCard
              key={p.name}
              project={p}
              onClick={() => navigate(`/projects/${p.name}`)}
              onDelete={() => {
                if (confirm(`Delete project "${p.name}"?`)) {
                  deleteMutation.mutate(p.name)
                }
              }}
            />
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

function ProjectCard({
  project, onClick, onDelete
}: {
  project: ProjectSummary
  onClick: () => void
  onDelete: () => void
}) {
  const progress = project.short_count > 0
    ? Math.round((project.done_count / project.short_count) * 100)
    : 0

  return (
    <div
      className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5 hover:border-[#7c6fcd]/50 transition-all cursor-pointer group relative"
      onClick={onClick}
    >
      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#8888a8] transition-all"
      >
        <Trash2 size={14} />
      </button>

      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7c6fcd]/20 to-[#e8a045]/20 flex items-center justify-center mb-4 border border-[#7c6fcd]/20">
        <Film size={22} className="text-[#7c6fcd]" />
      </div>

      {/* Name */}
      <h3 className="font-semibold text-white capitalize mb-1">{project.name}</h3>
      <p className="text-[#8888a8] text-xs line-clamp-2 mb-4">{project.style}</p>

      {/* Stats */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1 text-xs text-[#8888a8]">
          <Film size={12} />
          <span>{project.short_count} shorts</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-[#8888a8]">
          <Image size={12} />
          <span>Wan2GP</span>
        </div>
      </div>

      {/* Progress bar */}
      {project.short_count > 0 && (
        <div>
          <div className="flex justify-between text-xs text-[#8888a8] mb-1">
            <span>{project.done_count}/{project.short_count} done</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#2a2a3d] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#7c6fcd] to-[#e8a045] rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Arrow */}
      <div className="flex justify-end mt-3">
        <ChevronRight size={16} className="text-[#8888a8] group-hover:text-[#7c6fcd] transition-colors" />
      </div>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[#12121a] border border-[#2a2a3d] flex items-center justify-center">
        <Film size={28} className="text-[#8888a8]" />
      </div>
      <div className="text-center">
        <p className="text-white font-medium">No projects yet</p>
        <p className="text-[#8888a8] text-sm mt-1">Create your first project to get started</p>
      </div>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors"
      >
        <Plus size={16} />
        New Project
      </button>
    </div>
  )
}
