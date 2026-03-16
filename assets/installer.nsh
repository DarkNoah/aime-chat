!include "LogicLib.nsh"
!include "x64.nsh"

!macro CheckVcRedistInstalled ARCH REG_VIEW RESULT_VAR
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

!macro InstallVcRedistIfNeeded FILE_NAME DISPLAY_NAME ARCH REG_VIEW
  DetailPrint "Checking ${DISPLAY_NAME}..."
  !insertmacro CheckVcRedistInstalled "${ARCH}" "${REG_VIEW}" $2

  ${If} $2 == 1
    DetailPrint "${DISPLAY_NAME} detected. Skipping bundled installer."
  ${Else}
    DetailPrint "${DISPLAY_NAME} not detected. Installing bundled runtime..."
    File /oname=$PLUGINSDIR\${FILE_NAME} "${BUILD_RESOURCES_DIR}\windows-redist\${FILE_NAME}"
    ExecWait '"$PLUGINSDIR\${FILE_NAME}" /install /quiet /norestart' $0

    ${If} $0 <> 0
    ${AndIf} $0 <> 1638
    ${AndIf} $0 <> 1641
    ${AndIf} $0 <> 3010
      MessageBox MB_ICONSTOP|MB_OK "${DISPLAY_NAME} installation failed with exit code $0."
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ${ifNot} ${isUpdated}
    ; x86 runtime is needed for 32-bit builds, and is also safe to install on 64-bit Windows.
    !insertmacro InstallVcRedistIfNeeded "vc_redist.x86.exe" "Microsoft Visual C++ Runtime (x86)" "x86" 32

    ${If} ${RunningX64}
      !insertmacro InstallVcRedistIfNeeded "vc_redist.x64.exe" "Microsoft Visual C++ Runtime (x64)" "x64" 64
    ${EndIf}
  ${endIf}
!macroend
