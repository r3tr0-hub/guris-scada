param([string]$AppDir = '')

# Guris SCADA 0.1 dependency diagnostics. Windows PowerShell 2.0+ syntax.
# Does not start SCADA or Edge, send ADS commands, install software or alter settings.
$ErrorActionPreference = 'Stop'
$script:failures = 0
$script:warnings = 0
$script:writer = $null
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($AppDir)) { $AppDir = $scriptDir }
try { $AppDir = [IO.Path]::GetFullPath($AppDir) } catch { $AppDir = $scriptDir }
if (!(Test-Path -LiteralPath (Join-Path $AppDir 'GurisSCADA_0_1.exe'))) {
    $nested = Join-Path $AppDir 'GurisSCADA_0_1'
    if (Test-Path -LiteralPath (Join-Path $nested 'GurisSCADA_0_1.exe')) { $AppDir = $nested }
}
$reportName = 'SCADA_Diagnostics_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + $PID + '.txt'
$reportPath = ''
foreach ($dir in @($scriptDir, $env:TEMP)) {
    if ([string]::IsNullOrEmpty($dir)) { continue }
    $candidate = Join-Path $dir $reportName
    try {
        $enc = New-Object System.Text.UTF8Encoding($true)
        $script:writer = New-Object System.IO.StreamWriter($candidate, $false, $enc)
        $script:writer.AutoFlush = $true
        $reportPath = $candidate
        break
    } catch { }
}
if ($null -eq $script:writer) { Write-Host 'Cannot create report. Copy diagnostics to a writable folder.'; exit 1 }

