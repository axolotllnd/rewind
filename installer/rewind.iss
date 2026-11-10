#ifndef AppVersion
  #error AppVersion must be passed by scripts/installer.cjs
#endif
#define AppName "REWIND"
#define Root ".."
#ifdef UpdateFrom
  #define UpdateBaseLabel UpdateFrom
#else
  #define UpdateBaseLabel AppVersion
#endif

[Setup]
#ifdef TestBuild
AppId={{1F95F426-5287-4D92-98C7-FE1177864D65}
#else
AppId={{0CDFAB55-C5C0-43CF-A8B4-61B1F228C69A}
#endif
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName=REWIND {#AppVersion}
AppPublisher=axolotllnd
AppPublisherURL=https://github.com/axolotllnd
AppSupportURL=https://t.me/axolotllnd
AppUpdatesURL=https://github.com/axolotllnd/rewind/releases
DefaultDirName={localappdata}\Programs\REWIND
DefaultGroupName=REWIND
DisableProgramGroupPage=yes
#ifdef UpdateFrom
DisableDirPage=yes
#else
DisableDirPage=no
#endif
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
#ifdef TestBuild
OutputDir={#Root}\work\installer-regression
#else
OutputDir={#Root}\outputs
#endif
#ifdef UpdateFrom
#ifdef AudioRepair
OutputBaseFilename=REWIND-{#AppVersion}-Audio-Fix
#else
OutputBaseFilename=REWIND-{#UpdateFrom}-to-{#AppVersion}-Update
#endif
#else
OutputBaseFilename=REWIND-{#AppVersion}-Setup
#endif
UninstallLogMode=append
#ifdef VerifyDelta
CreateUninstallRegKey=no
#endif
SetupIconFile={#Root}\assets\icon.ico
UninstallDisplayIcon={app}\resources\app\assets\icon.ico
UninstallDisplayName=REWIND
WizardStyle=modern dark includetitlebar hidebevels
WizardBackColor=#111111
WizardImageBackColor=#111111
WizardSmallImageBackColor=#111111
WizardImageFile={#Root}\installer\wizard.png
WizardSmallImageFile={#Root}\installer\wizard-small.png
WizardSizePercent=112,112
Compression=lzma2/fast
SolidCompression=yes
LZMAUseSeparateProcess=yes
CloseApplications=no
RestartApplications=no
SetupLogging=yes
VersionInfoCompany=axolotllnd
VersionInfoDescription=REWIND Installer
VersionInfoProductName=REWIND
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
russian.WelcomeLabel1=Твои моменты.%nТвои правила.
russian.WelcomeLabel2=Установим REWIND на твой компьютер.%n%nМгновенные повторы, запись и редактор клипов — в одном приложении.%n%nНажми «Далее», чтобы выбрать папку установки.
russian.FinishedHeadingLabel=Всё готово к записи.
russian.FinishedLabel=REWIND установлен на твой компьютер.%n%nВыбери экран или игру, включи повтор и сохрани лучший момент по Alt + F10.%n%nКлипы по умолчанию: Видео\REWIND. Папку можно изменить в настройках.
russian.DesktopShortcut=Создать ярлык на рабочем столе
russian.LaunchRewind=Запустить REWIND
russian.CloseRewind=REWIND работает из этой папки. Заверши запись и выбери «Выход» в меню значка REWIND рядом с часами. Затем повтори установку.
russian.CloseBeforeUninstall=Перед удалением заверши запись и закрой REWIND через «Выход» в меню значка рядом с часами. Клипы и настройки сохранятся.
russian.WrongUpdateBase=Это обновление подходит только для установленной REWIND {#UpdateBaseLabel} с исходными файлами. Скачай полный установщик на странице релиза, чтобы восстановить файлы или обновить другую версию.
english.WelcomeLabel1=Your moments.%nYour rules.
english.WelcomeLabel2=Let’s install REWIND on your computer.%n%nInstant replay, recording and a clip editor — in one app.%n%nChoose Next to select an installation folder.
english.FinishedHeadingLabel=Ready when you are.
english.FinishedLabel=REWIND is installed.%n%nChoose a screen or game, enable replay and save your best moments with Alt + F10.%n%nDefault clips folder: Videos\REWIND. Change it in Settings at any time.
english.DesktopShortcut=Create a desktop shortcut
english.LaunchRewind=Launch REWIND
english.CloseRewind=REWIND is running from this folder. Finish recording and choose Quit from the REWIND tray menu next to the clock, then try again.
english.CloseBeforeUninstall=Finish recording and quit REWIND from its tray menu before uninstalling. Your clips and settings will be kept.
english.WrongUpdateBase=This update requires an installed copy of REWIND {#UpdateBaseLabel} with its original files. Download the full installer from the release page to repair or update a different version.

#ifndef UpdateFrom
#ifndef VerifyDelta
[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; Flags: unchecked
#endif
#endif

[Files]
#ifdef UpdateFrom
#include UpdateFiles
#else
Source: "{#Root}\outputs\REWIND-{#AppVersion}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "data\*,data"
#endif
#ifndef AudioRepair
Source: "installed.json"; DestDir: "{app}\resources"; Flags: ignoreversion
#endif

#ifndef UpdateFrom
#ifndef VerifyDelta
[Icons]
Name: "{group}\REWIND"; Filename: "{app}\REWIND.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\assets\icon.ico"; AppUserModelID: "local.rewind.recorder"
Name: "{autodesktop}\REWIND"; Filename: "{app}\REWIND.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\assets\icon.ico"; AppUserModelID: "local.rewind.recorder"; Tasks: desktopicon
#endif
#endif

#ifndef VerifyDelta
[Run]
Filename: "{app}\REWIND.exe"; Description: "{cm:LaunchRewind}"; Flags: nowait postinstall skipifsilent; Check: not IsAppUpdate
Filename: "{app}\REWIND.exe"; Flags: nowait; Check: IsAppUpdate
#endif

[Registry]
#ifndef TestBuild
Root: HKCU; Subkey: "Software\REWIND"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"; Flags: uninsdeletekeyifempty uninsdeletevalue
; Remove the optional startup entry on uninstall; user settings and recordings stay intact.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "REWIND"; Flags: dontcreatekey uninsdeletevalue

#endif

[Code]
function CreateFileForCheck(lpFileName: String; dwDesiredAccess, dwShareMode, lpSecurityAttributes, dwCreationDisposition, dwFlagsAndAttributes: LongWord; hTemplateFile: THandle): THandle; external 'CreateFileW@kernel32.dll stdcall';
function CloseFileCheck(hObject: THandle): Boolean; external 'CloseHandle@kernel32.dll stdcall';
function PackageFileAttributes(FileName: String): LongWord; external 'GetFileAttributesW@kernel32.dll stdcall';

function IsAppUpdate(): Boolean;
begin
#ifdef UpdateFrom
  Result := True;
#else
  Result := ExpandConstant('{param:REWINDUPDATE|0}') = '1';
#endif
end;

function SafePackagePath(const RelativePath: String): Boolean;
var Root, Current: String; Attributes: LongWord;
begin
  Root := RemoveBackslashUnlessRoot(ExpandConstant('{app}'));
  Current := AddBackslash(Root) + RelativePath;
  Result := False;
  repeat
    Attributes := PackageFileAttributes(Current);
    if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then Exit;
    if CompareText(Current, Root) = 0 then begin
      Result := True;
      Exit;
    end;
    Current := ExtractFileDir(Current);
  until Length(Current) < Length(Root);
end;

function PackageFileMatches(const RelativePath, Hash: String): Boolean;
var FileName: String;
begin
  Result := False;
  if not SafePackagePath(RelativePath) then Exit;
  FileName := ExpandConstant('{app}\') + RelativePath;
  if not FileExists(FileName) then Exit;
  try
    Result := CompareText(GetSHA256OfFile(FileName), Hash) = 0;
  except
    Log('Cannot verify package file: ' + RelativePath);
  end;
end;

procedure RemoveObsoleteFile(const RelativePath, Hash: String);
begin
  if PackageFileMatches(RelativePath, Hash) then
    if not DeleteFile(ExpandConstant('{app}\') + RelativePath) then
      Log('Could not remove obsolete package file: ' + RelativePath);
end;

#ifdef UpdateFrom
#include UpdateChecks
#endif
#ifdef CleanupScript
#include CleanupScript

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then RemoveObsoleteFiles();
end;
#endif

procedure InitializeWizard();
begin
  WizardForm.WelcomeLabel1.Caption := CustomMessage('WelcomeLabel1');
  WizardForm.WelcomeLabel2.Caption := CustomMessage('WelcomeLabel2');
  WizardForm.FinishedHeadingLabel.Caption := CustomMessage('FinishedHeadingLabel');
  WizardForm.FinishedLabel.Caption := CustomMessage('FinishedLabel');
  WizardForm.BeveledLabel.Caption := 'AXOLOTLLND / REWIND';
end;

function IsRewindRunning(const ExePath: String): Boolean;
var Locator, Services, Processes, Process: Variant; I: Integer; Handle: THandle;
begin
  Result := False;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT ExecutablePath FROM Win32_Process WHERE Name = ''REWIND.exe''');
    for I := 0 to Processes.Count - 1 do begin
      Process := Processes.ItemIndex(I);
      if VarIsNull(Process.ExecutablePath) then Result := True
      else if CompareText(Process.ExecutablePath, ExePath) = 0 then Result := True;
    end;
  except
    if FileExists(ExePath) then begin
      Handle := CreateFileForCheck(ExePath, $80000000, 0, 0, 3, $80, 0);
      Result := Handle = THandle(-1);
      if not Result then CloseFileCheck(Handle);
    end;
  end;
end;

procedure WaitForAppHandoff();
var I: Integer;
begin
  if IsAppUpdate() or (ExpandConstant('{param:REWINDREMOVE|0}') = '1') then begin
    for I := 1 to 100 do begin
      if not IsRewindRunning(ExpandConstant('{app}\REWIND.exe')) then Exit;
      Sleep(100);
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
#if Defined(UpdateFrom) && !Defined(VerifyDelta)
var InstalledDir: String;
#endif
begin
  Result := '';
  WaitForAppHandoff();
  if IsRewindRunning(ExpandConstant('{app}\REWIND.exe')) then begin
    Result := CustomMessage('CloseRewind');
    Exit;
  end;
#ifdef UpdateFrom
#ifndef VerifyDelta
  if not RegQueryStringValue(HKCU, 'Software\REWIND', 'InstallDir', InstalledDir) or
     (CompareText(RemoveBackslashUnlessRoot(InstalledDir), RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) <> 0) then begin
    Result := CustomMessage('WrongUpdateBase');
    Exit;
  end;
#endif
  if not FileExists(ExpandConstant('{app}\resources\installed.json')) or
     not SafePackagePath('resources\installed.json') or not VerifyUpdateBase() then
    Result := CustomMessage('WrongUpdateBase');
#endif
end;

function InitializeUninstall(): Boolean;
begin
  WaitForAppHandoff();
  Result := not IsRewindRunning(ExpandConstant('{app}\REWIND.exe'));
  if not Result then MsgBox(CustomMessage('CloseBeforeUninstall'), mbInformation, MB_OK);
end;
