!include "FileFunc.nsh"

!define NX_PRESERVE_ROOT "$PLUGINSDIR\preserve"
!define NX_PRESERVE_PLUGIN_DIR "${NX_PRESERVE_ROOT}\plugins"

!ifdef BUILD_UNINSTALLER
Var PreserveHasPluginScripts

Function un.StagePluginScripts
  StrCpy $PreserveHasPluginScripts "0"

  IfFileExists "$INSTDIR\resources\plugins\*.*" 0 done

  RMDir /r "${NX_PRESERVE_PLUGIN_DIR}"
  CreateDirectory "${NX_PRESERVE_PLUGIN_DIR}"

  FindFirst $0 $1 "$INSTDIR\resources\plugins\*.*"
loop:
  StrCmp $1 "" finish
  StrCmp $1 "." next
  StrCmp $1 ".." next
  IfFileExists "$INSTDIR\resources\plugins\$1\*.*" next
  ${GetFileExt} "$1" $2
  StrCmp $2 "example" next

  CopyFiles /SILENT "$INSTDIR\resources\plugins\$1" "${NX_PRESERVE_PLUGIN_DIR}"
  StrCpy $PreserveHasPluginScripts "1"

next:
  FindNext $0 $1
  Goto loop

finish:
  FindClose $0
  StrCmp $PreserveHasPluginScripts "1" done
  RMDir /r "${NX_PRESERVE_PLUGIN_DIR}"
  RMDir /r "${NX_PRESERVE_ROOT}"

done:
FunctionEnd

Function un.CleanupEmptyUserConfigDirs
  IfFileExists "$PROFILE\.nxsoftconfig\*.*" done
  RMDir /r "$PROFILE\.nxsoftconfig"

done:
FunctionEnd

Function un.CleanupEmptyInstallDirs
  RMDir "$INSTDIR\resources\plugins"
  RMDir "$INSTDIR\resources"
  RMDir "$INSTDIR"
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
!macro customUnInstall
  Call un.CleanupEmptyUserConfigDirs
!macroend

!macro customRemoveFiles
  Call un.StagePluginScripts

  SetOutPath $TEMP
  RMDir /r $INSTDIR

  ${if} $PreserveHasPluginScripts == "1"
    CreateDirectory "$INSTDIR\resources\plugins"
    CopyFiles /SILENT "${NX_PRESERVE_PLUGIN_DIR}\*.*" "$INSTDIR\resources\plugins"
    RMDir /r "${NX_PRESERVE_PLUGIN_DIR}"
    RMDir /r "${NX_PRESERVE_ROOT}"
  ${endif}

  Call un.CleanupEmptyInstallDirs
!macroend
!endif
