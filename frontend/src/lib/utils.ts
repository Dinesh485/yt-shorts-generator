import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'text-green-400'
    case 'error': return 'text-red-400'
    case 'pending': return 'text-gray-400'
    default: return 'text-yellow-400'
  }
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    scripting: 'Writing Script',
    generating_images: 'Generating Images',
    generating_audio: 'Generating Audio',
    transcribing: 'Transcribing',
    assembling: 'Assembling Video',
    done: 'Done',
    error: 'Error',
  }
  return labels[status] || status
}

export function statusPercent(status: string): number {
  const steps: Record<string, number> = {
    pending: 0,
    scripting: 10,
    generating_images: 30,
    generating_audio: 55,
    transcribing: 75,
    assembling: 90,
    done: 100,
    error: 0,
  }
  return steps[status] ?? 0
}
