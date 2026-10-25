; Fast POS — Inno Setup 6+ script
; Build with: npm run installer:build
; The build script passes /DPayloadRoot and /DAppVersion.

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef PayloadRoot
  #define PayloadRoot "..\build\installer-payload"
#endif

[Setup]
AppId={{8F1B3C2A-7D4E-4A91-9C6B-2E5F0A1D9C73}
AppName=Fast POS
AppVersion={#AppVersion}
AppPublisher=Fast POS
AppPublisherURL=http://localhost:3000
DefaultDirName={autopf}\Fast POS
DefaultGroupName=Fast POS
DisableProgramGroupPage=yes
OutputDir=..\release\installer
OutputBaseFilename=Fast-POS-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=admin
ChangesEnvironment=yes
CloseApplications=no
RestartApplications=no
SetupLogging=yes
WizardStyle=modern
ShowLanguageDialog=no
SetupIconFile=app_icon.ico
UninstallDisplayIcon={app}\FastPOS.ico
VersionInfoVersion=0.1.0.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "إنشاء أيقونة على سطح المكتب | Create a desktop shortcut"; GroupDescription: "اختصارات | Shortcuts"

[Files]
Source: "{#PayloadRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "app_icon.ico"; DestDir: "{app}"; DestName: "FastPOS.ico"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{app}\app_icon.ico"

[Icons]
Name: "{group}\Fast POS"; Filename: "{app}\bin\fast-pos-open.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\FastPOS.ico"
Name: "{group}\Fast POS Console"; Filename: "{app}\bin\fast-pos-console.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\FastPOS.ico"
Name: "{group}\Fast POS README"; Filename: "{app}\README-FIRST.txt"
Name: "{autodesktop}\Fast POS"; Filename: "{app}\bin\fast-pos-open.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\FastPOS.ico"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Check: NeedsAddPath('{app}\bin'); Flags: preservestringtype

[Run]
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Fast POS"" dir=in action=allow protocol=TCP localport=3000"; Flags: runhidden waituntilterminated; StatusMsg: "إضافة قاعدة جدار الحماية..."
Filename: "{app}\bin\fast-pos-install-service.cmd"; Flags: runhidden waituntilterminated; StatusMsg: "تثبيت خدمة Fast POS..."
Filename: "{app}\bin\fast-pos-open.cmd"; Description: "تشغيل Fast POS الآن | Launch Fast POS now"; Flags: postinstall nowait skipifsilent; StatusMsg: "فتح Fast POS..."
Filename: "notepad.exe"; Parameters: """{app}\README-FIRST.txt"""; Description: "عرض بيانات الدخول وتعليمات التشغيل"; Flags: postinstall nowait skipifsilent unchecked

[UninstallRun]
Filename: "{app}\FastPOS-service.exe"; Parameters: "uninstall"; RunOnceId: "RemoveFastPosService"; Flags: runhidden waituntilterminated
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Fast POS"""; RunOnceId: "RemoveFastPosFirewall"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: dirifempty; Name: "{app}\server"
Type: dirifempty; Name: "{app}"

[Code]
var
  ModePage: TInputOptionWizardPage;
  ExistingInstall: Boolean;
  DeleteData: Boolean;

function WantsDataDeletion: Boolean;
var
  I: Integer;
  Param: String;
begin
  Result := False;
  for I := 1 to ParamCount do
  begin
    Param := Uppercase(ParamStr(I));
    if (Param = '/DELETEUSERDATA') or (Param = '/DELETEUSERDATA=1') or
       (Param = '/DELETEUSERDATA=YES') then
    begin
      Result := True;
      exit;
    end;
  end;
end;

function InitializeUninstall: Boolean;
begin
  Result := True;
  DeleteData := WantsDataDeletion;
  if not DeleteData and not UninstallSilent then
    DeleteData := MsgBox(
      'هل تريد أيضاً حذف بيانات النظام؟' + #13#10 +
      'سيتم حذف قاعدة البيانات والإعدادات نهائياً ولا يمكن استعادتها.' + #13#10#13#10 +
      'Also delete the database and settings?' + #13#10 +
      'This permanently removes all saved data and cannot be undone.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

function NeedsAddPath(Param: string): Boolean;
var
  PathValue: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', PathValue) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(PathValue) + ';') = 0;
end;

procedure StopFastPosService;
var
  ResultCode: Integer;
  ServiceExe: String;
begin
  ServiceExe := ExpandConstant('{app}\FastPOS-service.exe');
  if FileExists(ServiceExe) then
    Exec(ServiceExe, 'stop', ExpandConstant('{app}'), SW_HIDE,
      ewWaitUntilTerminated, ResultCode);
end;

function DeleteRuntimeData: Boolean;
var
  Attempt: Integer;
  DataDir: String;
begin
  DataDir := ExpandConstant('{app}\server\data');
  for Attempt := 1 to 10 do
  begin
    if DirExists(DataDir) then
      DelTree(DataDir, True, True, True);
    if not DirExists(DataDir) then
    begin
      Result := True;
      exit;
    end;
    Sleep(500);
  end;
  Result := False;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  PathValue: string;
  BinDir: string;
  P: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    { Stop before touching data: the service keeps the SQLite files open. }
    StopFastPosService;
    { Delete now, before the uninstall log runs, so Inno can remove the
      emptied server and application directories afterwards. }
    if DeleteData then
      DeleteRuntimeData;
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    BinDir := ExpandConstant('{app}\bin');
    if RegQueryStringValue(HKEY_LOCAL_MACHINE,
      'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'Path', PathValue) then
    begin
      P := Pos(';' + Uppercase(BinDir) + ';', ';' + Uppercase(PathValue) + ';');
      { Remove ";bin" mid/end, or "bin;" when it is the first entry. }
      if P = 1 then
        Delete(PathValue, 1, Length(BinDir) + 1)
      else if P > 1 then
        Delete(PathValue, P - 1, Length(BinDir) + 1);
      RegWriteExpandStringValue(HKEY_LOCAL_MACHINE,
        'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
        'Path', PathValue);
    end;

    if DeleteData then
    begin
      DeleteRuntimeData;
      RemoveDir(ExpandConstant('{app}\server'));
      RemoveDir(ExpandConstant('{app}'));
    end;
  end;
end;

function DetectExistingInstall: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\server\data\deployment.json')) or
    FileExists(ExpandConstant('{app}\server\data\pos.db'));
end;

procedure InitializeWizard;
begin
  ModePage := CreateInputOptionPage(wpSelectDir,
    'وضع التشغيل | Deployment mode',
    'اختر طريقة استخدام النظام',
    'مطعم كامل: طاولات + كافيه + سفرادجي. كاونتر: بيع سريع فقط بدون طاولات.' + #13#10 +
    'لا يمكن تغيير الوضع بعد التثبيت إلا بإعادة التثبيت.',
    True, False);
  ModePage.Add('مطعم كامل مع طاولات وكافيه | Full restaurant with tables and cafe');
  ModePage.Add('مطعم كاونتر بسيط — بدون طاولات | Counter-only restaurant, no tables');
  ModePage.Values[0] := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
    ExistingInstall := DetectExistingInstall;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = ModePage.ID) and ExistingInstall;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  ServiceExe: string;
begin
  Result := '';
  ExistingInstall := DetectExistingInstall;
  if ExistingInstall then
  begin
    ServiceExe := ExpandConstant('{app}\FastPOS-service.exe');
    if FileExists(ServiceExe) then
      Exec(ServiceExe, 'stop', ExpandConstant('{app}'), SW_HIDE,
        ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataDir: string;
  Mode: string;
begin
  if CurStep = ssInstall then
  begin
    DataDir := ExpandConstant('{app}\server\data');
    ForceDirectories(DataDir);
    { Never overwrite an existing install's mode — deployment.json is part of data. }
    if not FileExists(DataDir + '\deployment.json') then
    begin
      if ModePage.Values[1] then
        Mode := 'counter'
      else
        Mode := 'full';
      SaveStringToFile(DataDir + '\deployment.json', '{"mode":"' + Mode + '"}', False);
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption :=
      'تم تثبيت Fast POS بنجاح.' + #13#10#13#10 +
      'لوحة الإدارة: admin / 123 — غيّر كلمة المرور فوراً.' + #13#10 +
      'رمز الكاشير: 2580' + #13#10 +
      'من أي جهاز على الشبكة: http://<IP-الخادم>:3000';
  end;
end;
