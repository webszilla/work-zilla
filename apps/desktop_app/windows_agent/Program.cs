using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WorkZilla.WindowsAgent;

internal static class Program
{
    private const int DefaultScreenshotIntervalSeconds = 300;
    private const int MinimumScreenshotIntervalSeconds = 15;
    private const int HeartbeatIntervalSeconds = 60;
    private static readonly SemaphoreSlim CaptureLock = new(1, 1);

    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        var options = AgentOptions.FromArgs(args);
        var config = AgentConfig.Load();
        if (config == null)
        {
            Console.Error.WriteLine("Missing config. Expected WorkZone\\agent_config.json or work-zilla-agent settings.json.");
            return 1;
        }

        Logger.Init();
        Logger.Info("Agent starting.");

        var state = AgentState.Load();
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        var runner = new AgentRunner(httpClient, config, state, options);
        await runner.InitializeAsync();

        if (options.InstallStartup)
        {
            StartupManager.Install();
            Logger.Info("Startup entry installed.");
        }
        if (options.RemoveStartup)
        {
            StartupManager.Remove();
            Logger.Info("Startup entry removed.");
        }

        if (options.Tray)
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new TrayAppContext(runner));
            return 0;
        }

        if (options.CaptureOnce)
        {
            await runner.CaptureOnceAsync();
            return 0;
        }

        var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        await runner.RunAsync(cts.Token);
        return 0;
    }

    private static string CaptureScreenshot()
    {
        var bounds = SystemInformation.VirtualScreen;
        using var bitmap = new Bitmap(bounds.Width, bounds.Height);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        }

        var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var fileName = $"screenshot-{timestamp}-{Guid.NewGuid():N}.png";
        var path = Path.Combine(Path.GetTempPath(), fileName);
        bitmap.Save(path, ImageFormat.Png);
        return path;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static string GetActiveWindowTitle()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero)
        {
            return "";
        }
        var sb = new System.Text.StringBuilder(256);
        _ = GetWindowText(handle, sb, sb.Capacity);
        return sb.ToString();
    }

    private static string GetActiveWindowAppName()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero)
        {
            return "";
        }
        _ = GetWindowThreadProcessId(handle, out var pid);
        if (pid == 0)
        {
            return "";
        }
        try
        {
            using var process = Process.GetProcessById((int)pid);
            return process.ProcessName ?? "";
        }
        catch
        {
            return "";
        }
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    private sealed class OrgSettingsResponse
    {
        [JsonPropertyName("screenshot_interval_seconds")]
        public int ScreenshotIntervalSeconds { get; set; }
    }

    private sealed class EmployeeRegisterResponse
    {
        [JsonPropertyName("employee_id")]
        public int? EmployeeId { get; set; }

        [JsonPropertyName("data")]
        public EmployeeRegisterData? Data { get; set; }
    }

    private sealed class EmployeeRegisterData
    {
        [JsonPropertyName("id")]
        public int? Id { get; set; }
    }

    private sealed class AgentOptions
    {
        public bool CaptureOnce { get; init; }
        public int IntervalSeconds { get; init; }
        public bool Tray { get; init; }
        public bool InstallStartup { get; init; }
        public bool RemoveStartup { get; init; }

        public static AgentOptions FromArgs(string[] args)
        {
            var options = new AgentOptions();
            for (var i = 0; i < args.Length; i++)
            {
                var arg = args[i].ToLowerInvariant();
                if (arg == "--once")
                {
                    options.CaptureOnce = true;
                }
                else if (arg == "--tray")
                {
                    options.Tray = true;
                }
                else if (arg == "--startup-install")
                {
                    options.InstallStartup = true;
                }
                else if (arg == "--startup-remove")
                {
                    options.RemoveStartup = true;
                }
                else if (arg == "--interval" && i + 1 < args.Length && int.TryParse(args[i + 1], out var seconds))
                {
                    options.IntervalSeconds = seconds;
                    i++;
                }
            }
            return options;
        }
    }

    private sealed class AgentConfig
    {
        public string ServerUrl { get; init; } = "http://127.0.0.1:8000";
        public string CompanyKey { get; init; } = "";
        public string DeviceId { get; init; } = "";
        public string? EmployeeName { get; init; }

        public static AgentConfig? Load()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var configPath = Path.Combine(appData, "WorkZone", "agent_config.json");
            if (File.Exists(configPath))
            {
                var json = File.ReadAllText(configPath);
                var raw = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (raw != null)
                {
                    var serverUrl = TryReadServerUrl(appData) ?? raw.GetValueOrDefault("server_url") ?? "http://127.0.0.1:8000";
                    return new AgentConfig
                    {
                        ServerUrl = serverUrl,
                        CompanyKey = raw.GetValueOrDefault("company_key") ?? "",
                        DeviceId = raw.GetValueOrDefault("device_id") ?? raw.GetValueOrDefault("employee_code") ?? "",
                        EmployeeName = raw.GetValueOrDefault("employee_name")
                    };
                }
            }

            var settingsPath = Path.Combine(appData, "work-zilla-agent", "settings.json");
            if (File.Exists(settingsPath))
            {
                var json = File.ReadAllText(settingsPath);
                var settings = JsonSerializer.Deserialize<SettingsJson>(json);
                if (settings != null && !string.IsNullOrWhiteSpace(settings.CompanyKey))
                {
                    return new AgentConfig
                    {
                        ServerUrl = settings.ServerUrl ?? "http://127.0.0.1:8000",
                        CompanyKey = settings.CompanyKey ?? settings.OrgId ?? "",
                        DeviceId = settings.DeviceId ?? "",
                        EmployeeName = settings.EmployeeName
                    };
                }
            }

            return null;
        }

        private static string? TryReadServerUrl(string appData)
        {
            var settingsPath = Path.Combine(appData, "work-zilla-agent", "settings.json");
            if (!File.Exists(settingsPath))
            {
                return null;
            }
            try
            {
                var json = File.ReadAllText(settingsPath);
                var settings = JsonSerializer.Deserialize<SettingsJson>(json);
                return settings?.ServerUrl;
            }
            catch
            {
                return null;
            }
        }

        private sealed class SettingsJson
        {
            [JsonPropertyName("serverUrl")]
            public string? ServerUrl { get; set; }

            [JsonPropertyName("companyKey")]
            public string? CompanyKey { get; set; }

            [JsonPropertyName("orgId")]
            public string? OrgId { get; set; }

            [JsonPropertyName("deviceId")]
            public string? DeviceId { get; set; }

            [JsonPropertyName("employeeName")]
            public string? EmployeeName { get; set; }
        }
    }

    private sealed class AgentState
    {
        public int? EmployeeId { get; set; }

        public static AgentState Load()
        {
            var path = GetStatePath();
            if (!File.Exists(path))
            {
                return new AgentState();
            }
            try
            {
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<AgentState>(json) ?? new AgentState();
            }
            catch
            {
                return new AgentState();
            }
        }

        public static void Save(AgentState state)
        {
            var path = GetStatePath();
            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
        }

        private static string GetStatePath()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            return Path.Combine(appData, "WorkZillaAgent", "agent_state.json");
        }
    }

    private sealed class AgentRunner
    {
        private readonly HttpClient _client;
        private readonly AgentConfig _config;
        private readonly AgentState _state;
        private readonly AgentOptions _options;
        private int _intervalSeconds = DefaultScreenshotIntervalSeconds;
        private CancellationTokenSource? _cts;
        private Task? _heartbeatTask;
        private Task? _captureTask;

        public AgentRunner(HttpClient client, AgentConfig config, AgentState state, AgentOptions options)
        {
            _client = client;
            _config = config;
            _state = state;
            _options = options;
        }

        public async Task InitializeAsync()
        {
            if (_state.EmployeeId == null)
            {
                _state.EmployeeId = await RegisterEmployeeAsync(_client, _config);
                AgentState.Save(_state);
                Logger.Info($"Registered employee: {_state.EmployeeId}");
            }

            var intervalSeconds = _options.IntervalSeconds > 0
                ? _options.IntervalSeconds
                : await FetchScreenshotIntervalAsync(_client, _config, _state) ?? DefaultScreenshotIntervalSeconds;
            _intervalSeconds = Math.Max(MinimumScreenshotIntervalSeconds, intervalSeconds);
            Logger.Info($"Screenshot interval: {_intervalSeconds}s");
        }

        public async Task RunAsync(CancellationToken token)
        {
            _heartbeatTask = RunHeartbeatLoopAsync(token);
            _captureTask = RunCaptureLoopAsync(token);
            await Task.WhenAll(_heartbeatTask, _captureTask);
        }

        public void Start()
        {
            if (_cts != null)
            {
                return;
            }
            _cts = new CancellationTokenSource();
            _heartbeatTask = RunHeartbeatLoopAsync(_cts.Token);
            _captureTask = RunCaptureLoopAsync(_cts.Token);
            Logger.Info("Runner started.");
        }

        public void Stop()
        {
            if (_cts == null)
            {
                return;
            }
            _cts.Cancel();
            _cts = null;
            Logger.Info("Runner stopped.");
        }

        public async Task CaptureOnceAsync()
        {
            await CaptureAndUploadAsync(_client, _config, _state, "manual");
        }

        private async Task RunHeartbeatLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                await SendHeartbeatAsync(_client, _config, _state);
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(HeartbeatIntervalSeconds), token);
                }
                catch (TaskCanceledException)
                {
                    return;
                }
            }
        }

        private async Task RunCaptureLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                await CaptureAndUploadAsync(_client, _config, _state, "scheduled");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), token);
                }
                catch (TaskCanceledException)
                {
                    return;
                }
            }
        }
    }

    private sealed class TrayAppContext : ApplicationContext
    {
        private readonly NotifyIcon _trayIcon;
        private readonly AgentRunner _runner;

        public TrayAppContext(AgentRunner runner)
        {
            _runner = runner;
            _runner.Start();

            var menu = new ContextMenuStrip();
            menu.Items.Add("Capture Now", null, async (_, _) => await _runner.CaptureOnceAsync());
            menu.Items.Add("Stop", null, (_, _) => _runner.Stop());
            menu.Items.Add("Start", null, (_, _) => _runner.Start());
            menu.Items.Add("Exit", null, (_, _) =>
            {
                _runner.Stop();
                _trayIcon.Visible = false;
                ExitThread();
            });

            _trayIcon = new NotifyIcon
            {
                Text = "Work Zilla Agent",
                Icon = SystemIcons.Application,
                Visible = true,
                ContextMenuStrip = menu
            };
        }
    }

    private static async Task<int?> FetchScreenshotIntervalAsync(HttpClient client, AgentConfig config, AgentState state)
    {
        if (string.IsNullOrWhiteSpace(config.CompanyKey))
        {
            return null;
        }

        var baseUrl = config.ServerUrl.TrimEnd('/');
        var uri = $"{baseUrl}/api/org/settings?company_key={Uri.EscapeDataString(config.CompanyKey)}";
        if (!string.IsNullOrWhiteSpace(config.DeviceId))
        {
            uri += $"&device_id={Uri.EscapeDataString(config.DeviceId)}";
        }
        if (state.EmployeeId != null)
        {
            uri += $"&employee={state.EmployeeId}";
        }

        try
        {
            var response = await client.GetAsync(uri);
            if (!response.IsSuccessStatusCode)
            {
                Logger.Warn($"Org settings failed: {response.StatusCode}");
                return null;
            }
            var body = await response.Content.ReadAsStringAsync();
            var settings = JsonSerializer.Deserialize<OrgSettingsResponse>(body);
            return settings?.ScreenshotIntervalSeconds;
        }
        catch (Exception ex)
        {
            Logger.Error("Org settings error", ex);
            return null;
        }
    }

    private static async Task SendHeartbeatAsync(HttpClient client, AgentConfig config, AgentState state)
    {
        if (string.IsNullOrWhiteSpace(config.CompanyKey) || state.EmployeeId == null)
        {
            return;
        }

        var baseUrl = config.ServerUrl.TrimEnd('/');
        var payload = new Dictionary<string, object?>
        {
            ["company_key"] = config.CompanyKey,
            ["device_id"] = config.DeviceId,
            ["employee_id"] = state.EmployeeId,
            ["app_name"] = GetActiveWindowAppName(),
            ["window_title"] = GetActiveWindowTitle()
        };
        var content = new StringContent(JsonSerializer.Serialize(payload));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        try
        {
            await client.PostAsync($"{baseUrl}/api/monitor/heartbeat", content);
        }
        catch (Exception ex)
        {
            Logger.Error("Heartbeat failed", ex);
        }
    }

    private static async Task CaptureAndUploadAsync(HttpClient client, AgentConfig config, AgentState state, string reason)
    {
        if (string.IsNullOrWhiteSpace(config.CompanyKey) || state.EmployeeId == null)
        {
            return;
        }

        await CaptureLock.WaitAsync();
        string? filePath = null;
        try
        {
            filePath = CaptureScreenshot();
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return;
            }

            var baseUrl = config.ServerUrl.TrimEnd('/');
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(state.EmployeeId.Value.ToString()), "employee");
            if (!string.IsNullOrWhiteSpace(config.DeviceId))
            {
                form.Add(new StringContent(config.DeviceId), "device_id");
            }
            form.Add(new StringContent(config.CompanyKey), "company_key");
            form.Add(new StringContent(Environment.MachineName), "pc_name");
            form.Add(new StringContent(GetActiveWindowAppName()), "app_name");
            form.Add(new StringContent(GetActiveWindowTitle()), "window_title");

            await using var fs = File.OpenRead(filePath);
            var fileContent = new StreamContent(fs);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(fileContent, "image", Path.GetFileName(filePath));

            var response = await client.PostAsync($"{baseUrl}/api/screenshot/upload", form);
            if (!response.IsSuccessStatusCode)
            {
                Logger.Warn($"Screenshot upload failed: {response.StatusCode}");
                return;
            }
            Logger.Info($"Screenshot uploaded: {Path.GetFileName(filePath)}");
        }
        catch (Exception ex)
        {
            Logger.Error("Screenshot capture failed", ex);
        }
        finally
        {
            CaptureLock.Release();
            if (!string.IsNullOrWhiteSpace(filePath))
            {
                TryDelete(filePath);
            }
        }
    }

    private static async Task<int?> RegisterEmployeeAsync(HttpClient client, AgentConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.CompanyKey))
        {
            return null;
        }

        var payload = new Dictionary<string, object?>
        {
            ["company_key"] = config.CompanyKey,
            ["employee_code"] = config.DeviceId,
            ["device_id"] = config.DeviceId,
            ["pc_name"] = Environment.MachineName,
            ["name"] = config.EmployeeName ?? "Employee"
        };

        var content = new StringContent(JsonSerializer.Serialize(payload));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        try
        {
            var baseUrl = config.ServerUrl.TrimEnd('/');
            var response = await client.PostAsync($"{baseUrl}/api/employee/register", content);
            if (!response.IsSuccessStatusCode)
            {
                Logger.Warn($"Register employee failed: {response.StatusCode}");
                return null;
            }

            var body = await response.Content.ReadAsStringAsync();
            var data = JsonSerializer.Deserialize<EmployeeRegisterResponse>(body);
            return data?.EmployeeId ?? data?.Data?.Id;
        }
        catch (Exception ex)
        {
            Logger.Error("Register employee error", ex);
            return null;
        }
    }

    private static class StartupManager
    {
        public static void Install()
        {
            var appName = "WorkZillaAgent";
            var exePath = Process.GetCurrentProcess().MainModule?.FileName ?? "";
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run", true);
            key?.SetValue(appName, $"\"{exePath}\" --tray");
        }

        public static void Remove()
        {
            var appName = "WorkZillaAgent";
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run", true);
            key?.DeleteValue(appName, false);
        }
    }

    private static class Logger
    {
        private static readonly object LockObj = new();
        private static string? _logPath;

        public static void Init()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var logDir = Path.Combine(appData, "WorkZillaAgent", "logs");
            Directory.CreateDirectory(logDir);
            _logPath = Path.Combine(logDir, "agent.log");
        }

        public static void Info(string message) => Write("INFO", message);
        public static void Warn(string message) => Write("WARN", message);
        public static void Error(string message, Exception ex) => Write("ERROR", $"{message} :: {ex.Message}");

        private static void Write(string level, string message)
        {
            if (_logPath == null) return;
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}{Environment.NewLine}";
            lock (LockObj)
            {
                File.AppendAllText(_logPath, line);
            }
        }
    }
}
