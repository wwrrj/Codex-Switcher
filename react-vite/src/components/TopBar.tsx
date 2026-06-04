export default function TopBar() {
  return (
    <header
      data-component="TopBar"
      data-tauri-drag-region
      className="flex items-center h-9 px-4 border-b border-line bg-bg-surface shrink-0 select-none"
    >
      <span
        data-tauri-drag-region
        className="text-sm font-semibold text-fg tracking-tight whitespace-nowrap font-serif"
      >
        Codex Switcher
      </span>

      {/* Right: reserved for Tauri window controls (close / max / min) */}
      <div className="ml-auto w-[120px] shrink-0" data-tauri-drag-region />
    </header>
  )
}
