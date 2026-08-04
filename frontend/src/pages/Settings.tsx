import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import api from '../lib/api'

export default function Settings() {
  const [geminiKey, setGeminiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const save = () => {
    localStorage.setItem('gemini_api_key', geminiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testKey = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await api.post('/settings/test-gemini', { api_key: geminiKey })
      setTestResult('✓ Gemini API key is valid')
    } catch (e: any) {
      setTestResult(`✗ ${e?.response?.data?.detail || 'Invalid API key'}`)
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('gemini_api_key')
    if (stored) setGeminiKey(stored)
  }, [])

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-[#8888a8] text-sm mt-1">Global configuration for the pipeline</p>
      </div>

      <div className="bg-[#12121a] border border-[#2a2a3d] rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white mb-4 border-b border-[#2a2a3d] pb-2">
            API Keys
          </h2>

          <div>
            <label className="block text-xs text-[#8888a8] mb-2">
              Gemini API Key
              <span className="ml-2 text-[#555570]">Required for script generation and optional image generation</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-[#1a1a26] border border-[#2a2a3d] rounded-xl px-4 py-2.5 text-white text-sm placeholder-[#555570] focus:outline-none focus:border-[#7c6fcd] pr-10"
                />
                <button
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8888a8] hover:text-white"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={testKey}
                disabled={testing || !geminiKey}
                className="px-4 py-2.5 border border-[#2a2a3d] text-[#8888a8] hover:text-white rounded-xl text-sm disabled:opacity-50 transition-colors"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
              </button>
            </div>
            {testResult && (
              <p className={`text-xs mt-2 ${testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {testResult}
              </p>
            )}
            <p className="text-xs text-[#555570] mt-2">
              Stored locally in your browser. Also add it to <code className="text-[#7c6fcd]">backend/.env</code> as <code className="text-[#7c6fcd]">GEMINI_API_KEY</code>
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white mb-4 border-b border-[#2a2a3d] pb-2">
            Pipeline Services
          </h2>
          <div className="space-y-3">
            <ServiceRow name="Wan2GP (TTS + Image)" url="http://localhost:7860" />
            <ServiceRow name="Backend API" url="http://localhost:8000" />
          </div>
        </div>
      </div>

      <button
        onClick={save}
        className="mt-6 flex items-center gap-2 px-6 py-3 bg-[#7c6fcd] hover:bg-[#9585e0] text-white rounded-xl font-medium transition-colors"
      >
        {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}

function ServiceRow({ name, url }: { name: string; url: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm text-white">{name}</p>
        <p className="text-xs text-[#555570]">{url}</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs px-3 py-1.5 border border-[#2a2a3d] text-[#8888a8] hover:text-white hover:border-[#7c6fcd]/50 rounded-lg transition-colors"
      >
        Open
      </a>
    </div>
  )
}
