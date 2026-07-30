!include "LogicLib.nsh"
!include "x64.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

!define UNINSTALL_MODEL_PATH_FILENAME "uninstall-model-path.txt"
!define MODEL_DIRECTORY_MARKER_FILENAME ".aime-chat-model-directory"

!ifndef BUILD_UNINSTALLER
  Function InstallFilesPageShow
    SetDetailsView show
    SetDetailsPrint both
    DetailPrint "正在解压应用文件，请稍候 / Extracting application files..."
  FunctionEnd

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW InstallFilesPageShow
  !macroend

  !macro EnableInstallDetailsAfterDecompression
    SetDetailsPrint both
    DetailPrint "应用文件已安装，正在检查运行环境 / Application files installed; checking runtimes..."
  !macroend

  !macro customFiles_x64
    !insertmacro EnableInstallDetailsAfterDecompression
  !macroend

  !macro customFiles_ia32
    !insertmacro EnableInstallDetailsAfterDecompression
  !macroend

  !macro customFiles_arm64
    !insertmacro EnableInstallDetailsAfterDecompression
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  Var uninstallCleanupDialog
  Var uninstallRemoveModelsCheckbox
  Var uninstallRemoveAppDataCheckbox
  Var uninstallRemoveModelsState
  Var uninstallRemoveAppDataState
  Var uninstallModelPath
  Var uninstallAppDataPath
  Var uninstallDefaultModelPath
  Var uninstallHasModelMarker
  Var uninstallModelsInsideAppData

  Function un.CleanupOptionsPageCreate
    nsDialogs::Create 1018
    Pop $uninstallCleanupDialog
    ${If} $uninstallCleanupDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Choose whether to remove data created by ${PRODUCT_NAME}. These options are unchecked by default."
    Pop $0

    ${NSD_CreateCheckbox} 0 32u 100% 12u "Remove downloaded local models"
    Pop $uninstallRemoveModelsCheckbox
    ${NSD_SetState} $uninstallRemoveModelsCheckbox ${BST_UNCHECKED}

    ${NSD_CreateLabel} 12u 47u 94% 20u "$uninstallModelPath"
    Pop $0

    ${If} $uninstallHasModelMarker != "1"
      EnableWindow $uninstallRemoveModelsCheckbox 0
      ${NSD_CreateLabel} 12u 66u 94% 18u "Model cleanup is unavailable because the directory could not be verified."
      Pop $0
    ${EndIf}

    ${NSD_CreateCheckbox} 0 88u 100% 12u "Remove application data and settings"
    Pop $uninstallRemoveAppDataCheckbox
    ${NSD_SetState} $uninstallRemoveAppDataCheckbox ${BST_UNCHECKED}
    ${NSD_OnClick} $uninstallRemoveAppDataCheckbox un.AppDataCleanupChanged

    ${NSD_CreateLabel} 12u 103u 94% 20u "$uninstallAppDataPath"
    Pop $0

    ${IfNot} ${FileExists} "$uninstallAppDataPath\*.*"
      EnableWindow $uninstallRemoveAppDataCheckbox 0
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function un.AppDataCleanupChanged
    ${If} $uninstallModelsInsideAppData == "1"
      ${NSD_GetState} $uninstallRemoveAppDataCheckbox $uninstallRemoveAppDataState
      ${If} $uninstallRemoveAppDataState == ${BST_CHECKED}
        ${NSD_SetState} $uninstallRemoveModelsCheckbox ${BST_CHECKED}
        EnableWindow $uninstallRemoveModelsCheckbox 0
      ${Else}
        ${NSD_SetState} $uninstallRemoveModelsCheckbox ${BST_UNCHECKED}
        ${If} $uninstallHasModelMarker == "1"
          EnableWindow $uninstallRemoveModelsCheckbox 1
        ${EndIf}
      ${EndIf}
    ${EndIf}
  FunctionEnd

  Function un.CleanupOptionsPageLeave
    ${NSD_GetState} $uninstallRemoveModelsCheckbox $uninstallRemoveModelsState
    ${NSD_GetState} $uninstallRemoveAppDataCheckbox $uninstallRemoveAppDataState
  FunctionEnd

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.CleanupOptionsPageCreate un.CleanupOptionsPageLeave
  !macroend

  !macro customUnInit
    StrCpy $uninstallRemoveModelsState ${BST_UNCHECKED}
    StrCpy $uninstallRemoveAppDataState ${BST_UNCHECKED}
    StrCpy $uninstallHasModelMarker "0"
    StrCpy $uninstallModelsInsideAppData "0"

    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}

    StrCpy $uninstallAppDataPath "$APPDATA\${APP_FILENAME}"
    StrCpy $uninstallDefaultModelPath "$uninstallAppDataPath\models"
    StrCpy $uninstallModelPath $uninstallDefaultModelPath

    ClearErrors
    FileOpen $0 "$uninstallAppDataPath\${UNINSTALL_MODEL_PATH_FILENAME}" r
    ${IfNot} ${Errors}
      FileReadUTF16LE $0 $1
      FileClose $0
      ${If} $1 != ""
        StrCpy $uninstallModelPath $1
      ${EndIf}
    ${EndIf}

    ${If} ${FileExists} "$uninstallModelPath\${MODEL_DIRECTORY_MARKER_FILENAME}"
      StrCpy $uninstallHasModelMarker "1"
    ${EndIf}

    StrLen $2 $uninstallAppDataPath
    StrCpy $3 $uninstallModelPath $2
    ${If} $3 == $uninstallAppDataPath
      StrCpy $3 $uninstallModelPath 1 $2
      ${If} $3 == "\"
      ${OrIf} $uninstallModelPath == $uninstallAppDataPath
        StrCpy $uninstallModelsInsideAppData "1"
      ${EndIf}
    ${EndIf}

    ${un.GetRoot} "$uninstallModelPath" $2
    ${If} $uninstallModelPath == "$2"
    ${OrIf} $uninstallModelPath == "$2\"
    ${OrIf} $uninstallModelPath == "$PROFILE"
    ${OrIf} $uninstallModelPath == "$APPDATA"
    ${OrIf} $uninstallModelPath == "$LOCALAPPDATA"
    ${OrIf} $uninstallModelPath == "$DESKTOP"
    ${OrIf} $uninstallModelPath == "$DOCUMENTS"
    ${OrIf} $uninstallModelPath == "$WINDIR"
    ${OrIf} $uninstallModelPath == "$PROGRAMFILES"
    ${OrIf} $uninstallModelPath == "$INSTDIR"
      StrCpy $uninstallHasModelMarker "0"
    ${EndIf}

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  !macroend

  !macro customUnInstall
    ${IfNot} ${isUpdated}
      ${If} $uninstallRemoveModelsState == ${BST_CHECKED}
      ${AndIf} $uninstallHasModelMarker == "1"
        DetailPrint "Removing model directory: $uninstallModelPath"
        RMDir /r "$uninstallModelPath"
      ${EndIf}

      ${If} $uninstallRemoveAppDataState == ${BST_CHECKED}
        DetailPrint "Removing application data: $uninstallAppDataPath"
        RMDir /r "$uninstallAppDataPath"
      ${EndIf}
    ${EndIf}
  !macroend
