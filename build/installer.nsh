; StratoSort Custom Installer Hooks
; This file contains custom NSIS code that runs during installation

!macro customInstall
  ; Create a marker file to indicate first run
  FileOpen $0 "$INSTDIR\first-run.marker" w
  FileWrite $0 "This file indicates StratoSort needs to set up AI components on first launch"
  FileClose $0
  
  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\StratoSort"
  CreateShortcut "$SMPROGRAMS\StratoSort\StratoSort.lnk" "$INSTDIR\StratoSort.exe"
  CreateShortcut "$SMPROGRAMS\StratoSort\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  
  ; Create Desktop shortcut is handled by electron-builder's createDesktopShortcut option
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$SMPROGRAMS\StratoSort\StratoSort.lnk"
  Delete "$SMPROGRAMS\StratoSort\Uninstall.lnk"
  RMDir "$SMPROGRAMS\StratoSort"
  
  ; Clean up first-run marker
  Delete "$INSTDIR\first-run.marker"
  
  ; Ask about app data
  MessageBox MB_YESNO "Remove all StratoSort settings and data?" IDNO SkipAppData
    RMDir /r "$APPDATA\StratoSort"
  SkipAppData:
!macroend