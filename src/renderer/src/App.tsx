import { useState, useEffect, useRef } from "react"
import type { PermissionRequest } from "./types"
import type { Page } from "./constants"
import { DEFAULT_THEME_COLOR, THEME_STORAGE_KEY, COLOR_MODE_KEY } from "./constants"
import ChatPage from "./pages/ChatPage"
import SettingsPage from "./pages/SettingsPage"
import AnalyticsPage from "./pages/AnalyticsPage"
import PermissionModal from "./components/PermissionModal"

export default function App() {
  const [page, setPage] = useState<Page>("chat")
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_COLOR)
  const [colorMode, setColorMode] = useState<"dark" | "light">(() => (localStorage.getItem(COLOR_MODE_KEY) as "dark" | "light") || "dark")
  const [permReq, setPermReq] = useState<PermissionRequest | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty("--theme-primary", themeColor)
    localStorage.setItem(THEME_STORAGE_KEY, themeColor)
  }, [themeColor])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", colorMode)
    localStorage.setItem(COLOR_MODE_KEY, colorMode)
  }, [colorMode])

  useEffect(() => {
    const nexus = (window as any).nexus
    if (nexus?.permissions?.onRequest) {
      cleanupRef.current = nexus.permissions.onRequest((data: PermissionRequest) => {
        setPermReq(data)
      })
    }
    return () => cleanupRef.current?.()
  }, [])

  const handlePermission = (req: PermissionRequest, granted: boolean) => {
    const nexus = (window as any).nexus
    nexus?.permissions?.respond?.(req.id, granted)
    setPermReq(null)
  }

  const permModal = permReq ? (
    <PermissionModal reqs={[permReq]} onRespond={handlePermission} />
  ) : null

  if (page === "settings") return (
    <>
      {permModal}
      <SettingsPage themeColor={themeColor} setThemeColor={setThemeColor} onNavigate={setPage} />
    </>
  )

  if (page === "analytics") return (
    <>
      {permModal}
      <AnalyticsPage onNavigate={setPage} />
    </>
  )

  return (
    <>
      {permModal}
      <ChatPage onNavigate={setPage} colorMode={colorMode} setColorMode={setColorMode} />
    </>
  )
}