!endif

!macro customHeader
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

!macro CheckVcRedistRegistryInstalled ARCH REG_VIEW RESULT_VAR
  SetRegView ${REG_VIEW}
  ClearErrors
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\${ARCH}" "Installed"

  ${If} ${Errors}
  ${OrIf} $1 != 1
    StrCpy ${RESULT_VAR} 0
  ${Else}
    StrCpy ${RESULT_VAR} 1
  ${EndIf}
!macroend

!macro CheckVcRedistFilesInstalled ARCH RESULT_VAR
  StrCpy ${RESULT_VAR} 0

  ${If} "${ARCH}" == "x64"
    ${If} ${RunningX64}
      ${DisableX64FSRedirection}
      ${If} ${FileExists} "$WINDIR\System32\vcruntime140.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\vcruntime140_1.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\msvcp140.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\concrt140.dll"
        StrCpy ${RESULT_VAR} 1
      ${EndIf}
      ${EnableX64FSRedirection}
    ${EndIf}
  ${Else}
    ${If} ${RunningX64}
      ${If} ${FileExists} "$WINDIR\SysWOW64\vcruntime140.dll"
      ${AndIf} ${FileExists} "$WINDIR\SysWOW64\vcruntime140_1.dll"
      ${AndIf} ${FileExists} "$WINDIR\SysWOW64\msvcp140.dll"
      ${AndIf} ${FileExists} "$WINDIR\SysWOW64\concrt140.dll"
        StrCpy ${RESULT_VAR} 1
      ${EndIf}
    ${Else}
      ${If} ${FileExists} "$WINDIR\System32\vcruntime140.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\vcruntime140_1.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\msvcp140.dll"
      ${AndIf} ${FileExists} "$WINDIR\System32\concrt140.dll"
        StrCpy ${RESULT_VAR} 1
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro CheckVcRedistInstalled ARCH REG_VIEW RESULT_VAR
  !insertmacro CheckVcRedistRegistryInstalled "${ARCH}" "${REG_VIEW}" $3
  !insertmacro CheckVcRedistFilesInstalled "${ARCH}" $4

  ${If} $3 == 1
  ${AndIf} $4 == 1
    StrCpy ${RESULT_VAR} 1
  ${Else}
    StrCpy ${RESULT_VAR} 0
  ${EndIf}
