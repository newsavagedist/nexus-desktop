import { createContext, useContext } from "react"

export interface Artifact {
  content: string
  lang: string
  streaming?: boolean
}

interface ArtifactCtx {
  artifact: Artifact | null
  openArtifact: (content: string, lang: string) => void
  closeArtifact: () => void
}

export const ArtifactContext = createContext<ArtifactCtx>({
  artifact: null,
  openArtifact: () => {},
  closeArtifact: () => {},
})

export const useArtifact = () => useContext(ArtifactContext)
