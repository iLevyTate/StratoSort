; StratoSort NSIS entry for electron-builder
; This file delegates to the complete installer logic which:
; - Closes running instances of StratoSort
; - Installs Ollama silently if missing
; - Starts Ollama and pulls essential models in the background
; - Writes basic installation metadata
; The complete installer aligns with the app's JavaScript-native vector store
; (no Python/ChromaDB dependency) and pulls the base models used by defaults.

!include "installer-complete.nsh"