!macroend

!macro InstallVcRedistIfNeeded FILE_NAME DISPLAY_NAME ARCH REG_VIEW
  DetailPrint "Checking ${DISPLAY_NAME}..."
  !insertmacro CheckVcRedistInstalled "${ARCH}" "${REG_VIEW}" $2

  ${If} $2 == 1
    DetailPrint "${DISPLAY_NAME} detected. Skipping bundled installer."
  ${Else}
    DetailPrint "${DISPLAY_NAME} not detected or incomplete. Installing bundled runtime..."
    DetailPrint "Please wait while ${DISPLAY_NAME} is installed..."
    File /oname=$PLUGINSDIR\${FILE_NAME} "${BUILD_RESOURCES_DIR}\windows-redist\${FILE_NAME}"
    nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-vc-redist.ps1" -InstallerPath "$PLUGINSDIR\${FILE_NAME}"`
    Pop $0
    Pop $1
    ${If} $1 != ""
      DetailPrint "$1"
    ${EndIf}
    DetailPrint "${DISPLAY_NAME} installer finished with exit code $0."

    ${If} $0 <> 0
    ${AndIf} $0 <> 1638
    ${AndIf} $0 <> 1641
    ${AndIf} $0 <> 3010
      DetailPrint "${DISPLAY_NAME} installation failed with exit code $0."
      Abort
    ${EndIf}

    DetailPrint "Verifying ${DISPLAY_NAME} after bundled installer..."
    !insertmacro CheckVcRedistInstalled "${ARCH}" "${REG_VIEW}" $2
    ${If} $2 != 1
      DetailPrint "${DISPLAY_NAME} installation finished, but the required runtime files were not found."
      Abort
    ${EndIf}
  ${EndIf}
!macroend
!macro InstallNode22IfNeeded
  ${If} ${RunningX64}
    DetailPrint "Checking Node.js..."
    nsExec::ExecToStack `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'SilentlyContinue'; $$version = (& node -v) 2>$$null; if ($$LASTEXITCODE -eq 0 -and $$version) { exit 0 } exit 1"`
    Pop $0
    Pop $1

    ${If} $0 == 0
      DetailPrint "Node.js detected. Skipping Node.js 22 installer."
    ${Else}
      DetailPrint "Node.js not detected. Attempting silent install..."
      DetailPrint "Downloading Node.js 22 (network timeout: 20 seconds)..."
      nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-node.ps1" -Version "22.22.2" -DownloadTimeoutSeconds 20`
      Pop $0
      Pop $1
      ${If} $1 != ""
        DetailPrint "$1"
      ${EndIf}

      ${If} $0 == 0
        DetailPrint "Node.js 22 installed successfully."
      ${ElseIf} $0 == 2
        DetailPrint "Node.js is unavailable (possibly offline). Skipping optional Node.js installation."
      ${Else}
        DetailPrint "Node.js 22 download or installation failed with exit code $0. Skipping."
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "Node.js 22 x64 installer requires 64-bit Windows. Skipping."
  ${EndIf}
!macroend

!macro customInstall
  SetDetailsView show
  DetailPrint "Preparing ${PRODUCT_NAME} prerequisites..."

  ${ifNot} ${isUpdated}
    File /oname=$PLUGINSDIR\install-vc-redist.ps1 "${BUILD_RESOURCES_DIR}\installer\install-vc-redist.ps1"
    File /oname=$PLUGINSDIR\install-node.ps1 "${BUILD_RESOURCES_DIR}\installer\install-node.ps1"

    ${If} ${RunningX64}
      !insertmacro InstallVcRedistIfNeeded "vc_redist.x64.exe" "Microsoft Visual C++ Runtime (x64)" "x64" 64
    ${Else}
      !insertmacro InstallVcRedistIfNeeded "vc_redist.x86.exe" "Microsoft Visual C++ Runtime (x86)" "x86" 32
    ${EndIf}

    !insertmacro InstallNode22IfNeeded
  ${else}
    DetailPrint "Application update detected. Skipping prerequisite installation."
  ${endIf}
!macroend
