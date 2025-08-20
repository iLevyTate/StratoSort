!macro customInstall
  DetailPrint "Checking for Ollama..."
  nsExec::ExecToStack 'powershell -NoProfile -Command "if (Get-Command ollama -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $0
  StrCmp $0 0 ollamaInstalled
  MessageBox MB_YESNO "Ollama is not installed. Install now?" IDNO skipInstall
  DetailPrint "Installing Ollama via winget"
  nsExec::ExecToLog 'powershell -NoProfile -Command "winget install -e --id Ollama.Ollama"'
ollamaInstalled:
  DetailPrint "Starting Ollama server"
  nsExec::ExecToLog 'powershell -NoProfile -Command "Start-Process ollama -ArgumentList serve -WindowStyle Hidden"'
skipInstall:
!macroend
