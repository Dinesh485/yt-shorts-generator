import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Trash2, Edit3, Save, X } from 'lucide-react'
import { charactersApi, type Character } from '../lib/api'

export default function CharacterArchive({ projectName }: { projectName: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Character>>({})

  const { data: characters = {} } = useQuery({
    queryKey: ['characters', projectName],
    queryFn: () => charactersApi.list(projectName).then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ name, char }: { name: string; char: Character }) =>
      charactersApi.update(projectName, name, char),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['characters', projectName] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => charactersApi.delete(projectName, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters', projectName] }),
  })

  const startEdit = (name: string) => {
    setEditing(name)
    setEditData({ ...characters[name] })
  }

  const saveEdit = () => {
    if (!editing) return
    const orig = characters[editing]
    updateMutation.mutate({
      name: editing,
      char: { ...orig, ...editData } as Character,
    })
  }

  const entries = Object.entries(characters)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Character Archive</h2>
          <p className="text-[#8888a8] text-sm mt-1">
            {entries.length} characters — updated automatically as new ones are found
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#8888a8]">
          <User size={36} className="opacity-30" />
          <p className="text-sm">No characters yet. Run the pipeline to populate the archive.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map(([name, char]) => (
            <div key={name} className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-5">
              {editing === name ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8888a8] mb-1 block">Description</label>
                    <textarea
                      value={editData.description ?? ''}
                      onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                      rows={3}
                      className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#7c6fcd] resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8888a8] mb-1 block">Role</label>
                    <input
                      value={editData.role ?? ''}
                      onChange={e => setEditData(d => ({ ...d, role: e.target.value }))}
                      className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#7c6fcd]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8888a8] mb-1 block">Voice Personality</label>
                    <input
                      value={editData.voice_profile?.personality ?? ''}
                      onChange={e => setEditData(d => ({
                        ...d,
                        voice_profile: { ...d.voice_profile, personality: e.target.value } as any
                      }))}
                      className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#7c6fcd]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#7c6fcd] text-white rounded-lg text-xs font-medium"
                    >
                      <Save size={12} /> Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-[#2a2a3d] text-[#8888a8] rounded-lg text-xs"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c6fcd]/30 to-[#e8a045]/30 flex items-center justify-center">
                        <User size={14} className="text-[#7c6fcd]" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{name}</p>
                        <p className="text-[#8888a8] text-xs">{char.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(name)}
                        className="p-1.5 hover:bg-[#2a2a3d] rounded-lg text-[#8888a8] hover:text-white transition-colors"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(name)}
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-[#8888a8] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p className="text-[#8888a8] text-xs mb-3 line-clamp-3">{char.description}</p>

                  <div className="border-t border-[#2a2a3d] pt-3">
                    <p className="text-xs text-[#555570] mb-1">Voice</p>
                    <p className="text-xs text-[#8888a8] italic">{char.voice_profile.personality}</p>
                    {char.voice_profile.sample_generated && (
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">
                        ✓ Voice sample ready
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