function Write-Report([string]$Level, [string]$Message) {
    # Do not include the private local UI session token in error messages.
    $Message = [regex]::Replace($Message, '([?&]k=)[a-fA-F0-9]{64}', '$1<redacted>')
    if ($Level -eq 'FAIL') { $script:failures++ }
    if ($Level -eq 'WARN') { $script:warnings++ }
    $line = '[' + $Level + '] ' + $Message
    $script:writer.WriteLine($line)
    Write-Host $line
}
function Section([string]$Title) { Write-Report 'INFO' ("`r`n--- " + $Title + ' ---') }
function Get-Sha256([string]$Path) {
    $stream = $null; $sha = $null
    try {
        $stream = [IO.File]::OpenRead($Path)
        $sha = [Security.Cryptography.SHA256]::Create()
        return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        if ($null -ne $stream) { $stream.Close() }
        if ($null -ne $sha) { $sha.Dispose() }
    }
}
function Test-WriteFolder([string]$Path) {
    $probe = Join-Path $Path ('SCADA_write_probe_' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $stream = $null
    try {
        $stream = [IO.File]::Open($probe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $stream.WriteByte(0)
        $stream.Close(); $stream = $null
        return $true
    } finally {
        if ($null -ne $stream) { $stream.Close() }
        if ([IO.File]::Exists($probe)) { [IO.File]::Delete($probe) }
    }
}
function Test-Tcp([string]$Address, [int]$Port, [int]$Timeout = 3000) {
    $client = New-Object System.Net.Sockets.TcpClient([Net.Sockets.AddressFamily]::InterNetwork)
    $async = $null
    try {
        $async = $client.BeginConnect($Address, $Port, $null, $null)
        if (!$async.AsyncWaitHandle.WaitOne($Timeout, $false)) { throw 'Тайм-аут подключения' }
        $client.EndConnect($async)
        return @{ Ok = $true; LocalIP = $client.Client.LocalEndPoint.Address.ToString(); Error = '' }
    } catch { return @{ Ok = $false; LocalIP = ''; Error = $_.Exception.Message } }
    finally {
        $client.Close()
        if ($null -ne $async) { $async.AsyncWaitHandle.Close() }
    }
}
function Get-SystemObjects([string]$ClassName, [string]$Filter = '') {
    if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
        if ($Filter) { Get-CimInstance -ClassName $ClassName -Filter $Filter -ErrorAction Stop }
        else { Get-CimInstance -ClassName $ClassName -ErrorAction Stop }
    } else {
        if ($Filter) { Get-WmiObject -Class $ClassName -Filter $Filter -ErrorAction Stop }
        else { Get-WmiObject -Class $ClassName -ErrorAction Stop }
    }
}

try {
    Write-Report 'INFO' 'Guris SCADA 0.1.24 — диагностика запуска, версия проверки 1.19'
    Write-Report 'INFO' ('Время: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    Write-Report 'INFO' ('Компьютер: ' + $env:COMPUTERNAME)
    Write-Report 'INFO' ('Папка SCADA: ' + $AppDir)
    Write-Report 'INFO' ('Отчёт: ' + $reportPath)
    Write-Report 'INFO' 'Проверка не запускает SCADA, не отправляет команды ADS и не меняет настройки Windows.'

    Section 'Windows и архитектура'
    $nativeArch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $nativeArch = $env:PROCESSOR_ARCHITEW6432 }
    Write-Report 'INFO' ('Архитектура ОС: ' + $nativeArch + '; PowerShell: ' + ([IntPtr]::Size * 8) + ' бит; версия: ' + $PSVersionTable.PSVersion)
    if ($nativeArch -eq 'x86') {
        Write-Report 'FAIL' 'Установлена 32-битная Windows: текущий EXE x64 на ней не запустится.'
    } elseif ($nativeArch -ne 'AMD64') {
        Write-Report 'WARN' 'Сборка рассчитана на Windows x64 (AMD64); эта архитектура не проверялась.'
    } else { Write-Report 'OK' 'Архитектура ОС подходит для EXE x64.' }
    if (($nativeArch -eq 'AMD64') -and ([IntPtr]::Size -ne 8)) {
        Write-Report 'WARN' 'Проверка запущена в PowerShell x86. Для проверки DLL x64 запустите Run_SCADA_Check.cmd.'
    }
    try {
        $os = Get-SystemObjects 'Win32_OperatingSystem'
        Write-Report 'INFO' ('ОС: ' + $os.Caption + '; версия ' + $os.Version + '; сборка ' + $os.BuildNumber + '; ' + $os.OSArchitecture)
    } catch { Write-Report 'INFO' ('Сведения WMI недоступны: ' + $_.Exception.Message) }
    try {
        $win = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
        $build = [int]$win.CurrentBuildNumber
        Write-Report 'INFO' ('Реестр ОС: ' + $win.ProductName + '; EditionID=' + $win.EditionID + '; Build=' + $build + '; DisplayVersion=' + $win.DisplayVersion)
        if ($build -lt 10240) { Write-Report 'FAIL' 'Эта версия SCADA рассчитана на Windows 10/11 x64. Более старая Windows не поддерживается сборкой.' }
        else { Write-Report 'OK' 'Версия Windows соответствует целевой ОС сборки.' }
    } catch { Write-Report 'WARN' ('Не удалось определить сборку Windows: ' + $_.Exception.Message) }
    try {
        $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
        Write-Report 'INFO' ('Повышенные права: ' + $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    } catch { }
    Write-Report 'INFO' ('Режим PowerShell: ' + $ExecutionContext.SessionState.LanguageMode)

    Section 'Файлы программы и целостность'
    # Hashes below are taken from the distributed production 0.1.24 archive.
    $expectedFiles = @{
        'ui\index.html' = '8c5632d22d2da206e88ea390783414a57242e4c62137b315b38e5b2e31d69486'
        'ui\app.js' = '69fa7a787c105c5986d54480ccc93d83e3bf2005b9f171e703fb1a3d5113c86b'
        'ui\style.css' = 'f2ca74d949c9402334a391a5e33f8af7462aa271b6d9b4b3c504079b5bcf2bd4'
        'ui\themes.css' = 'a068836e15a97723d84eea1ea1ab8424416dad7bf9990d98147e415b6e074420'
        'ui\assets\brand.png' = '39225dbf9f1bb2999ed4e38f5f449c23b4e78a25efaa7052e79e2dd680e104ab'
        'ui\favicon.svg' = 'f398f5dc19f76aa5600db34efc7477b662d1cb9fbe09692384eb911bd2e2776d'
        'ui\mockup.css' = '8d94d1617ce0374d73a54c0ec7b5e67da0a06561ef6c290d30b7ea1bbdb623f5'
        'ui\mechanisms.js' = 'f399a96d0c61c99a10acbbf12a1ec3ebdf4081352edd5092ea9ca2dc049ccd59'
        'ui\i18n.js' = 'b387509b43edab4a1583ba995fab944b02dd9cda9516508d607f43a5b7bd802d'
        'ui\alarms.json' = 'fd51eb220b11dd25dc1a466ee00d1e58c7ef4dc4454f34b364c8be55a25d9ed6'
        'ui\io.js' = 'd661d10fcf7171da34e47d3fcc2df629a672d7cd61d5b718c70abc9d5f9b1e06'
        'ui\manuals.js' = 'e76b86c88f70baf4f30fb7b074592ebc44f3b3a9776b8224600b9046d4a4c1b3'
        'ui\manuals.css' = '10aba3363883a08d665ecc8539e58152b5ce4f124fc6a97d5e076ce8ab44797f'
        'ui\production.js' = 'dcacb69ef7f3d76ff74942a165ba4487fa19414a8a28fca577dd20b8d5e2b93a'
        'ui\production.css' = '4b1a00ec08a80ae650ef6b62b2cad0c19049f30478c7920a0e5004fbb17f4a4d'
        'ui\vendor\marked-17.0.5.umd.js' = '0db7abc826b5ac76f6ed11951ae34074ba50438ce6ea8d52889203779e5cbbad'
        'ui\io_catalog.json' = '02b38f3d0412e411b3a1b6193a9d707130c59d3777da5af228756371e9f6d00a'
        'ui\locales\catalog.json' = '2b9eb5b1e098bc0d08fd0396d658666a9a19bcb335b7bf6ff19494be980908b5'
        'ui\locales\ru.json' = 'b106fa7738291f57cda8ae822a891670fe2160b06357a7c7f30bd1436a623552'
        'ui\locales\en.json' = 'f2996e96cd3044d5e83c665460a7622e115929323b0b778de12fa452d2c22a17'
        'ui\locales\tr.json' = 'af1aea603f53d57d57c681c59b8b8a5045053e7ef02e073d5cac857c4da0dd8f'
        'ui\functionality.js' = '64b9e99f865bb8c2d6215aafab6c17d76941f6774849c6e9f599fd7dcf0ebf3c'
        'ui\functionality.json' = 'fc1ae5576e520395606c5a7d8ffdb835e99d5919269222928791e4a8b26cca5c'
        'ui\performance.json' = '179f4b97d66d4882e58af560a6f7af10e88646764ffe5a2787c3c983eb52c6b1'
        'ui\engineering.json' = '08a47c56c8f9710710cca5c516d3fba3f1b13870ddf752b02b0815050666f077'
        'ui\assets\flags\tr.svg' = 'cebdaba5ab835f735ad63fbef38baef53cfdd0b45d6c3cb79668a82a2b9cea53'
        'ui\assets\flags\ru.svg' = 'da2b589502b2a508f167efd1cfda4f7e33f195727ba3cadd7c8254ada0095052'
        'ui\assets\flags\gb.svg' = 'c21f77159ee7276ed67639536b56b9010c88215294eb46baa320dcde7ec505f9'
        'GurisSCADA_0_1.exe' = 'e0474c00a149b37f8022ecb707c86e9af6206f02e0f8c8dde4787872d5a4b73d'
    }
    foreach ($relative in ($expectedFiles.Keys | Sort-Object)) {
        $path = Join-Path $AppDir $relative
        if (![IO.File]::Exists($path)) { Write-Report 'FAIL' ('Нет обязательного файла: ' + $relative); continue }
        try {
            $hash = Get-Sha256 $path
            if ($hash -eq $expectedFiles[$relative]) { Write-Report 'OK' ($relative + ' — SHA256 совпадает с исходной сборкой.') }
            else { Write-Report 'WARN' ($relative + ' — отличается от версии 0.1.24; SHA256=' + $hash) }
        } catch { Write-Report 'FAIL' ($relative + ' — не удалось прочитать: ' + $_.Exception.Message) }
    }
    $exePath = Join-Path $AppDir 'GurisSCADA_0_1.exe'
    if ([IO.File]::Exists($exePath)) {
        try {
            $bytes = [IO.File]::ReadAllBytes($exePath)
            if (($bytes.Length -lt 64) -or ([BitConverter]::ToUInt16($bytes, 0) -ne 0x5a4d)) { throw 'Нет заголовка MZ' }
            $pe = [BitConverter]::ToInt32($bytes, 0x3c)
            if (($pe -lt 0) -or ($pe -gt ($bytes.Length - 26)) -or ([BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550)) { throw 'Повреждён заголовок PE' }
            $machine = [BitConverter]::ToUInt16($bytes, $pe + 4)
            $magic = [BitConverter]::ToUInt16($bytes, $pe + 24)
            if (($machine -eq 0x8664) -and ($magic -eq 0x20b)) { Write-Report 'OK' 'EXE распознан как PE32+ AMD64 (x64).' }
            else { Write-Report 'WARN' ('Неожиданный формат EXE: machine=0x' + $machine.ToString('X') + ', magic=0x' + $magic.ToString('X')) }
        } catch { Write-Report 'FAIL' ('Некорректный EXE: ' + $_.Exception.Message) }
        try {
            $zone = [IO.File]::ReadAllText($exePath + ':Zone.Identifier')
            $match = [regex]::Match($zone, 'ZoneId\s*=\s*(\d+)')
            if ($match.Success -and ([int]$match.Groups[1].Value -ge 3)) {
                Write-Report 'WARN' ('У EXE есть метка скачивания ZoneId=' + $match.Groups[1].Value + '. Это возможный фактор проверки SmartScreen, но не доказательство блокировки.')
            }
        } catch { }
    }
    if ($AppDir -match '(?i)\\(temp|temporary internet files)\\|\.zip\\|\\content\.outlook\\') {
        Write-Report 'WARN' 'Папка похожа на временную распаковку. Распакуйте весь архив в обычную папку.'
    }

    Section 'Доступ на запись'
    foreach ($relative in @('', 'logs', 'edge_profile')) {
        $path = $AppDir
        if ($relative) { $path = Join-Path $AppDir $relative }
        if (![IO.Directory]::Exists($path)) {
            Write-Report 'INFO' ('Папки пока нет: ' + $path + '. Для её создания нужен доступ на запись в папку SCADA.')
            continue
        }
        try {
            if (Test-WriteFolder $path) { Write-Report 'OK' ('Создание и удаление временного файла доступны: ' + $path) }
        } catch { Write-Report 'FAIL' ('Нет записи в ' + $path + ': ' + $_.Exception.Message) }
    }

    Section 'Microsoft Edge'
    $edgePaths = @()
    foreach ($var in @('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA')) {
        $root = [Environment]::GetEnvironmentVariable($var)
        if ($root) { $edgePaths += (Join-Path $root 'Microsoft\Edge\Application\msedge.exe') }
    }
    $edgeFound = $false
    foreach ($path in ($edgePaths | Select-Object -Unique)) {
        if ([IO.File]::Exists($path)) {
            $edgeFound = $true
            try {
                $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($path)
                Write-Report 'OK' ('Edge: ' + $path + '; версия ' + $version.FileVersion)
                # UI uses Element.replaceChildren(), implemented in Chromium/Edge 86.
                if ($version.FileMajorPart -lt 86) { Write-Report 'WARN' 'Edge старше версии 86: часть JavaScript интерфейса не поддерживается. Нужен более новый Edge.' }
            } catch { Write-Report 'WARN' ('Edge найден, но версия не прочитана: ' + $_.Exception.Message) }
        }
    }
    if (!$edgeFound) { Write-Report 'FAIL' 'Microsoft Edge не найден в местах, которые проверяет SCADA. Для штатного отдельного окна нужен Edge (Chromium).' }
    try {
        $choice = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice'
        Write-Report 'INFO' ('Браузер по умолчанию (резервный запуск): ' + $choice.ProgId)
    } catch { Write-Report 'INFO' 'Назначение браузера по умолчанию не прочитано.' }
    Write-Report 'INFO' 'Edge WebView2 Runtime отдельно не используется: EXE запускает обычный msedge.exe.'

    Section 'Системные DLL и функции из таблицы импорта EXE'
    # Do not check API-set contracts by file existence: the Windows loader resolves them.
    $imports = @{
        'WS2_32.dll' = @('WSACleanup', 'WSAGetLastError', 'WSAStartup', 'accept', 'bind', 'closesocket', 'connect', 'getsockname', 'getsockopt', 'htonl', 'htons', 'inet_pton', 'ioctlsocket', 'listen', 'ntohl', 'ntohs', 'recv', 'select', 'send', 'socket')
        'SHELL32.dll' = @('CommandLineToArgvW', 'ShellExecuteW', 'Shell_NotifyIconW')
        'USER32.dll' = @('AppendMenuW', 'CreatePopupMenu', 'CreateWindowExW', 'DefWindowProcW', 'DestroyMenu', 'DestroyWindow', 'DispatchMessageW', 'EnumWindows', 'FindWindowW', 'GetClassNameW', 'GetCursorPos', 'GetMessageW', 'GetWindowTextW', 'GetWindowThreadProcessId', 'IsWindow', 'IsWindowVisible', 'LoadIconW', 'MessageBoxW', 'PostMessageW', 'PostQuitMessage', 'RegisterClassW', 'SetForegroundWindow', 'SetTimer', 'ShowWindow', 'TrackPopupMenu', 'TranslateMessage')
        'bcrypt.dll' = @('BCryptGenRandom')
        'api-ms-win-crt-convert-l1-1-0.dll' = @('strtod')
        'api-ms-win-crt-heap-l1-1-0.dll' = @('_set_new_mode', 'calloc', 'free', 'malloc')
        'api-ms-win-crt-private-l1-1-0.dll' = @('__C_specific_handler', 'memchr', 'strchr', 'strstr', 'wcsrchr', 'wcsstr')
        'api-ms-win-crt-runtime-l1-1-0.dll' = @('__p___argc', '__p___wargv', '__p__wcmdln', '_cexit', '_configure_wide_argv', '_crt_atexit', '_errno', '_exit', '_fpreset', '_initialize_wide_environment', '_initterm', '_set_app_type', '_set_invalid_parameter_handler', 'abort', 'exit', 'signal')
        'api-ms-win-crt-stdio-l1-1-0.dll' = @('__acrt_iob_func', '__p__commode', '__p__fmode', '__stdio_common_vfprintf', '__stdio_common_vsprintf', '__stdio_common_vsscanf', '__stdio_common_vswprintf', '_wfopen', 'fclose', 'fflush', 'fputc', 'fread', 'fseek', 'ftell', 'fwrite', 'rewind')
        'api-ms-win-crt-string-l1-1-0.dll' = @('_wcsicmp', 'strcmp', 'strlen', 'wcscmp', 'wcscpy', 'wcslen')
        'api-ms-win-crt-time-l1-1-0.dll' = @('_gmtime64_s', '_localtime64_s', '_time64', 'strftime')
        'KERNEL32.dll' = @('CloseHandle', 'CreateDirectoryW', 'CreateMutexW', 'CreateProcessW', 'CreateThread', 'DeleteCriticalSection', 'EnterCriticalSection', 'GetCommandLineW', 'GetCurrentProcessId', 'GetEnvironmentVariableW', 'GetExitCodeProcess', 'GetFileAttributesW', 'GetLastError', 'GetModuleFileNameW', 'GetStartupInfoW', 'GetTempPathW', 'GetTickCount64', 'InitializeCriticalSection', 'LeaveCriticalSection', 'LocalFree', 'MultiByteToWideChar', 'OpenProcess', 'QueryFullProcessImageNameW', 'SetUnhandledExceptionFilter', 'Sleep', 'VirtualProtect', 'VirtualQuery', 'WaitForSingleObject', 'WideCharToMultiByte')
        'api-ms-win-crt-math-l1-1-0.dll' = @('__setusermatherr', 'frexp')
        'api-ms-win-crt-environment-l1-1-0.dll' = @('__p__wenviron')
    }
    if (($nativeArch -eq 'AMD64') -and ([IntPtr]::Size -eq 8)) {
        try {
            if (!('GurisScadaDependencyProbe' -as [type])) {
                Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class GurisScadaDependencyProbe {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, ExactSpelling=true)]
    private static extern IntPtr LoadLibraryExW(string name, IntPtr file, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Ansi, SetLastError=true, ExactSpelling=true)]
    private static extern IntPtr GetProcAddress(IntPtr module, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
    private static extern uint GetModuleFileNameW(IntPtr module, StringBuilder text, int size);
    [DllImport("kernel32.dll")]
    private static extern uint SetErrorMode(uint flags);
    public static string Probe(string name, string[] exports) {
        IntPtr module = IntPtr.Zero;
        uint previous = SetErrorMode(0x8001);
        try {
            // Search only Windows system DLLs; never load application-local DLLs.
            module = LoadLibraryExW(name, IntPtr.Zero, 0x800);
            int error = Marshal.GetLastWin32Error();
            if (module == IntPtr.Zero && error == 87) {
                module = LoadLibraryExW(Path.Combine(Environment.SystemDirectory, name), IntPtr.Zero, 0);
                error = Marshal.GetLastWin32Error();
            }
            if (module == IntPtr.Zero) return "FAIL LoadLibrary error=" + error + ": " + new Win32Exception(error).Message;
            foreach (string entry in exports) {
                if (GetProcAddress(module, entry) == IntPtr.Zero) return "FAIL missing export: " + entry;
            }
            StringBuilder location = new StringBuilder(2048);
            GetModuleFileNameW(module, location, location.Capacity);
            return "OK " + exports.Length + " functions; " + location.ToString();
        } finally {
            if (module != IntPtr.Zero) FreeLibrary(module);
            SetErrorMode(previous);
        }
    }
}
'@ -ErrorAction Stop
            }
            foreach ($dll in ($imports.Keys | Sort-Object)) {
                $answer = [GurisScadaDependencyProbe]::Probe($dll, [string[]]$imports[$dll])
                if ($answer.StartsWith('OK ')) { Write-Report 'OK' ($dll + ': ' + $answer.Substring(3)) }
                else { Write-Report 'FAIL' ($dll + ': ' + $answer) }
            }
        } catch { Write-Report 'WARN' ('Загрузка DLL не проверена: ' + $_.Exception.Message + '. Возможна блокировка Add-Type политикой PowerShell.') }
    } else { Write-Report 'INFO' 'Проверка DLL x64 пропущена: процесс или ОС имеют другую архитектуру.' }
    Write-Report 'INFO' 'Отдельные Python/PyQt/Node.js/.NET/TwinCAT/TcAdsDll.dll/vcruntime140.dll/msvcp140.dll сборке не требуются.'

    Section 'Локальный интерфейс 127.0.0.1'
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Parse('127.0.0.1'), 0)
        $listener.Start()
        $localTest = Test-Tcp '127.0.0.1' $listener.LocalEndpoint.Port 2000
        if (!$localTest.Ok) { throw $localTest.Error }
        $accepted = $listener.AcceptTcpClient(); $accepted.Close()
        Write-Report 'OK' 'Можно открыть случайный локальный порт и подключиться к нему по 127.0.0.1.'
    } catch { Write-Report 'FAIL' ('Не работает локальное TCP-соединение: ' + $_.Exception.Message) }
    finally { if ($null -ne $listener) { $listener.Stop() } }
    try {
        $running = @(Get-SystemObjects 'Win32_Process' "Name='GurisSCADA_0_1.exe'")
        if ($running.Count -eq 0) { Write-Report 'INFO' 'Процесс SCADA сейчас не найден. Диагностика его не запускает.' }
        else {
            $lines = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p tcp 2>$null)
            foreach ($process in $running) {
                Write-Report 'INFO' ('SCADA уже запущена: PID=' + $process.ProcessId + '; EXE=' + $process.ExecutablePath)
                foreach ($line in $lines) {
                    $m = [regex]::Match($line, '^\s*TCP\s+127\.0\.0\.1:(\d+)\s+0\.0\.0\.0:0\s+\S+\s+(\d+)\s*$')
                    if (!$m.Success -or ([uint32]$m.Groups[2].Value -ne [uint32]$process.ProcessId)) { continue }
                    $request = $null; $response = $null
                    try {
                        $url = 'http://127.0.0.1:' + $m.Groups[1].Value + '/style.css'
                        $request = [Net.HttpWebRequest]::Create($url)
                        $request.Proxy = $null; $request.Timeout = 2000; $request.ReadWriteTimeout = 2000; $request.AllowAutoRedirect = $false
                        $response = $request.GetResponse()
                        if ([int]$response.StatusCode -ne 200) { throw ('HTTP ' + [int]$response.StatusCode) }
                        Write-Report 'OK' ('HTTP работающей SCADA отвечает: ' + $url + '; Content-Type=' + $response.ContentType)
                    } catch { Write-Report 'WARN' ('Локальный HTTP работающей SCADA: ' + $_.Exception.Message) }
                    finally { if ($null -ne $response) { $response.Close() }; if ($null -ne $request) { $request.Abort() } }
                }
            }
        }
    } catch { Write-Report 'INFO' ('Работающий процесс не проверен: ' + $_.Exception.Message) }

    Section 'Сеть до станка (только TCP, без команд ADS)'
    $plcIP = '192.168.1.250'; $netID = '5.105.198.193.1.1'; $adsPort = 801; $enabled = 1
    $configValid = $true
    $configPath = Join-Path $AppDir 'connection.json'
    if ([IO.File]::Exists($configPath)) {
        try {
            $raw = [IO.File]::ReadAllText($configPath)
            if (Get-Command ConvertFrom-Json -ErrorAction SilentlyContinue) {
                $config = ConvertFrom-Json $raw
                foreach ($key in @('ip', 'netId', 'port', 'enabled')) {
                    if ($null -eq $config.PSObject.Properties[$key]) { throw ('В connection.json нет поля ' + $key) }
                }
                $plcIP = [string]$config.ip; $netID = [string]$config.netId; $adsPort = [int]$config.port; $enabled = [int]$config.enabled
            } else {
                # Only the four scalar fields used by this application; PS 2.0 fallback.
                $ipMatch = [regex]::Match($raw, '"ip"\s*:\s*"([0-9.]+)"')
                $netMatch = [regex]::Match($raw, '"netId"\s*:\s*"([0-9.]+)"')
                $portMatch = [regex]::Match($raw, '"port"\s*:\s*(\d+)')
                $enMatch = [regex]::Match($raw, '"enabled"\s*:\s*([01])\b')
                if (!$ipMatch.Success -or !$netMatch.Success -or !$portMatch.Success -or !$enMatch.Success) { throw 'Не распознаны четыре поля connection.json' }
                $plcIP = $ipMatch.Groups[1].Value; $netID = $netMatch.Groups[1].Value
                $adsPort = [int]$portMatch.Groups[1].Value; $enabled = [int]$enMatch.Groups[1].Value
                Write-Report 'INFO' 'PowerShell 2.0: connection.json прочитан ограниченным парсером, полная корректность JSON не проверялась.'
            }
            Write-Report 'INFO' 'Параметры прочитаны из connection.json.'
        } catch { $configValid = $false; Write-Report 'FAIL' ('Не удалось разобрать connection.json: ' + $_.Exception.Message) }
    } else { Write-Report 'INFO' 'connection.json отсутствует: используются заводские значения этой SCADA. Файл не является обязательным для первого запуска.' }
    $ipObject = $null
    if (![Net.IPAddress]::TryParse($plcIP, [ref]$ipObject) -or ($plcIP -notmatch '^\d{1,3}(\.\d{1,3}){3}$')) {
        $configValid = $false; Write-Report 'FAIL' 'В настройках некорректный IPv4-адрес ПЛК.'
    }
    $parts = @($netID.Split('.'))
    $validNetID = ($parts.Count -eq 6)
    foreach ($part in $parts) { if (($part -notmatch '^\d{1,3}$') -or ([int]$part -gt 255)) { $validNetID = $false } }
    if (!$validNetID -or $netID -eq '0.0.0.0.0.0' -or $adsPort -lt 1 -or $adsPort -gt 65535 -or ($enabled -ne 0 -and $enabled -ne 1)) {
        $configValid = $false; Write-Report 'FAIL' 'Некорректный AMS Net ID, порт ADS или флаг enabled.'
    }
    Write-Report 'INFO' ('IP=' + $plcIP + '; AMS Net ID=' + $netID + '; порт ADS=' + $adsPort + '; TCP=48898; enabled=' + $enabled)
    if ($enabled -eq 0) { Write-Report 'WARN' 'Соединение с ПЛК отключено в connection.json. Это не мешает запуску окна.' }
    try {
        foreach ($adapter in @(Get-SystemObjects 'Win32_NetworkAdapterConfiguration' 'IPEnabled=True')) {
            $ipv4 = @($adapter.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })
            Write-Report 'INFO' ('Адаптер: ' + $adapter.Description + '; IPv4=' + ($ipv4 -join ', ') + '; шлюз=' + ($adapter.DefaultIPGateway -join ', '))
        }
    } catch { Write-Report 'INFO' ('Адаптеры не прочитаны: ' + $_.Exception.Message) }
    if ($configValid) {
        $tcp = Test-Tcp $plcIP 48898 3000
        if ($tcp.Ok) {
            Write-Report 'OK' ('TCP ' + $plcIP + ':48898 доступен; локальный IP соединения=' + $tcp.LocalIP)
            Write-Report 'INFO' ('Эта SCADA использует исходный AMS Net ID ' + $tcp.LocalIP + '.1.1. Наличие разрешённого маршрута на ПЛК этой проверкой не подтверждается.')
        } else { Write-Report 'WARN' ('TCP ' + $plcIP + ':48898 недоступен: ' + $tcp.Error + '. Это проблема связи; окно SCADA должно открываться и без ПЛК.') }
    } else { Write-Report 'INFO' 'Сетевая проверка пропущена из-за некорректных настроек.' }

    Section 'Журнал последнего запуска SCADA'
    try {
        $startupLogs = @(Get-ChildItem -LiteralPath (Join-Path $AppDir 'logs') -Filter 'SCADA_startup_*.log' -ErrorAction Stop | Where-Object { !$_.PSIsContainer } | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
        if ($startupLogs.Count) {
            Write-Report 'INFO' ('Последний журнал: ' + $startupLogs[0].FullName)
            $startupText = [IO.File]::ReadAllText($startupLogs[0].FullName)
            if ($startupText.Length -gt 18000) { $startupText = $startupText.Substring($startupText.Length - 18000) }
            Write-Report 'INFO' $startupText
        } else { Write-Report 'INFO' 'Журнал запуска ещё не найден. Запустите новую SCADA, затем повторите диагностику.' }
    } catch { Write-Report 'INFO' ('Журнал запуска не прочитан: ' + $_.Exception.Message) }
    Section 'Политики Edge, влияющие на профиль и графику'
    foreach ($policyPath in @('HKLM:\SOFTWARE\Policies\Microsoft\Edge', 'HKCU:\SOFTWARE\Policies\Microsoft\Edge')) {
        try {
            $policies = Get-ItemProperty -LiteralPath $policyPath -ErrorAction Stop
            foreach ($key in @('UserDataDir', 'HardwareAccelerationModeEnabled')) {
                if ($null -ne $policies.PSObject.Properties[$key]) { Write-Report 'INFO' ($policyPath + ': ' + $key + '=' + $policies.$key) }
            }
        } catch { Write-Report 'INFO' ($policyPath + ': указанные политики не прочитаны или не заданы.') }
    }

    Section 'Недавние ошибки запуска и блокировки'
    $since = (Get-Date).AddDays(-2)
    foreach ($logName in @('Application', 'Microsoft-Windows-AppLocker/EXE and DLL', 'Microsoft-Windows-CodeIntegrity/Operational', 'Microsoft-Windows-Windows Defender/Operational')) {
        try {
            $events = @(Get-WinEvent -FilterHashtable @{ LogName = $logName; StartTime = $since } -MaxEvents 200 -ErrorAction Stop)
            $matching = @($events | Where-Object { $_.Message -match '(?i)GurisSCADA|GurisSCADA_0_1|msedge\.exe|api-ms-win-crt|ucrtbase\.dll' } | Select-Object -First 8)
            if ($matching.Count -eq 0) { Write-Report 'INFO' ($logName + ': совпадений в последних 200 событиях за 48 часов нет. Это не исключает блокировку.') }
            foreach ($event in $matching) {
                $message = [string]$event.Message
                if ($message.Length -gt 3000) { $message = $message.Substring(0, 3000) + ' ...' }
                Write-Report 'INFO' ('Событие ' + $logName + '; ' + $event.TimeCreated + '; ID=' + $event.Id + '; Provider=' + $event.ProviderName + "`r`n" + $message)
            }
        } catch { Write-Report 'INFO' ($logName + ': журнал недоступен, пуст или нет прав на чтение. ' + $_.Exception.Message) }
    }

    Section 'Результат'
    Write-Report 'INFO' ('Проблем: ' + $script:failures + '; предупреждений: ' + $script:warnings + '.')
    if ($script:failures -eq 0) { Write-Report 'INFO' 'Явных проблем в выполненных проверках не выявлено. Запуск окна, работу браузера и политику защиты это не гарантирует; SCADA не запускалась.' }
    else { Write-Report 'INFO' 'Строки [FAIL] указывают на найденные проблемы. Причину отсутствия окна уточняйте по всем разделам, включая события.' }
    Write-Report 'INFO' 'Пришлите этот TXT и точный текст/фото ошибки запуска. Отчёт никуда не отправляется автоматически.'
} catch {
    Write-Report 'FAIL' ('Непредвиденная ошибка проверки: ' + $_.Exception.Message + "`r`n" + $_.InvocationInfo.PositionMessage)
} finally {
    if ($null -ne $script:writer) { $script:writer.Close() }
}
Write-Host "`r`nReport saved: $reportPath"
exit 0
