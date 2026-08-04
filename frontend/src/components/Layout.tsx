import { Outlet, NavLink } from 'react-router-dom'
import { Film, Settings, Home } from 'lucide-react'
import { cn } from '../lib/utils'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-6 gap-6 bg-[#12121a] border-r border-[#2a2a3d] shrink-0">
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7c6fcd] to-[#e8a045] flex items-center justify-center shadow-lg">
          <Film size={18} className="text-white" />
        </div>

        <nav className="flex flex-col gap-2 mt-4">
          <SidebarLink to="/" icon={<Home size={20} />} label="Dashboard" />
          <SidebarLink to="/settings" icon={<Settings size={20} />} label="Settings" />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function SidebarLink({
  to, icon, label
}: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative',
          isActive
            ? 'bg-[#7c6fcd] text-white shadow-lg shadow-[#7c6fcd]/30'
            : 'text-[#8888a8] hover:bg-[#2a2a3d] hover:text-white'
        )
      }
    >
      {icon}
      {/* Tooltip */}
      <span className="absolute left-14 bg-[#1a1a26] border border-[#2a2a3d] text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
        {label}
      </span>
    </NavLink>
  )
}
